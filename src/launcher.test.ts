// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { launch } from './launcher'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'
import { t } from './i18n'
import providerSource from '../config/providers.json'
import { apps } from './apps'

let dispose: (() => void) | undefined
function root() {
  document.body.innerHTML = '<main id="app"></main>'
  return document.querySelector<HTMLElement>('main')!
}
function result(appId: string | null): SignupOAuth {
  return {
    start: async () => {
      throw new Error('Not part of callback scenario')
    },
    finish: async () => ({ handle: 'alice.bsky.social', appId, cleanupFailed: false }),
  }
}
afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

test.each([null, 'default', 'unregistered'])('generic signup omits app branding for %s', async appId => {
  history.replaceState(null, '', appId ? `/?app=${appId}` : '/')
  const page = root()
  dispose = await launch(page, result(null))
  expect(page.textContent).not.toContain(apps.find(app => app.id === 'default')!.appName)
  expect(page.querySelector('img')).toBeNull()
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(page.textContent).not.toContain(apps.find(app => app.id === 'default')!.appName)
  expect(document.activeElement).toBe(page.querySelector('h1'))
})

test.each(['example-app', 'example-app-dark'])('custom signup retains configured branding for %s', async appId => {
  history.replaceState(null, '', `/?app=${appId}`)
  const page = root()
  dispose = await launch(page, result(null))
  const app = apps.find(app => app.id === appId)!
  expect(page.textContent).toContain(app.appName)
  expect(page.querySelector<HTMLImageElement>('img')?.src).toBe(app.logo_url)
})
test('authenticated app state controls the return destination, not callback query parameters', async () => {
  vi.useFakeTimers()
  history.replaceState(null, '', '/callback.html?app=missing&redirect=https://evil.example')
  const page = root()
  dispose = await launch(page, result('example-app'), true)
  expect(page.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://bsky.app/')
})
test.each(['default', 'example-app', 'example-app-dark'])(
  'shows the signup handle for %s without sending it to another app',
  async appId => {
    vi.useFakeTimers()
    const page = root()
    dispose = await launch(page, result(appId), true)
    const identity = page.querySelector('section[aria-labelledby="completion-handle"]')!
    expect(identity.textContent).toContain('alice.bsky.social')
    expect(identity.querySelector('a')).toBeNull()
    expect(
      [...page.querySelectorAll<HTMLAnchorElement>('a')].every(link => !link.href.includes('alice.bsky.social')),
    ).toBe(true)
    expect(document.activeElement).toBe(page.querySelector('h1'))
    if (appId !== 'default')
      expect(page.querySelector<HTMLAnchorElement>('.redirect-fallback a')?.href).toBe('https://bsky.app/')
  },
)

test('unavailable handle still completes signup and keeps the return destination', async () => {
  vi.useFakeTimers()
  const page = root()
  dispose = await launch(
    page,
    {
      ...result('example-app'),
      finish: async () => ({ handle: null, appId: 'example-app', cleanupFailed: false }),
    },
    true,
  )
  expect(page.dataset.view).toBe('complete')
  expect(page.querySelector('section[aria-labelledby="completion-handle"]')).toBeNull()
  expect(page.querySelector<HTMLAnchorElement>('.redirect-fallback a')?.href).toBe('https://bsky.app/')
})

test('handle display treats markup as text', async () => {
  const page = root()
  const handle = '<img src=x onerror=alert(1)>'
  dispose = await launch(
    page,
    {
      ...result('default'),
      finish: async () => ({ handle, appId: 'default', cleanupFailed: false }),
    },
    true,
  )
  const identity = page.querySelector('section[aria-labelledby="completion-handle"]')!
  expect(identity.textContent).toContain(handle)
  expect(identity.querySelector('img')).toBeNull()
})

test('missing or unknown authenticated context cannot inherit a query-string redirect', async () => {
  for (const id of [null, 'unregistered', '../../example-app', 'constructor']) {
    history.replaceState(null, '', '/callback.html?app=example-app&redirect=https://evil.example')
    const page = root()
    dispose = await launch(page, result(id), true)
    expect([...page.querySelectorAll<HTMLAnchorElement>('a')].every(link => !link.href.includes('evil.example'))).toBe(
      true,
    )
    expect(page.querySelector('.redirect-fallback a')).toBeNull()
    expect(page.querySelector('h1')?.textContent).toBe(t('complete.title'))
    dispose()
  }
})
test('cancelled signup preserves only validated app context for start-over', async () => {
  const page = root()
  const cancelled: SignupOAuth = {
    ...result(null),
    finish: async () => {
      throw new SignupError('errors.cancelled', 'example-app')
    },
  }
  dispose = await launch(page, cancelled, true)
  expect(page.textContent).toContain(t('errors.cancelled'))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(location.search).toBe('?app=example-app')
  expect(page.querySelector('a')).toBeNull()
})
test('app state accepts IDs, never URLs or paths', () => {
  expect(recoverAppId('example-app')).toBe('example-app')
  for (const state of [null, '', '../example-app', 'https://evil.example', { app: 'example-app' }])
    expect(recoverAppId(state)).toBeNull()
})
test('provider failure enables retry and never reveals library error details', async () => {
  const page = root()
  const failure: SignupOAuth = {
    ...result(null),
    start: async () => {
      throw new Error('secret code and stack trace')
    },
  }
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
  if (page.querySelector<HTMLElement>('.provider-controls')!.hidden)
    page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
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

test.each(['default', 'example-app', 'example-app-dark'])(
  '%s only offers its allowed providers, including after filters are cleared and signup is retried',
  async appId => {
    history.replaceState(null, '', `/?app=${appId}`)
    const page = root()
    const start = vi.fn(async () => {
      throw new SignupError('errors.authorization')
    })
    dispose = await launch(page, { ...result(null), start })
    page.querySelector<HTMLButtonElement>('button')!.click()
    const expected = providerSource
      .filter(provider => provider.enabled && (appId === 'default' || provider.id !== 'bluesky'))
      .map(provider => provider.id)
      .sort()
    expect(visibleProviders(page).sort()).toEqual(
      expected.filter(id => !providerSource.find(provider => provider.id === id)!.requiresInvite),
    )
    page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
    choose(page, 'provider-invites', 'all')
    expect(visibleProviders(page).sort()).toEqual(expected)
    choose(page, 'provider-invites', 'required')
    page.querySelector<HTMLButtonElement>('.clear-filters')!.click()
    choose(page, 'provider-sort', 'za')
    expect(visibleProviders(page).sort()).toEqual(expected)
    page.querySelector<HTMLButtonElement>('.provider')!.click()
    await vi.waitFor(() => expect(page.dataset.view).toBe('error'))
    expect(start).toHaveBeenCalledWith(
      providerSource.find(provider => provider.id === expected.at(-1))?.serviceUrl,
      appId,
    )
    page.querySelector<HTMLButtonElement>('button')!.click()
    expect(visibleProviders(page).sort()).toEqual(expected)
  },
)

test('allowlists constrain region choices and cannot enable a disabled provider', async () => {
  const app = apps.find(app => app.id === 'example-app')!
  const original = app.providerAllowlist
  app.providerAllowlist = ['eurosky', 'witchcraft-systems']
  const provider = providerSource.find(provider => provider.id === 'witchcraft-systems')!
  const enabled = provider.enabled
  provider.enabled = false
  try {
    history.replaceState(null, '', '/?app=example-app')
    const page = root()
    dispose = await launch(page, result(null))
    page.querySelector<HTMLButtonElement>('button')!.click()
    expect(visibleProviders(page)).toEqual(['eurosky'])
    expect([...page.querySelectorAll<HTMLInputElement>('.region-choices input')].map(input => input.value)).toEqual([
      'European Union',
    ])
  } finally {
    app.providerAllowlist = original
    provider.enabled = enabled
  }
})

test('provider sorting defaults to A–Z and offers only alphabetical orders', async () => {
  const page = root()
  dispose = await launch(page, result(null))
  page.querySelector<HTMLButtonElement>('button')!.click()
  choose(page, 'provider-invites', 'all')
  expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual([
    'az',
    'za',
  ])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('az')
  const alphabetical = providerSource
    .filter(provider => provider.enabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(provider => provider.id)
  expect(visibleProviders(page)).toEqual(alphabetical)
  choose(page, 'provider-sort', 'za')
  expect(visibleProviders(page)).toEqual([...alphabetical].reverse())
  choose(page, 'provider-sort', 'az')
  expect(visibleProviders(page)).toEqual(alphabetical)
})

test('multiple regions combine with invite requirements and clear filters recovers empty results', async () => {
  const page = root()
  dispose = await launch(page, result(null))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(page.querySelector<HTMLElement>('.provider-controls')!.hidden).toBe(true)
  expect(visibleProviders(page)).toEqual(
    providerSource
      .filter(provider => provider.enabled && !provider.requiresInvite)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(provider => provider.id),
  )
  choose(page, 'provider-invites', 'all')
  region(page, 'European Union')
  region(page, 'Canada')
  expect(visibleProviders(page)).toEqual(['eurosky', 'margin-cafe', 'northsky', 'npmx', 'tangled', 'w-social'])
  choose(page, 'provider-invites', 'required')
  expect(visibleProviders(page)).toEqual(['northsky', 'w-social'])
  choose(page, 'provider-invites', 'none')
  expect(visibleProviders(page)).toEqual(['eurosky', 'margin-cafe', 'npmx', 'tangled'])
  page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
  expect(page.querySelector<HTMLElement>('.provider-controls')!.hidden).toBe(true)
  region(page, 'European Union')
  expect(visibleProviders(page)).toEqual([])
  expect(page.querySelector<HTMLElement>('.provider-empty')!.hidden).toBe(false)
  choose(page, 'provider-sort', 'za')
  page.querySelector<HTMLButtonElement>('.provider-toggle')!.click()
  page.querySelector<HTMLButtonElement>('.clear-filters')!.click()
  expect(visibleProviders(page)).toEqual([
    'witchcraft-systems',
    'w-social',
    'tophhie-social',
    'tangled',
    'spark',
    'selfhosted-social',
    'pckt',
    'npmx',
    'northsky',
    'margin-cafe',
    'eurosky',
    'bluesky',
    'blacksky',
  ])
  expect(page.querySelector<HTMLElement>('.provider-empty')!.hidden).toBe(true)
  expect(page.querySelector<HTMLButtonElement>('.provider-toggle')!.getAttribute('aria-expanded')).toBe('false')
  expect(page.querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(true)
  expect(document.activeElement).toBe(page.querySelector('.provider-toggle'))
})

test('failed signup preserves alphabetical sorting and filtered choices', async () => {
  const page = root()
  const failure: SignupOAuth = {
    ...result(null),
    start: async () => {
      throw new Error('failed')
    },
  }
  dispose = await launch(page, failure)
  page.querySelector<HTMLButtonElement>('button')!.click()
  choose(page, 'provider-sort', 'za')
  region(page, 'European Union')
  choose(page, 'provider-invites', 'none')
  expect(visibleProviders(page)).toEqual(['tangled', 'npmx', 'margin-cafe', 'eurosky'])
  page.querySelector<HTMLButtonElement>('.provider:not([hidden])')!.click()
  expect(
    [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].every(
      control => control.disabled,
    ),
  ).toBe(true)
  await vi.waitFor(() => expect(page.dataset.view).toBe('error'))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(visibleProviders(page)).toEqual(['tangled', 'npmx', 'margin-cafe', 'eurosky'])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('za')
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.disabled).toBe(false)
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
