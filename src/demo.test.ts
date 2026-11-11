// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mountDemo } from './demo'
import { providers } from './providers'

let root: HTMLElement
let unmount: () => void
beforeEach(() => {
  vi.useFakeTimers()
  root = document.createElement('main')
  document.body.append(root)
  unmount = mountDemo(root)
})
afterEach(() => {
  unmount()
  document.body.replaceChildren()
  vi.useRealTimers()
})
function field(name: string) {
  return root.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!
}
function choose(name: string, value: string) {
  const input = field(name)
  input.value = value
  input.dispatchEvent(new Event('change'))
}
function layout(value: string) {
  root.querySelector<HTMLInputElement>(`input[name="layout"][value="${value}"]`)!.click()
}
function submit(container: ParentNode, value: string) {
  container.querySelector<HTMLInputElement>('[data-part="identifier"]')!.value = value
  container.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
}
function open() {
  const button = document.querySelector<HTMLButtonElement>('.demo-navigation button')!
  button.focus()
  button.click()
  return document.querySelector<HTMLDialogElement>('dialog')!
}

test('the small header button opens the library dialog and no auth session is started on load', () => {
  expect(root.querySelector('[data-launcher]')).toBeNull()
  const dialog = open()
  expect(dialog.open).toBe(true)
  expect(dialog.querySelector('[data-launcher]')?.getAttribute('data-view')).toBe('signin')
  expect(document.activeElement).toBe(dialog.querySelector('h2'))
  expect(dialog.querySelector('input[autocomplete="username"]')).not.toBeNull()
})

test('inline forms preserve focus, validate handles, block duplicate submits, and simulate completion', async () => {
  const radio = root.querySelector<HTMLInputElement>('input[value="inline"]')!
  radio.focus()
  radio.click()
  expect(document.activeElement).toBe(radio)
  const container = root.querySelector<HTMLElement>('[data-launcher]')!
  submit(container, 'incomplete')
  expect(container.querySelector('input[aria-invalid="true"]')).not.toBeNull()
  submit(container, 'tester.demo.test')
  expect(container.getAttribute('aria-busy')).toBe('true')
  expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  await vi.runAllTimersAsync()
  expect(container.dataset.view).toBe('complete')
  expect(container.textContent).toContain('@tester.demo.test')
  expect(container.querySelector('.demo-result-handle')?.textContent).not.toContain('did:')
})

test('a failed sign-in can be retried with its original handle, then completes', async () => {
  choose('response', 'retry')
  const dialog = open()
  submit(dialog, 'tester.demo.test')
  await vi.runAllTimersAsync()
  expect(dialog.querySelector('[data-view="error"]')).not.toBeNull()
  dialog.querySelector<HTMLButtonElement>('[data-launcher] > button')!.click()
  expect(dialog.querySelector<HTMLInputElement>('input')!.value).toBe('tester.demo.test')
  submit(dialog, 'tester.demo.test')
  await vi.runAllTimersAsync()
  expect(dialog.querySelector('[data-view="complete"]')).not.toBeNull()
})

test('closing a dialog during sign-in aborts its pending simulation and restores focus', async () => {
  const dialog = open()
  submit(dialog, 'tester.demo.test')
  dialog.close()
  dialog.dispatchEvent(new Event('close'))
  await vi.runAllTimersAsync()
  expect(document.querySelector('dialog')).toBeNull()
  expect(document.activeElement).toBe(document.querySelector('.demo-navigation button'))
  expect(vi.getTimerCount()).toBe(0)
})

test('sign-in-only and signup-only modes are independent of presentation', () => {
  choose('mode', 'signin')
  layout('inline')
  expect(root.querySelector('[data-view="signin"]')).not.toBeNull()
  expect(root.querySelector('[data-launcher] > .secondary')).toBeNull()
  choose('mode', 'signup')
  expect(root.querySelector('[data-view="intro"]')).not.toBeNull()
  expect(root.querySelector('[data-launcher] > .secondary')).toBeNull()
  layout('fullscreen')
  root.querySelector<HTMLButtonElement>('.demo-app-home button')!.click()
  expect(document.querySelector('dialog')?.dataset.presentation).toBe('fullscreen')
  expect(document.querySelector('dialog [data-view="intro"]')).not.toBeNull()
})

test('Spanish catalogs apply to the component subtree and can be switched back without retaining a flow', () => {
  layout('inline')
  const englishLabel = root.querySelector('[data-launcher] label')!.textContent
  choose('language', 'es')
  expect(root.querySelector('.demo-preview-body')?.getAttribute('lang')).toBe('es')
  expect(root.querySelector('[data-launcher] label')!.textContent).not.toBe(englishLabel)
  choose('language', 'en')
  expect(root.querySelector('[data-launcher] label')!.textContent).toBe(englishLabel)
})

test('host allowlists are drawn from the registry, support an empty list, and exclude custom signup', () => {
  layout('picker')
  const supported = providers.filter(provider => provider.enabled)
  expect(root.querySelectorAll('[data-provider]')).toHaveLength(supported.length)
  const custom = root.querySelector<HTMLInputElement>('input[name="custom"]')!
  custom.click()
  root.querySelector<HTMLInputElement>('input[name="limited"]')!.click()
  expect(custom.disabled).toBe(true)
  expect([...root.querySelectorAll<HTMLElement>('[data-provider]')].map(node => node.dataset.provider)).toEqual(
    supported
      .slice(0, 3)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(provider => provider.id),
  )
  for (const input of root.querySelectorAll<HTMLInputElement>('.demo-host-list input:checked')) input.click()
  expect(root.querySelectorAll('[data-provider]')).toHaveLength(0)
  expect(root.querySelector('.provider-empty')?.hasAttribute('hidden')).toBe(false)
  root.querySelector<HTMLInputElement>('input[name="limited"]')!.click()
  layout('inline')
  choose('mode', 'signup')
  root.querySelector<HTMLButtonElement>('[data-launcher] > button')!.click()
  expect(root.querySelector('.custom-service-form')).not.toBeNull()
})

test('standalone selection exposes the real provider URL without invoking authentication', () => {
  layout('picker')
  const card = root.querySelector<HTMLButtonElement>('[data-provider]:not([hidden])')!
  const provider = providers.find(provider => provider.id === card.dataset.provider)!
  card.click()
  expect(root.querySelector('.demo-selected-host')?.textContent).toContain(provider.serviceUrl)
  expect(document.querySelector('dialog')).toBeNull()
})

test('unmount cancels active inline work and removes external headers and dialogs', async () => {
  layout('inline')
  submit(root.querySelector('[data-launcher]')!, 'tester.demo.test')
  unmount()
  await vi.runAllTimersAsync()
  expect(root.childElementCount).toBe(0)
  expect(document.querySelector('header, footer, dialog')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

test('implementation snippets follow presentation, locale, host policy, and OAuth transport', () => {
  const code = () => root.querySelector('code')!.textContent!
  choose('transport', 'popup')
  expect(code()).toContain("transport: 'popup'")
  expect(code()).toContain('openLoginDialog(flow')
  layout('inline')
  choose('language', 'es')
  expect(code()).toContain('mountLogin(container, flow')
  expect(code()).toContain('launcher-components/locales/es.json')
  layout('picker')
  expect(code()).toContain('selectProviders(')
  expect(code()).not.toContain('createBrowserOAuthAdapter')
})

test('DID sign-ins complete with a simulated handle rather than treating a DID as a handle', async () => {
  layout('inline')
  const container = root.querySelector<HTMLElement>('[data-launcher]')!
  const did = 'did:web:demo.test'
  submit(container, did)
  await vi.runAllTimersAsync()
  expect(container.dataset.view).toBe('complete')
  expect(container.querySelector('.demo-result-handle')?.textContent).not.toContain('did:')
  expect(container.textContent).not.toContain(did)
})

test('hosted signup is simulated locally and completes without sending the provider URL as an identity', async () => {
  layout('inline')
  choose('mode', 'signup')
  root.querySelector<HTMLButtonElement>('[data-launcher] > button')!.click()
  root.querySelector<HTMLButtonElement>('[data-provider]:not([hidden])')!.click()
  await vi.runAllTimersAsync()
  expect(root.querySelector('[data-view="complete"]')).not.toBeNull()
  expect(root.querySelector('.demo-result-handle')?.textContent).not.toContain('https:')
})

test('copying code provides a manual fallback when the clipboard API is unavailable', () => {
  const clipboard = vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined!)
  try {
    const button = root.querySelector<HTMLButtonElement>('.demo-code-toolbar button')!
    const initial = button.textContent
    button.click()
    expect(button.textContent).not.toBe(initial)
    expect(root.querySelector('code')?.textContent).toContain('createLoginFlow')
  } finally {
    clipboard.mockRestore()
  }
})
