import { expect, test } from 'vitest'
import source from '../config/providers.json'
import { parseProviders } from './config'
test('parses both provider entryways', () => {
  expect(parseProviders(source).map(p => p.serviceUrl)).toEqual(['https://bsky.social/', 'https://eurosky.social/'])
})
test('rejects duplicate ids, duplicate URLs and unsafe URLs', () => {
  expect(() => parseProviders([source[0], source[0]])).toThrow()
  expect(() => parseProviders([source[0], { ...source[1], serviceUrl: source[0]!.serviceUrl }])).toThrow()
  for (const serviceUrl of ['http://example.com', 'javascript:alert(1)', 'not a URL', 'https://user:pass@example.com']) expect(() => parseProviders([{ ...source[0], serviceUrl }])).toThrow()
})
