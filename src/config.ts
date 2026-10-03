export interface Provider { id: string; name: string; serviceUrl: string; description: string; region: string; logo?: string; enabled: boolean }
export function httpsUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('URL must be a string')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('URL must use HTTPS without credentials')
  return url.href
}
export function validId(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected configuration object')
  return value as Record<string, unknown>
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function validateLogo(value: unknown) {
  if (!text(value) || !/^\/[a-zA-Z0-9/_ .-]+$/.test(value) || value.startsWith('//') || value.includes('..')) throw new Error('Invalid local logo path')
}
export function parseProviders(value: unknown): Provider[] {
  if (!Array.isArray(value)) throw new Error('Expected provider array')
  const ids = new Set<string>(), services = new Set<string>()
  return value.map(entry => {
    const p = record(entry)
    if (!validId(p.id) || !text(p.name) || !text(p.description) || !text(p.region) || typeof p.enabled !== 'boolean') throw new Error('Invalid provider fields')
    const parsedUrl = new URL(httpsUrl(p.serviceUrl))
    const serviceUrl = parsedUrl.pathname === '/' && !parsedUrl.search && !parsedUrl.hash ? parsedUrl.origin : parsedUrl.href
    if (ids.has(p.id) || services.has(serviceUrl)) throw new Error('Duplicate provider')
    ids.add(p.id); services.add(serviceUrl)
    if (p.logo !== undefined) validateLogo(p.logo)
    return { id: p.id, name: p.name, description: p.description, region: p.region.trim(), enabled: p.enabled, serviceUrl, ...(p.logo ? { logo: p.logo as string } : {}) }
  })
}
export interface AppConfig {
  id: string
  appName: string
  redirectUrl?: string
  logo?: string
  theme: { primaryColor: string; secondaryColor: string; backgroundColor: string; textColor: string; fontFamily: string }
}
export function parseApps(value: unknown[]): AppConfig[] {
  const ids = new Set<string>()
  const apps = value.map(entry => {
    const app = record(entry), theme = record(app.theme)
    if (!validId(app.id) || !text(app.appName) || ids.has(app.id)) throw new Error('Invalid or duplicate app')
    ids.add(app.id)
    for (const key of ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor']) {
      if (typeof theme[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(theme[key])) throw new Error('Theme requires six-digit hex colors')
    }
    if (!text(theme.fontFamily) || /[;{}<>]/.test(theme.fontFamily)) throw new Error('Invalid theme font')
    if (app.redirectUrl !== undefined) httpsUrl(app.redirectUrl)
    if (app.logo !== undefined) validateLogo(app.logo)
    if (app.id === 'default' && app.redirectUrl !== undefined) throw new Error('Default app cannot redirect')
    return app as unknown as AppConfig
  })
  if (!ids.has('default')) throw new Error('Default app is required')
  return apps
}
export function lookupApp(apps: AppConfig[], id: unknown): { app: AppConfig; unknown: boolean } {
  const found = validId(id) ? apps.find(app => app.id === id) : undefined
  return { app: found ?? apps.find(app => app.id === 'default')!, unknown: id !== null && id !== undefined && !found }
}
