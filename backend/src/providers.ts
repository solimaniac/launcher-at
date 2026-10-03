import { readFileSync } from 'node:fs'

export interface HostMatcher { type: 'exact' | 'suffix'; value: string }
export interface TrackedProvider { id: string; name: string; matchers: HostMatcher[] }

export function parseTrackedProviders(value: unknown): TrackedProvider[] {
  if (!Array.isArray(value)) throw new Error('Expected provider array')
  const ids = new Set<string>()
  const result: TrackedProvider[] = []
  for (const p of value) {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || typeof p.enabled !== 'boolean' || ids.has(p.id)) throw new Error('Invalid or duplicate provider')
    ids.add(p.id)
    if (p.tracking === undefined) continue
    const t = p.tracking
    if (!t || typeof t.enabled !== 'boolean' || !Array.isArray(t.pdsHostMatchers)) throw new Error('Invalid tracking configuration')
    const matchers = t.pdsHostMatchers.map((m: HostMatcher) => {
      if (!m || (m.type !== 'exact' && m.type !== 'suffix') || typeof m.value !== 'string') throw new Error('Invalid PDS matcher')
      const host = m.type === 'suffix' ? m.value.slice(1) : m.value
      if ((m.type === 'suffix' && !m.value.startsWith('.')) || !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.includes('..') || new URL('https://' + host).hostname !== host.toLowerCase()) throw new Error('Expected bare PDS hostname; suffix must start with a dot')
      return { type: m.type, value: m.value.toLowerCase() }
    })
    if (p.enabled && t.enabled) {
      if (!matchers.length) throw new Error('Tracked provider needs a PDS matcher')
      result.push({ id: p.id, name: p.name, matchers })
    }
  }
  return result
}

export function loadProviders(): TrackedProvider[] {
  return parseTrackedProviders(JSON.parse(readFileSync(new URL('../../config/providers.json', import.meta.url), 'utf8')))
}

export function matchProvider(endpoint: string, providers: TrackedProvider[]): TrackedProvider | undefined {
  let url: URL
  try { url = new URL(endpoint) } catch { return undefined }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  return providers.find(p => p.matchers.some(m => m.type === 'exact' ? host === m.value : host.endsWith(m.value)))
}
