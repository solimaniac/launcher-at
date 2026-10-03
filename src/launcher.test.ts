// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { launch } from './launcher'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'
import { t } from './i18n'

let dispose: (() => void) | undefined
function root() {
  document.body.innerHTML = '<main id="app"></main>'
  return document.querySelector<HTMLElement>('main')!
}
function result(appId: string | null): SignupOAuth {
  return {
    start: async () => { throw new Error('Not part of callback scenario') },
    finish: async () => ({ did: 'did:plc:example', appId, cleanupFailed: false }),
  }
}
afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})
test('authenticated app state controls the return destination, not callback query parameters', async () => {
  vi.useFakeTimers()
  history.replaceState(null, '', '/callback.html?app=missing&redirect=https://evil.example')
  const page = root()
  dispose = await launch(page, result('example-app'), true)
  expect(page.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://example.com/')
  expect(page.textContent).toContain(t('complete.countdown', { appName: 'Example App', count: 5 }))
  await vi.advanceTimersByTimeAsync(4000)
  expect(page.textContent).toContain(t('complete.countdown', { appName: 'Example App', count: 1 }))
})
test('missing or unknown authenticated context cannot inherit a query-string redirect', async () => {
  for (const id of [null, 'unregistered', '../../example-app', 'constructor']) {
    history.replaceState(null, '', '/callback.html?app=example-app&redirect=https://evil.example')
    const page = root()
    dispose = await launch(page, result(id), true)
    expect(page.querySelector('a')).toBeNull()
    expect(page.querySelector('h1')?.textContent).toBe(t('complete.title'))
    dispose()
  }
})
test('cancelled signup preserves only validated app context for start-over', async () => {
  const page = root()
  const cancelled: SignupOAuth = { ...result(null), finish: async () => { throw new SignupError('errors.cancelled', 'example-app') } }
  dispose = await launch(page, cancelled, true)
  expect(page.textContent).toContain(t('errors.cancelled'))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(location.search).toBe('?app=example-app')
  expect(page.textContent).toContain(t('intro.app', { appName: 'Example App' }))
  expect(page.querySelector('a')).toBeNull()
})
test('app state accepts IDs, never URLs or paths', () => {
  expect(recoverAppId('example-app')).toBe('example-app')
  for (const state of [null, '', '../example-app', 'https://evil.example', { app: 'example-app' }]) expect(recoverAppId(state)).toBeNull()
})
