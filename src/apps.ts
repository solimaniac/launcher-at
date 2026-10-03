import { parseApps, lookupApp } from './config'
const modules = import.meta.glob('../apps/*/config.json', { eager: true, import: 'default' })
export const apps = parseApps(Object.values(modules))
export function selectApp(id: unknown) { return lookupApp(apps, id) }
export function applyTheme(app: (typeof apps)[number]) {
  const keys = { primaryColor: 'color-primary', secondaryColor: 'color-secondary', backgroundColor: 'color-background', textColor: 'color-text', fontFamily: 'font-family' }
  for (const [key, css] of Object.entries(keys)) document.documentElement.style.setProperty('--' + css, app.theme[key as keyof typeof app.theme])
}
