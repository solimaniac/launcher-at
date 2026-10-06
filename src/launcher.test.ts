// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { launch } from './launcher'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'
import { t } from './i18n'
import type { JoinCounts } from './activity'
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
  expect(page.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://bsky.app/')
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

test('join sorting handles late counts, ties, zero and unavailable counts without losing focus', async () => {
  let resolve!: (value: JoinCounts) => void
  const counts = new Promise<JoinCounts>(done => {
    resolve = done
  })
  const page = root()
  dispose = await launch(page, result(null), false, counts)
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual([
    'az',
    'za',
  ])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('az')
  expect(visibleProviders(page)).toEqual([
    'blacksky',
    'bluesky',
    'eurosky',
    'margin-cafe',
    'northsky',
    'npmx',
    'pckt',
    'selfhosted-social',
    'spark',
    'tangled',
    'tophhie-social',
    'w-social',
    'witchcraft-systems',
  ])
  const focused = page.querySelector<HTMLButtonElement>('[data-provider="bluesky"]')!
  focused.focus()
  resolve({
    windowDays: 30,
    providers: new Map([
      ['spark', 24],
      ['eurosky', 24],
      ['bluesky', 0],
    ]),
  })
  await counts
  expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual([
    'joins',
    'az',
    'za',
  ])
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('joins')
  expect(visibleProviders(page)).toEqual([
    'eurosky',
    'spark',
    'bluesky',
    'blacksky',
    'margin-cafe',
    'northsky',
    'npmx',
    'pckt',
    'selfhosted-social',
    'tangled',
    'tophhie-social',
    'w-social',
    'witchcraft-systems',
  ])
  expect(document.activeElement).toBe(focused)
  choose(page, 'provider-sort', 'za')
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
  choose(page, 'provider-sort', 'az')
  expect(visibleProviders(page)[0]).toBe('blacksky')
})

test('multiple regions combine with invite requirements and clear filters recovers empty results', async () => {
  const page = root()
  dispose = await launch(page, result(null))
  page.querySelector<HTMLButtonElement>('button')!.click()
  expect(page.querySelector<HTMLElement>('.provider-controls')!.hidden).toBe(true)
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

test('late counts respect alphabetical selection and failed signup preserves filtered choices', async () => {
  let resolve!: (value: JoinCounts) => void
  const counts = new Promise<JoinCounts>(done => {
    resolve = done
  })
  const page = root()
  const failure: SignupOAuth = {
    ...result(null),
    start: async () => {
      throw new Error('failed')
    },
  }
  dispose = await launch(page, failure, false, counts)
  page.querySelector<HTMLButtonElement>('button')!.click()
  choose(page, 'provider-sort', 'za')
  region(page, 'European Union')
  choose(page, 'provider-invites', 'none')
  resolve({ windowDays: 30, providers: new Map([['eurosky', 42]]) })
  await counts
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
  expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.disabled).toBe(false)
})

test.each([undefined, true, false])(
  'joinCounts=%s controls counts and sorting before and after arrival',
  async joinCounts => {
    const app = apps.find(app => app.id === 'example-app')!
    const original = Object.getOwnPropertyDescriptor(app, 'joinCounts')
    Object.assign(app, { joinCounts })
    try {
      history.replaceState(null, '', '/?app=example-app')
      const page = root()
      let resolve!: (value: JoinCounts) => void
      const counts = new Promise<JoinCounts>(done => {
        resolve = done
      })
      const failure: SignupOAuth = {
        ...result(null),
        start: async () => {
          throw new SignupError('errors.authorization')
        },
      }
      dispose = await launch(page, failure, false, counts)
      page.querySelector<HTMLButtonElement>('button')!.click()
      const alphabetical = visibleProviders(page)
      resolve({ windowDays: 30, providers: new Map([['spark', 42]]) })
      await counts
      const assertVisibility = () => {
        const sort = page.querySelector<HTMLSelectElement>('#provider-sort')!
        const countText = t('providers.joined', { joined: '42', days: 30 })
        if (joinCounts === false) {
          expect(page.textContent).not.toContain(countText)
          expect([...sort.options].map(option => option.value)).toEqual(['az', 'za'])
          expect(sort.value).toBe('az')
          expect(visibleProviders(page)).toEqual(alphabetical)
        } else {
          expect(page.textContent).toContain(countText)
          expect(sort.value).toBe('joins')
          expect(visibleProviders(page)[0]).toBe('spark')
        }
      }
      assertVisibility()
      page.querySelector<HTMLButtonElement>('.provider')!.click()
      await vi.waitFor(() => expect(page.dataset.view).toBe('error'))
      page.querySelector<HTMLButtonElement>('button')!.click()
      assertVisibility()
      dispose()
      dispose = await launch(page, failure, false, counts)
      page.querySelector<HTMLButtonElement>('button')!.click()
      assertVisibility()
    } finally {
      if (original) Object.defineProperty(app, 'joinCounts', original)
      else Reflect.deleteProperty(app, 'joinCounts')
    }
  },
)

test('join-count sort is omitted for failed, empty, or unrelated counts but includes measured zero', async () => {
  for (const counts of [
    undefined,
    Promise.reject(new Error('offline')),
    Promise.resolve({ windowDays: 30, providers: new Map<string, number>() }),
    Promise.resolve({ windowDays: 30, providers: new Map([['unknown-provider', 9]]) }),
  ]) {
    const page = root()
    dispose = await launch(page, result(null), false, counts)
    page.querySelector<HTMLButtonElement>('button')!.click()
    openControls(page)
    expect([...page.querySelectorAll<HTMLOptionElement>('#provider-sort option')].map(option => option.value)).toEqual([
      'az',
      'za',
    ])
    expect(page.querySelector<HTMLSelectElement>('#provider-sort')!.value).toBe('az')
    dispose()
  }
  const page = root()
  dispose = await launch(
    page,
    result(null),
    false,
    Promise.resolve({ windowDays: 30, providers: new Map([['spark', 0]]) }),
  )
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
