import { parseApps, lookupApp, type AppConfig } from './config'
const modules = import.meta.glob('../apps/*/config.json', { eager: true, import: 'default' })
export const apps = parseApps(Object.values(modules))
export function selectApp(id: unknown) { return lookupApp(apps, id) }
export function applyTheme(app: AppConfig) {
  const keys = { primaryColor: 'color-primary', secondaryColor: 'color-secondary', backgroundColor: 'color-background', textColor: 'color-text', fontFamily: 'font-family' }
  for (const [key, css] of Object.entries(keys)) document.documentElement.style.setProperty('--' + css, app.theme[key as keyof typeof app.theme])
  // Choose the higher WCAG contrast without changing the configured accent.
  const channels = app.theme.primaryColor.match(/[a-f\d]{2}/gi)!.map(hex => {
    const value = parseInt(hex, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  document.documentElement.style.setProperty('--color-on-primary', luminance > 0.179 ? '#000000' : '#ffffff')
}
