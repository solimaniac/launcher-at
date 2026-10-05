// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { launch } from './launcher'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'
import { t } from './i18n'
import type { JoinCounts } from './activity'

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
    expect(page.querySelector('a.button')).toBeNull()
    expect([...page.querySelectorAll<HTMLAnchorElement>('a')].every(link => !link.href.includes('evil.example') && !link.href.includes('example.com'))).toBe(true)
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
test('stay-here stops the automatic return without removing the allowlisted CTA', async () => {
  vi.useFakeTimers()
  const page = root()
  dispose = await launch(page, result('example-app'), true)
  page.querySelector<HTMLButtonElement>('button')!.click()
  await vi.advanceTimersByTimeAsync(6000)
  expect(page.textContent).toContain(t('complete.paused'))
  expect(page.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://example.com/')
})
test('provider failure enables retry and never reveals library error details', async () => {
  const page = root()
  const failure: SignupOAuth = { ...result(null), start: async () => { throw new Error('secret code and stack trace') } }
  dispose = await launch(page, failure)
  page.querySelector<HTMLButtonElement>('button')!.click()
  page.querySelector<HTMLButtonElement>('.provider')!.click()
  expect([...page.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  await vi.waitFor(() => expect(page.textContent).toContain(t('errors.authorization')))
  expect(page.textContent).not.toContain('secret code')
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect([...page.querySelectorAll<HTMLButtonElement>('.provider')].every(button => !button.disabled)).toBe(true)
  expect(document.activeElement).toBe(page.querySelector('h1'))
})

function visibleProviders(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLElement>('.provider:not([hidden])')].map(card => card.dataset.provider)
}
function openControls(page: HTMLElement) {
  if (page.querySelector<HTMLElement>('.provider-controls')!.hidden) page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
}
function choose(page: HTMLElement, id: string, value: string) {
  openControls(page)
  const select = page.querySelector<HTMLSelectElement>(`#${id}`)!
  select.value = value
  select.dispatchEvent(new Event('change'))
}
function region(page: HTMLElement, value: string) {
  openControls(page)
  page.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click()
}

test('join sorting handles late counts, ties, zero and unavailable counts without losing focus', async () => {
  let resolve!: (value: JoinCounts) => void
  const counts = new Promise<JoinCounts>(done => { resolve = done })
  const page = root()
  dispose = await launch(page, result(null), false, counts)
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual(['az', 'za'])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('az')
  expect(visibleProviders(page)).toEqual(['blacksky', 'bluesky', 'eurosky', 'northsky', 'npmx', 'pckt', 'selfhosted-social', 'spark', 'tangled', 'w-social', 'witchcraft-systems'])
  const focused = page.querySelector<HTMLButtonElement>('[data-provider="bluesky"]')!
  focused.focus()
  resolve({ windowDays: 30, providers: new Map([['spark', 24], ['eurosky', 24], ['bluesky', 0]]) })
  await counts
  expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual(['joins', 'az', 'za'])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('joins')
  expect(visibleProviders(page)).toEqual(['eurosky', 'spark', 'bluesky', 'blacksky', 'northsky', 'npmx', 'pckt', 'selfhosted-social', 'tangled', 'w-social', 'witchcraft-systems'])
  expect(document.activeElement).toBe(focused)
  choose(page, 'provider-sort', 'za')
  expect(visibleProviders(page)).toEqual(['witchcraft-systems', 'w-social', 'tangled', 'spark', 'selfhosted-social', 'pckt', 'npmx', 'northsky', 'eurosky', 'bluesky', 'blacksky'])
  choose(page, 'provider-sort', 'az')
  expect(visibleProviders(page)[0]).toBe('blacksky')
})

test('multiple regions combine with invite requirements and clear filters recovers empty results', async () => {
  const page = root()
  dispose = await launch(page, result(null))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(page.querySelector<HTMLElement>('.provider-controls')!.hidden).toBe(true)
  region(page, 'Europe')
  region(page, 'Canada')
  expect(visibleProviders(page)).toEqual(['eurosky', 'northsky', 'npmx', 'tangled', 'w-social'])
  choose(page, 'provider-invites', 'required')
  expect(visibleProviders(page)).toEqual(['northsky', 'w-social'])
  choose(page, 'provider-invites', 'none')
  expect(visibleProviders(page)).toEqual(['eurosky', 'npmx', 'tangled'])
  page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
  expect(page.querySelector<HTMLElement>('.provider-controls')!.hidden).toBe(true)
  expect(page.querySelector('[role="status"]')!.textContent).toBe(t('providers.results', { count: 3, total: 11 }))
  region(page, 'Europe')
  expect(visibleProviders(page)).toEqual([])
  expect(page.querySelector<HTMLElement>('.provider-empty')!.hidden).toBe(false)
  choose(page, 'provider-sort', 'za')
  page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
  page.querySelector<HTMLButtonElement>('.clear-filters')!.click()
  expect(visibleProviders(page)).toEqual(['witchcraft-systems', 'w-social', 'tangled', 'spark', 'selfhosted-social', 'pckt', 'npmx', 'northsky', 'eurosky', 'bluesky', 'blacksky'])
  expect(page.querySelector<HTMLElement>('.provider-empty')!.hidden).toBe(true)
  expect(page.querySelector<HTMLButtonElement>('.provider-toggle')!.getAttribute('aria-expanded')).toBe('false')
  expect(page.querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(true)
  expect(document.activeElement).toBe(page.querySelector('.provider-toggle'))
})

test('late counts respect alphabetical selection and failed signup preserves filtered choices', async () => {
  let resolve!: (value: JoinCounts) => void
  const counts = new Promise<JoinCounts>(done => { resolve = done })
  const page = root()
  const failure: SignupOAuth = { ...result(null), start: async () => { throw new Error('failed') } }
  dispose = await launch(page, failure, false, counts)
  page.querySelector<HTMLButtonElement>('button')!.click()
  choose(page, 'provider-sort', 'za')
  region(page, 'Europe')
  choose(page, 'provider-invites', 'none')
  resolve({ windowDays: 30, providers: new Map([['eurosky', 42]]) })
  await counts
  expect(visibleProviders(page)).toEqual(['tangled', 'npmx', 'eurosky'])
  page.querySelector<HTMLButtonElement>('.provider:not([hidden])')!.click()
  expect([...page.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].every(control => control.disabled)).toBe(true)
  await vi.waitFor(() => expect(page.dataset.view).toBe('error'))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(visibleProviders(page)).toEqual(['tangled', 'npmx', 'eurosky'])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.disabled).toBe(false)
})

test('join-count sort is omitted for failed, empty, or unrelated counts but includes measured zero', async () => {
  for (const counts of [undefined, Promise.reject(new Error('offline')), Promise.resolve({ windowDays: 30, providers: new Map<string, number>() }), Promise.resolve({ windowDays: 30, providers: new Map([['unknown-provider', 9]]) })]) {
    const page = root()
    dispose = await launch(page, result(null), false, counts)
    page.querySelector<HTMLButtonElement>('button')!.click()
    openControls(page)
    expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual(['az', 'za'])
    expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('az')
    dispose()
  }
  const page = root()
  dispose = await launch(page, result(null), false, Promise.resolve({ windowDays: 30, providers: new Map([['spark', 0]]) }))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('joins')
  expect(visibleProviders(page)[0]).toBe('spark')
})

test('discovery is available only after generic signup, never for custom app callbacks', async () => {
  vi.useFakeTimers()
  for (const id of [null, 'default', 'example-app', 'example-app-dark']) {
    const page = root()
    dispose = await launch(page, result(id), true)
    expect(!!page.querySelector('.app-carousel')).toBe(id === null || id === 'default')
    dispose()
  }
  const page = root()
  dispose = await launch(page, result(null))
  expect(page.querySelector('.app-carousel')).toBeNull()
})
