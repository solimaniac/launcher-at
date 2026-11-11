import { expect, test } from 'vitest'
import { providers as source } from './providers'
import { parseProviders } from './config'
test('rejects duplicate ids, duplicate URLs and unsafe URLs', () => {
  expect(() => parseProviders([source[0], source[0]])).toThrow()
  expect(() => parseProviders([source[0], { ...source[1], serviceUrl: source[0]!.serviceUrl }])).toThrow()
  for (const serviceUrl of ['http://example.com', 'javascript:alert(1)', 'not a URL', 'https://user:pass@example.com'])
    expect(() => parseProviders([{ ...source[0], serviceUrl }])).toThrow()
})
test('normalizes equivalent entryway URLs without blocking issuer discovery', () => {
  const provider = source[0]!
  expect(parseProviders([{ ...source[0], serviceUrl: 'https://bsky.social/' }])[0]!.serviceUrl).toBe(
    'https://bsky.social',
  )
  expect(() =>
    parseProviders([provider, { ...provider, id: `${provider.id}-alias`, serviceUrl: `${provider.serviceUrl}/` }]),
  ).toThrow()
})
test('rejects missing fields and remote or traversing logo paths', () => {
  expect(() => parseProviders([{ ...source[0], serviceUrl: undefined }])).toThrow()
  expect(() => parseProviders([{ ...source[0], name: '' }])).toThrow()
  for (const logo of ['//evil.example/logo.svg', '/../logo.svg', 'https://evil.example/logo.svg'])
    expect(() => parseProviders([{ ...source[0], logo }])).toThrow()
})
test('invite requirements accept only booleans, not truthy strings', () => {
  for (const requiresInvite of ['false', 'true', 1, null])
    expect(() => parseProviders([{ ...source[0], requiresInvite }])).toThrow('requiresInvite must be a boolean')
})
