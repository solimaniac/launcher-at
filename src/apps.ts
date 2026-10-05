import { parseApps, lookupApp, type AppConfig } from './config'

/** Every `apps/<id>/config.json`, discovered and validated at build time. */
const modules = import.meta.glob('../apps/*/config.json', { eager: true, import: 'default' })
export const apps = parseApps(Object.values(modules))

export function selectApp(id: unknown) {
  return lookupApp(apps, id)
}

/** Theme field → CSS custom property consumed by the stylesheets. */
const THEME_PROPERTIES: Record<keyof AppConfig['theme'], string> = {
  primaryColor: '--color-primary',
  secondaryColor: '--color-secondary',
  backgroundColor: '--color-background',
  textColor: '--color-text',
  fontFamily: '--font-family',
}

/** WCAG relative luminance of a `#rrggbb` color. */
function relativeLuminance(hex: string) {
  const [red, green, blue] = hex.match(/[a-f\d]{2}/gi)!.map(channel => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

export function applyTheme(app: AppConfig) {
  const style = document.documentElement.style
  for (const [key, property] of Object.entries(THEME_PROPERTIES)) {
    style.setProperty(property, app.theme[key as keyof AppConfig['theme']])
  }
  // Button text is black or white, whichever contrasts more with the configured primary color.
  const onPrimary = relativeLuminance(app.theme.primaryColor) > 0.179 ? '#000000' : '#ffffff'
  style.setProperty('--color-on-primary', onPrimary)
}
