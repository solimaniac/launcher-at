import { expect, test } from 'vitest'
import generic from '../apps/default/config.json'
import example from '../apps/example-app/config.json'
import source from '../config/providers.json'
import { lookupApp, parseApps, parseProviders } from './config'
const providers = parseProviders(source)
const apps = parseApps([generic, example], providers)
test('known app resolves branding and an allowlisted return URL', () => {
  expect(lookupApp(apps, 'example-app').app).toEqual(example)
})
test('unknown, path-like and inherited property IDs cannot redirect', () => {
  for (const id of ['missing', '../../example-app', '__proto__', 'constructor', 'https://evil.example']) {
    const result = lookupApp(apps, id)
    expect(result.unknown).toBe(true)
    expect(result.app.id).toBe('default')
    expect(result.app.redirectUrl).toBeUndefined()
  }
  expect(lookupApp(apps, null).unknown).toBe(false)
})
test('non-default apps may omit the return destination', () => {
  const { redirectUrl: _omitted, ...noReturn } = example
  expect(lookupApp(parseApps([generic, noReturn], providers), 'example-app').app.redirectUrl).toBeUndefined()
})
test('rejects unsafe return destinations and incomplete themes', () => {
  for (const redirectUrl of ['http://example.com', 'javascript:alert(1)', '//example.com'])
    expect(() => parseApps([generic, { ...example, redirectUrl }], providers)).toThrow()
  expect(() => parseApps([generic, { ...example, theme: {} }], providers)).toThrow()
  expect(() => parseApps([generic, example, example], providers)).toThrow()
  expect(() => parseApps([generic, { ...example, appName: '' }], providers)).toThrow()
  expect(() => parseApps([generic, { ...example, launchAnimation: 'false' }], providers)).toThrow()
  expect(
    lookupApp(parseApps([generic, { ...example, launchAnimation: false }], providers), 'example-app').app
      .launchAnimation,
  ).toBe(false)
})
test('app logos require absolute HTTPS URLs and reject local paths or unsafe destinations', () => {
  for (const logo_url of ['https://example.com/logo.svg', 'https://example.com/logo.png?v=2']) {
    expect(lookupApp(parseApps([generic, { ...example, logo_url }], providers), 'example-app').app.logo_url).toBe(
      logo_url,
    )
  }
  for (const logo_url of [
    '',
    null,
    123,
    '/apps/example-app/logo.svg',
    'logo.png',
    '//example.com/logo.svg',
    '/../logo.svg',
    'http://example.com/logo.svg',
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:pass@example.com/logo.svg',
  ]) {
    expect(() => parseApps([generic, { ...example, logo_url }], providers)).toThrow()
  }
})

test('provider allowlists reject empty, malformed, duplicate and unknown provider IDs', () => {
  for (const providerAllowlist of [
    [],
    null,
    'bluesky',
    [1],
    [''],
    ['unknown-provider'],
    ['bluesky', 'bluesky'],
    ['bluesky', 'unknown-provider'],
  ]) {
    expect(() => parseApps([generic, { ...example, providerAllowlist }], providers)).toThrow('providerAllowlist')
  }
})

test('allowlisted disabled providers remain valid configuration', () => {
  const disabledProviders = providers.map(provider => ({ ...provider, enabled: false }))
  const configured = parseApps([generic, { ...example, providerAllowlist: ['bluesky'] }], disabledProviders)
  expect(lookupApp(configured, 'example-app').app.providerAllowlist).toEqual(['bluesky'])
})

test('join count visibility rejects non-boolean configuration', () => {
  for (const joinCounts of ['false', 'true', 0, 1, null, {}]) {
    expect(() => parseApps([generic, { ...example, joinCounts }], providers)).toThrow('joinCounts')
  }
})
