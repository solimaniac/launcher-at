/** App configuration validation, shared by the browser and the build. */
import type { PdsProvider } from '@apogeekit/pds-registry'
export { parseProviders } from '@apogeekit/pds-registry'
export type Provider = PdsProvider

export const DEFAULT_APP_ID = 'default'

/** Lowercase letters/digits with single hyphen separators, e.g. `my-app`. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
/** Characters that could break out of the CSS custom property the font is written to. */
const UNSAFE_FONT_PATTERN = /[;{}<>]/

export interface AppConfig {
  id: string
  appName: string
  redirectUrl?: string
  logo_url?: string
  /** Provider IDs offered for signup; omitted means all enabled providers. */
  providerAllowlist?: string[]
  theme: {
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    textColor: string
    fontFamily: string
  }
}

/** Returns the normalized URL, rejecting anything that is not HTTPS or carries credentials. */
export function httpsUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('URL must be a string')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('URL must use HTTPS without credentials')
  }
  return url.href
}

export function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected configuration object')
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseApps(value: unknown[], providers: readonly Provider[]): AppConfig[] {
  const ids = new Set<string>()
  const providerIds = new Set(providers.map(provider => provider.id))

  const apps = value.map(entry => {
    const app = record(entry)
    const theme = record(app.theme)
    if (!validId(app.id) || !nonEmptyString(app.appName) || ids.has(app.id)) {
      throw new Error('Invalid or duplicate app')
    }
    ids.add(app.id)

    for (const key of ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor']) {
      const color = theme[key]
      if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
        throw new Error('Theme requires six-digit hex colors')
      }
    }
    if (!nonEmptyString(theme.fontFamily) || UNSAFE_FONT_PATTERN.test(theme.fontFamily)) {
      throw new Error('Invalid theme font')
    }
    if (app.redirectUrl !== undefined) httpsUrl(app.redirectUrl)
    if (app.logo_url !== undefined) httpsUrl(app.logo_url)
    if (app.providerAllowlist !== undefined) {
      if (
        !Array.isArray(app.providerAllowlist) ||
        app.providerAllowlist.length === 0 ||
        app.providerAllowlist.some(id => typeof id !== 'string' || !providerIds.has(id)) ||
        new Set(app.providerAllowlist).size !== app.providerAllowlist.length
      ) {
        throw new Error('providerAllowlist must be a non-empty array of unique known provider IDs')
      }
    }
    if (app.id === DEFAULT_APP_ID && app.redirectUrl !== undefined) throw new Error('Default app cannot redirect')

    return app as unknown as AppConfig
  })

  if (!ids.has(DEFAULT_APP_ID)) throw new Error('Default app is required')
  return apps
}

/** Finds an app by ID, falling back to the default app. `unknown` is true when an ID was given but not found. */
export function lookupApp(apps: AppConfig[], id: unknown): { app: AppConfig; unknown: boolean } {
  const found = validId(id) ? apps.find(app => app.id === id) : undefined
  const fallback = apps.find(app => app.id === DEFAULT_APP_ID)!
  return { app: found ?? fallback, unknown: id !== null && id !== undefined && !found }
}
