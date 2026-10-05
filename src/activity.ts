import { i18n } from './i18n'

export interface JoinCounts {
  windowDays: number
  providers: Map<string, number>
}
export interface RecentJoin {
  handle: string
  providerId: string
  providerName: string
  joinedAt: string
}

// Polling budget against the server's default admission limits (server/src/env.ts):
// RATE_LIMIT_PER_MINUTE=120 per client IP and GLOBAL_RATE_LIMIT_PER_MINUTE=1200 per process,
// shared by both endpoints. Each active tab spends one counts request per page load plus
// 60_000 / POLL_MS recent requests per minute: ~60 tabs behind one shared IP, ~600 concurrent
// active visitors process-wide. Hidden, unfocused and idle tabs do not poll. The server
// returns its newest 50 joins regardless of age; entries already shown are skipped.
// Revisit POLL_MS if those server limits change.
export const POLL_MS = 30_000
export const REVEAL_MS = 3_000
export const MAX_BACKOFF_MS = 300_000
export const IDLE_MS = 300_000
const REQUEST_TIMEOUT_MS = 10_000
// Enough to keep revealing until the next poll; older surplus is dropped so the feed stays current.
const QUEUE_MAX = POLL_MS / REVEAL_MS

export class ActivityError extends Error {
  readonly retryAfterMs: number
  constructor(retryAfterMs: number) {
    super('Activity unavailable')
    this.retryAfterMs = retryAfterMs
  }
}

async function getJson(url: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) {
    const seconds = Number(response.headers.get('retry-after'))
    throw new ActivityError(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0)
  }
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Unexpected activity response')
  return body as Record<string, unknown>
}

export async function fetchJoinCounts(origin: string, fetcher: typeof fetch = fetch): Promise<JoinCounts> {
  const body = await getJson(`${origin}/api/v1/providers/counts`, fetcher)
  if (!Number.isSafeInteger(body.windowDays) || !Array.isArray(body.providers))
    throw new Error('Unexpected counts response')
  const providers = new Map<string, number>()
  for (const entry of body.providers as Record<string, unknown>[]) {
    if (entry && typeof entry.id === 'string' && Number.isSafeInteger(entry.joined) && (entry.joined as number) >= 0)
      providers.set(entry.id, entry.joined as number)
  }
  return { windowDays: body.windowDays as number, providers }
}

export async function fetchRecentJoins(origin: string, fetcher: typeof fetch = fetch): Promise<RecentJoin[]> {
  const body = await getJson(`${origin}/api/v1/joins/recent?limit=50`, fetcher)
  if (!Array.isArray(body.joins)) throw new Error('Unexpected recent response')
  return (body.joins as Record<string, unknown>[])
    .filter(
      (j): j is Record<keyof RecentJoin, string> =>
        !!j && ['handle', 'providerId', 'providerName', 'joinedAt'].every(key => typeof j[key] === 'string' && j[key]),
    )
    .map(({ handle, providerId, providerName, joinedAt }) => ({ handle, providerId, providerName, joinedAt }))
}

export function formatJoinCount(count: number): string {
  if (count < 1000) return new Intl.NumberFormat(i18n.language).format(count)
  return (
    new Intl.NumberFormat(i18n.language, {
      notation: 'compact',
      maximumFractionDigits: 0,
      roundingMode: 'trunc',
    }).format(count) + '+'
  )
}

const joinKey = (join: RecentJoin) => `${join.joinedAt}|${join.providerId}|${join.handle}`

// Polls recent joins and hands them to `show` oldest first, at most one per REVEAL_MS.
// Rendering is the caller's concern; this only owns polling, pacing and dedupe.
export function startJoinFeed(load: () => Promise<RecentJoin[]>, show: (join: RecentJoin) => void): () => void {
  const queue: RecentJoin[] = []
  // The server never re-adds an entry once it leaves the response (newer entries expire later),
  // so the latest response's keys are a complete, bounded dedupe set.
  let seen = new Set<string>()
  let failures = 0
  let nextPoll = 0
  let inFlight = false
  let stopped = false
  let revealed = false
  let focused = document.hasFocus()
  let lastActivity = Date.now()
  let pollTimer: number | undefined
  let revealTimer: number | undefined
  let idleTimer: number | undefined

  function active() {
    return !stopped && !document.hidden && focused && Date.now() - lastActivity < IDLE_MS
  }

  function reveal() {
    if (!active()) {
      schedule()
      return
    }
    const join = queue.shift()
    if (!join) return
    revealed = true
    show(join)
  }
  async function poll() {
    pollTimer = undefined
    if (!active()) {
      schedule()
      return
    }
    inFlight = true
    let delay = POLL_MS
    try {
      const joins = await load()
      if (stopped) return
      failures = 0
      const fresh = joins.filter(join => !seen.has(joinKey(join))).reverse()
      seen = new Set(joins.map(joinKey))
      queue.push(...fresh)
      if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX)
      if (!revealed) reveal()
    } catch (error) {
      // Never retry-loop a 429/503: honor Retry-After and back off exponentially.
      failures++
      delay = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS)
      if (error instanceof ActivityError) delay = Math.max(delay, error.retryAfterMs)
    } finally {
      inFlight = false
    }
    nextPoll = Date.now() + delay
    schedule()
  }
  function schedule() {
    if (!active()) {
      window.clearTimeout(pollTimer)
      window.clearInterval(revealTimer)
      window.clearTimeout(idleTimer)
      pollTimer = revealTimer = idleTimer = undefined
      return
    }
    if (revealTimer === undefined) revealTimer = window.setInterval(reveal, REVEAL_MS)
    if (pollTimer === undefined && !inFlight) pollTimer = window.setTimeout(poll, Math.max(0, nextPoll - Date.now()))
    // Recheck the deadline instead of resetting a timer on every pointer movement.
    if (idleTimer === undefined)
      idleTimer = window.setTimeout(
        () => {
          idleTimer = undefined
          schedule()
        },
        Math.max(0, IDLE_MS - (Date.now() - lastActivity)),
      )
  }
  function interact() {
    if (stopped || document.hidden || !focused) return
    lastActivity = Date.now()
    schedule()
  }
  function visibilityChanged() {
    if (document.hidden) schedule()
    else interact()
  }
  function focus() {
    focused = true
    interact()
  }
  function blur() {
    focused = false
    schedule()
  }
  const interactionEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel'] as const
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('focus', focus)
  window.addEventListener('blur', blur)
  for (const event of interactionEvents) document.addEventListener(event, interact, { passive: true, capture: true })
  schedule()
  return () => {
    stopped = true
    schedule()
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('focus', focus)
    window.removeEventListener('blur', blur)
    for (const event of interactionEvents) document.removeEventListener(event, interact, { capture: true })
  }
}
