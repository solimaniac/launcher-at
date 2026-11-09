// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createLoginFlow } from '../src/index'
import { mountLogin, renderProviderPicker } from '../src/dom'
import { providers } from './fixtures'

afterEach(() => document.body.replaceChildren())
function root() {
  const node = document.createElement('section')
  document.body.append(node)
  return node
}

test('instances use independent IDs, visible labels, light DOM, and local effects', () => {
  document.title = 'Consumer title'
  const a = root(),
    b = root()
  const one = createLoginFlow({ providers, auth: { start: async () => {} } })
  const two = createLoginFlow({ providers, auth: { start: async () => {} } })
  const stopOne = mountLogin(a, one),
    stopTwo = mountLogin(b, two)
  const ids = [...document.querySelectorAll('[id]')].map(n => n.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(a.querySelector('label')!.htmlFor).toBe(a.querySelector('input')!.id)
  expect(a.shadowRoot).toBeNull()
  expect(document.title).toBe('Consumer title')
  stopOne()
  one.destroy()
  expect(b.querySelector('input')).not.toBeNull()
  stopTwo()
  two.destroy()
})

test('handle validation retains input, describes the error, and moves focus to the field', async () => {
  const node = root()
  const start = vi.fn(async () => {})
  const flow = createLoginFlow({ providers, auth: { start } })
  mountLogin(node, flow)
  node.querySelector('input')!.value = 'alice'
  node.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  const input = node.querySelector('input')!
  expect(input.value).toBe('alice')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('aria-describedby')).toContain(node.querySelector('[role="alert"]')!.id)
  expect(start).not.toHaveBeenCalled()
  flow.destroy()
})

test('provider selection preserves filtering, never submits a parent form, and safely renders text', () => {
  const page = root()
  const selected = vi.fn()
  const picker = renderProviderPicker(document, {
    providers: [
      ...providers,
      { ...providers[0]!, id: 'unsafe', name: '<img src=x onerror=alert(1)>', description: '<script>steal()</script>' },
    ],
    onSelect: selected,
    logoUrl: () => 'javascript:alert(1)',
  })
  page.append(picker.element)
  expect(page.querySelector('img, script')).toBeNull()
  expect(page.textContent).toContain('<script>steal()</script>')
  expect(page.querySelector('[data-provider="disabled"]')).toBeNull()
  for (const b of page.querySelectorAll('button')) expect(b.type).toBe('button')
  const invite = page.querySelectorAll('select')[0]!
  invite.value = 'required'
  invite.dispatchEvent(new Event('change'))
  expect([...page.querySelectorAll<HTMLElement>('.provider:not([hidden])')].map(n => n.dataset.provider)).toEqual([
    'beta',
  ])
  page.querySelector<HTMLButtonElement>('.clear-filters')!.click()
  page.querySelector<HTMLButtonElement>('[data-provider="alpha"]')!.click()
  expect(selected).toHaveBeenCalledWith(providers[0])
})

test('busy controls block duplicate selection and recover without leaking library errors', async () => {
  const node = root()
  const flow = createLoginFlow({
    providers,
    mode: 'signup',
    auth: {
      start: async () => {
        throw new Error('secret authorization URL')
      },
    },
  })
  mountLogin(node, flow, { headingLevel: 1 })
  node.querySelector('button')!.click()
  node.querySelector<HTMLButtonElement>('.provider')!.click()
  expect(node.getAttribute('aria-busy')).toBe('true')
  expect([...node.querySelectorAll('button, input, select')].every(n => (n as HTMLInputElement).disabled)).toBe(true)
  await vi.waitFor(() => expect(node.dataset.view).toBe('error'))
  expect(node.textContent).not.toContain('secret authorization URL')
  node.querySelector('button')!.click()
  expect(node.dataset.view).toBe('providers')
  expect(document.activeElement).toBe(node.querySelector('h1'))
  flow.destroy()
})
