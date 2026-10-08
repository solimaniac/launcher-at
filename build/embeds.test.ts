import { expect, test } from 'vitest'
import { Window } from 'happy-dom'
import { embedTags } from './embeds.ts'
import defaultApp from '../apps/default/config.json' with { type: 'json' }

test('app names remain text in metadata and cannot inject HTML', () => {
  const window = new Window()
  const document = window.document
  const app = { ...defaultApp, id: 'quoted-app', appName: 'A "quoted" & <script>alert(1)</script> app' }
  document.head.innerHTML = embedTags(app, 'https://launcher.example')
  expect(document.querySelector('script')).toBeNull()
  expect(document.title).toContain(app.appName)
  expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain(app.appName)
  expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
    'https://launcher.example/?app=quoted-app',
  )
  window.close()
})

test('generic metadata omits app identity while custom metadata retains it', () => {
  const window = new Window()
  const document = window.document
  document.head.innerHTML = embedTags(defaultApp, 'https://signup.example')
  expect(document.querySelector('meta[property="og:site_name"]')).toBeNull()
  for (const selector of ['title', 'meta[property="og:title"]', 'meta[property="og:image:alt"]']) {
    const tag = document.querySelector(selector)!
    expect(tag.getAttribute('content') ?? tag.textContent).not.toContain(defaultApp.appName)
  }
  const app = { ...defaultApp, id: 'custom', appName: 'Custom App' }
  document.head.innerHTML = embedTags(app, 'https://signup.example')
  expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe(app.appName)
  expect(document.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toContain(app.appName)
  window.close()
})
