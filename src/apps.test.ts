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
test('rejects unsafe return destinations and incomplete themes', () => {
  for (const redirectUrl of ['http://example.com', 'javascript:alert(1)', '//example.com']) expect(() => parseApps([generic, { ...example, redirectUrl }])).toThrow()
  expect(() => parseApps([generic, { ...example, theme: {} }])).toThrow()
  expect(() => parseApps([generic, example, example])).toThrow()
  expect(() => parseApps([generic, { ...example, appName: '' }])).toThrow()
})
