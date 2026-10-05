import { expect, test } from 'vitest'
import { metadataFor } from './metadata.ts'

test('public HTTPS metadata binds callback and minimal permissions to the configured origin', () => {
  const metadata = metadataFor('https://launcher.example.org')
  expect(metadata.client_id).toBe('https://launcher.example.org/oauth-client-metadata.json')
  expect(metadata.redirect_uris).toEqual(['https://launcher.example.org/callback.html'])
  expect(metadata.scope).toBe('atproto')
  expect(metadata.grant_types).toEqual(['authorization_code'])
})
test('rejects origins incompatible with discoverable OAuth client IDs', () => {
  for (const origin of [
    'https://launcher.example.org/path',
    'https://launcher.example.org/',
    'https://user:pass@launcher.example.org',
    'http://launcher.example.org',
    'https://launcher.example.org:8443',
    'not a URL',
  ])
    expect(() => metadataFor(origin)).toThrow()
})
