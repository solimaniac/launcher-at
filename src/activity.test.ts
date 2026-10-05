// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  ActivityError,
  IDLE_MS,
  MAX_BACKOFF_MS,
  POLL_MS,
  REVEAL_MS,
  fetchRecentJoins,
  formatJoinCount,
  startJoinFeed,
  type RecentJoin,
} from './activity'

let stop: (() => void) | undefined
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const join = (n: number): RecentJoin => ({
  handle: `user${n}.example`,
  providerId: 'bluesky',
  providerName: 'Bluesky',
  joinedAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString(),
})
// Server order: newest first.
const newest = (...ns: number[]) => ns.sort((a, b) => b - a).map(join)
const joinText = (join: RecentJoin) => `${join.handle} joined on ${join.providerName}`

test('counts truncate to the largest whole compact unit', () => {
  expect([0, 7, 999].map(formatJoinCount)).toEqual(['0', '7', '999'])
  expect([1000, 1999, 9999, 10_000, 99_999, 100_000, 999_999].map(formatJoinCount)).toEqual([
    '1K+',
    '1K+',
    '9K+',
    '10K+',
    '99K+',
    '100K+',
    '999K+',
  ])
  expect([1_000_000, 1_999_999, 12_345_678].map(formatJoinCount)).toEqual(['1M+', '1M+', '12M+'])
})

test('feed reveals one new join per interval, oldest first, and never repeats', async () => {
  vi.useFakeTimers()
  const shown: string[] = []
  const responses = [newest(1, 2, 3), newest(1, 2, 3, 4)]
  const load = vi.fn(async () => responses.shift() ?? newest(1, 2, 3, 4))
  stop = startJoinFeed(load, join => shown.push(joinText(join)))
  await vi.advanceTimersByTimeAsync(0)
  expect(shown).toEqual(['user1.example joined on Bluesky'])
  await vi.advanceTimersByTimeAsync(REVEAL_MS)
  expect(shown).toEqual(['user1.example joined on Bluesky', 'user2.example joined on Bluesky'])
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(load).toHaveBeenCalledTimes(2)
  expect(shown).toEqual([1, 2, 3, 4].map(n => joinText(join(n))))
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(shown).toHaveLength(4)
})

test('feed waits for Retry-After and backs off on failure instead of retry-looping', async () => {
  vi.useFakeTimers()
  const show = vi.fn()
  const load = vi
    .fn<() => Promise<RecentJoin[]>>()
    .mockRejectedValueOnce(new ActivityError(MAX_BACKOFF_MS + 60_000))
    .mockRejectedValue(new Error('offline'))
  stop = startJoinFeed(load, show)
  await vi.advanceTimersByTimeAsync(IDLE_MS - 1)
  document.dispatchEvent(new Event('keydown'))
  await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS + 60_000 - IDLE_MS)
  expect(load).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(POLL_MS * 4 - 1)
  expect(load).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(3)
  expect(show).not.toHaveBeenCalled()
})

test.each(['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel'])(
  'feed pauses after five idle minutes and resumes on %s',
  async event => {
    vi.useFakeTimers()
    const shown: string[] = []
    const load = vi.fn(async () => newest(1, 2))
    stop = startJoinFeed(load, join => shown.push(joinText(join)))
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1)
    const polls = load.mock.calls.length
    await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS)
    expect(load).toHaveBeenCalledTimes(polls)
    document.dispatchEvent(new Event(event))
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(polls + 1)
    await vi.advanceTimersByTimeAsync(REVEAL_MS)
    expect(shown).toEqual([1, 2].map(n => joinText(join(n))))
  },
)

test('interactions extend the idle deadline without delaying polls or reveals', async () => {
  vi.useFakeTimers()
  const shown: string[] = []
  const load = vi.fn(async () => newest(1, 2, 3))
  stop = startJoinFeed(load, join => shown.push(joinText(join)))
  await vi.advanceTimersByTimeAsync(0)
  for (let elapsed = 0; elapsed < IDLE_MS; elapsed += 1000) {
    document.dispatchEvent(new Event('pointermove'))
    await vi.advanceTimersByTimeAsync(1000)
  }
  expect(load).toHaveBeenCalledTimes(IDLE_MS / POLL_MS + 1)
  expect(shown).toEqual([1, 2, 3].map(n => joinText(join(n))))
  await vi.advanceTimersByTimeAsync(IDLE_MS)
  const polls = load.mock.calls.length
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(load).toHaveBeenCalledTimes(polls)
})

test('hidden pages do not start polling; returning refreshes an expired idle deadline', async () => {
  vi.useFakeTimers()
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  const show = vi.fn()
  const load = vi.fn(async () => newest(1, 2, 3))
  stop = startJoinFeed(load, show)
  document.dispatchEvent(new Event('pointermove'))
  await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS)
  expect(load).not.toHaveBeenCalled()
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
  expect(load).toHaveBeenCalledTimes(1)
  expect(show.mock.calls.map(([join]) => join.handle)).toEqual(['user1.example'])
  hidden.mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS)
  expect(load).toHaveBeenCalledTimes(1)
  expect(show).toHaveBeenCalledTimes(1)
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(REVEAL_MS)
  expect(load).toHaveBeenCalledTimes(2)
  expect(show.mock.calls.map(([join]) => join.handle)).toEqual(['user1.example', 'user2.example'])
})

test('visible pages pause when focus leaves and resume when focus returns', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  const load = vi.fn(async () => [])
  stop = startJoinFeed(load, vi.fn())
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(load).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(0)
  expect(load).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event('blur'))
  document.dispatchEvent(new Event('keydown'))
  await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS)
  expect(load).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(0)
  expect(load).toHaveBeenCalledTimes(2)
})

test('resuming early does not bypass the polling interval or Retry-After', async () => {
  vi.useFakeTimers()
  const load = vi
    .fn<() => Promise<RecentJoin[]>>()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new ActivityError(MAX_BACKOFF_MS + 60_000))
    .mockResolvedValue([])
  stop = startJoinFeed(load, vi.fn())
  await vi.advanceTimersByTimeAsync(0)
  window.dispatchEvent(new Event('blur'))
  await vi.advanceTimersByTimeAsync(1000)
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('keydown'))
  await vi.advanceTimersByTimeAsync(POLL_MS - 1001)
  expect(load).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(2)
  window.dispatchEvent(new Event('blur'))
  await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS)
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(59_999)
  expect(load).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(3)
})

test('an in-flight response while paused waits to reveal until activity returns', async () => {
  vi.useFakeTimers()
  let resolve!: (joins: RecentJoin[]) => void
  const load = vi.fn(
    () =>
      new Promise<RecentJoin[]>(done => {
        resolve = done
      }),
  )
  const show = vi.fn()
  stop = startJoinFeed(load, show)
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(IDLE_MS)
  resolve(newest(1, 2))
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(load).toHaveBeenCalledTimes(1)
  expect(show).not.toHaveBeenCalled()
  document.dispatchEvent(new Event('pointerdown'))
  await vi.advanceTimersByTimeAsync(REVEAL_MS)
  expect(load).toHaveBeenCalledTimes(2)
  expect(show.mock.calls.map(([join]) => join.handle)).toEqual(['user1.example'])
})

test('stopping discards in-flight results and cannot be resumed by browser events', async () => {
  vi.useFakeTimers()
  let resolve!: (joins: RecentJoin[]) => void
  const load = vi.fn(
    () =>
      new Promise<RecentJoin[]>(done => {
        resolve = done
      }),
  )
  const show = vi.fn()
  stop = startJoinFeed(load, show)
  await vi.advanceTimersByTimeAsync(0)
  stop()
  resolve(newest(1, 2))
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  document.dispatchEvent(new Event('pointerdown'))
  await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS)
  expect(load).toHaveBeenCalledTimes(1)
  expect(show).not.toHaveBeenCalled()
})

test('rate-limited responses surface Retry-After; malformed joins are dropped', async () => {
  const limited = async () =>
    new Response('{"error":"Too many requests"}', { status: 429, headers: { 'retry-after': '42' } })
  await expect(fetchRecentJoins('https://api.example', limited)).rejects.toMatchObject({ retryAfterMs: 42_000 })
  const mixed = async () => Response.json({ windowMinutes: 5, joins: [join(1), { handle: 'x' }, null] })
  expect(await fetchRecentJoins('https://api.example', mixed)).toEqual([join(1)])
})
