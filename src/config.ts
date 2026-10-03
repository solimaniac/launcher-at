export interface Provider { id: string; name: string; serviceUrl: string; description: string; logo?: string; enabled: boolean }
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
export function parseProviders(value: unknown): Provider[] {
  if (!Array.isArray(value)) throw new Error('Expected provider array')
  const ids = new Set<string>(), services = new Set<string>()
  return value.map(entry => {
    const p = record(entry)
    if (!validId(p.id) || !text(p.name) || !text(p.description) || typeof p.enabled !== 'boolean') throw new Error('Invalid provider fields')
    const serviceUrl = httpsUrl(p.serviceUrl)
    if (ids.has(p.id) || services.has(serviceUrl)) throw new Error('Duplicate provider')
    ids.add(p.id); services.add(serviceUrl)
    if (p.logo !== undefined && (!text(p.logo) || !/^\/[a-zA-Z0-9/_ .-]+$/.test(p.logo) || p.logo.includes('..'))) throw new Error('Invalid logo path')
    return { id: p.id, name: p.name, description: p.description, enabled: p.enabled, serviceUrl, ...(p.logo ? { logo: p.logo as string } : {}) }
  })
}
