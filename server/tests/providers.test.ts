import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadProviders, matchProvider, parseTrackedProviders } from '../src/providers.ts'

const providers = loadProviders()
test('attributes exact PDS and Bluesky physical host, not entryway or lookalikes', () => {
  expect(matchProvider('https://EUROSKY.SOCIAL/', providers)?.id).toBe('eurosky')
  expect(matchProvider('https://amanita.us-east.host.bsky.network', providers)?.id).toBe('bluesky')
  for (const host of ['bsky.social', 'eurosky.social.evil.test', 'evilhost.bsky.network', 'host.bsky.network', 'unknown.test']) expect(matchProvider('https://' + host, providers)).toBeUndefined()
  expect(matchProvider('not a URL', providers)).toBeUndefined()
})
test('only enabled + tracked providers participate; IDs stay configuration-driven', () => {
  const entry = { id: 'custom-provider', name: 'Custom', enabled: true, tracking: { enabled: true, pdsHostMatchers: [{ type: 'exact', value: 'pds.example.com' }] } }
  expect(matchProvider('https://pds.example.com', parseTrackedProviders([entry]))?.id).toBe('custom-provider')
  expect(parseTrackedProviders([{ ...entry, enabled: false }])).toEqual([])
  expect(parseTrackedProviders([{ ...entry, tracking: { ...entry.tracking, enabled: false } }])).toEqual([])
  const source = JSON.parse(readFileSync(new URL('../../config/providers.json', import.meta.url), 'utf8'))
  expect(providers.map(p => p.id)).toEqual(source.filter((p: typeof entry) => p.enabled && p.tracking?.enabled).map((p: typeof entry) => p.id))
})
test('suffix requires a DNS-label boundary; no regex configuration', () => {
  const entry = { id: 'example', name: 'Example', enabled: true, tracking: { enabled: true, pdsHostMatchers: [{ type: 'suffix', value: '.example.com' }] } }
  expect(matchProvider('https://pds.example.com', parseTrackedProviders([entry]))?.id).toBe('example')
  expect(matchProvider('https://evil-example.com', parseTrackedProviders([entry]))).toBeUndefined()
  for (const matcher of [{ type: 'regex', value: '.*' }, { type: 'suffix', value: 'example.com' }, { type: 'exact', value: 'https://example.com' }]) expect(() => parseTrackedProviders([{ ...entry, tracking: { enabled: true, pdsHostMatchers: [matcher] } }])).toThrow()
})
