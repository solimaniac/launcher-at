import { expect, test } from 'vitest'
import generic from '../apps/default/config.json'
import example from '../apps/example-app/config.json'
import { lookupApp, parseApps } from './config'
const apps = parseApps([generic, example])
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
  expect(lookupApp(parseApps([generic, noReturn]), 'example-app').app.redirectUrl).toBeUndefined()
})
test('rejects unsafe return destinations and incomplete themes', () => {
  for (const redirectUrl of ['http://example.com', 'javascript:alert(1)', '//example.com']) expect(() => parseApps([generic, { ...example, redirectUrl }])).toThrow()
  expect(() => parseApps([generic, { ...example, theme: {} }])).toThrow()
  expect(() => parseApps([generic, example, example])).toThrow()
  expect(() => parseApps([generic, { ...example, appName: '' }])).toThrow()
  expect(() => parseApps([generic, { ...example, launchAnimation: 'false' }])).toThrow()
  expect(lookupApp(parseApps([generic, { ...example, launchAnimation: false }]), 'example-app').app.launchAnimation).toBe(false)
})
test('app logos require absolute HTTPS URLs and reject local paths or unsafe destinations', () => {
  for (const logo_url of ['https://example.com/logo.svg', 'https://example.com/logo.png?v=2']) {
    expect(lookupApp(parseApps([generic, { ...example, logo_url }]), 'example-app').app.logo_url).toBe(logo_url)
  }
  for (const logo_url of ['', null, 123, '/apps/example-app/logo.svg', 'logo.png', '//example.com/logo.svg', '/../logo.svg', 'http://example.com/logo.svg', 'javascript:alert(1)', 'data:image/png;base64,abc', 'https://user:pass@example.com/logo.svg']) {
    expect(() => parseApps([generic, { ...example, logo_url }])).toThrow()
  }
})
