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
  expect(document.title).toBe(`Sign up for ${app.appName}`)
  expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
    `Sign up for ${app.appName}`,
  )
  expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
    'https://launcher.example/?app=quoted-app',
  )
  window.close()
})
