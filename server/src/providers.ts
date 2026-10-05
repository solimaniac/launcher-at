import { readFileSync } from 'node:fs'

/** `exact` matches one hostname; `suffix` (starting with `.`) matches any subdomain, e.g. `.host.bsky.network`. */
export interface HostMatcher {
  type: 'exact' | 'suffix'
  value: string
}
export interface TrackedProvider {
  id: string
  name: string
  matchers: HostMatcher[]
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HOSTNAME_PATTERN = /^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i

function parseMatcher(matcher: HostMatcher): HostMatcher {
  if (!matcher || (matcher.type !== 'exact' && matcher.type !== 'suffix') || typeof matcher.value !== 'string') {
    throw new Error('Invalid PDS matcher')
  }
  const host = matcher.type === 'suffix' ? matcher.value.slice(1) : matcher.value
  if (
    (matcher.type === 'suffix' && !matcher.value.startsWith('.')) ||
    !HOSTNAME_PATTERN.test(host) ||
    host.includes('..') ||
    new URL('https://' + host).hostname !== host.toLowerCase()
  ) {
    throw new Error('Expected bare PDS hostname; suffix must start with a dot')
  }
  return { type: matcher.type, value: matcher.value.toLowerCase() }
}

/** Returns providers where both `enabled` and `tracking.enabled` are true. Every entry is still validated. */
export function parseTrackedProviders(value: unknown): TrackedProvider[] {
  if (!Array.isArray(value)) throw new Error('Expected provider array')
  const ids = new Set<string>()
  const tracked: TrackedProvider[] = []
  for (const provider of value) {
    if (
      !provider ||
      typeof provider.id !== 'string' ||
      !ID_PATTERN.test(provider.id) ||
      typeof provider.name !== 'string' ||
      !provider.name.trim() ||
      typeof provider.enabled !== 'boolean' ||
      ids.has(provider.id)
    ) {
      throw new Error('Invalid or duplicate provider')
    }
    ids.add(provider.id)

    const tracking = provider.tracking
    if (tracking === undefined) continue
    if (!tracking || typeof tracking.enabled !== 'boolean' || !Array.isArray(tracking.pdsHostMatchers)) {
      throw new Error('Invalid tracking configuration')
    }
    const matchers = tracking.pdsHostMatchers.map(parseMatcher)
    if (provider.enabled && tracking.enabled) {
      if (!matchers.length) throw new Error('Tracked provider needs a PDS matcher')
      tracked.push({ id: provider.id, name: provider.name, matchers })
    }
  }
  return tracked
}

/** Reads the provider list shared with the frontend (`config/providers.json`). */
export function loadProviders(): TrackedProvider[] {
  const path = new URL('../../config/providers.json', import.meta.url)
  return parseTrackedProviders(JSON.parse(readFileSync(path, 'utf8')))
}

/** Finds the provider hosting a PDS endpoint. Overlapping matchers resolve to the first provider in config order. */
export function matchProvider(endpoint: string, providers: TrackedProvider[]): TrackedProvider | undefined {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return undefined
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  return providers.find(provider =>
    provider.matchers.some(matcher =>
      matcher.type === 'exact' ? host === matcher.value : host.endsWith(matcher.value),
    ),
  )
}
