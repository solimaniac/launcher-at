import source from '../data/providers.json'

/** A signup entrypoint may be a PDS or an entryway serving multiple PDSs. */
export interface PdsProvider {
  readonly id: string
  readonly name: string
  readonly serviceUrl: string
  /** Plain text, never a locale key or HTML. */
  readonly description: string
  /** Editorial hosting region; not a residency or jurisdiction guarantee. */
  readonly region: string
  readonly enabled: boolean
  /** Filename in the package's logos/ directory; not a URL. */
  readonly logo?: string
  /** Absence means unknown, not that signups are open. */
  readonly requiresInvite?: boolean
}

export interface ProviderQuery {
  /** Omitted: all enabled hosts. Empty: no hosts. Unknown IDs throw. */
  ids?: readonly string[]
  regions?: readonly string[]
  invite?: 'any' | 'not-required' | 'required' | 'unknown'
  sort?: 'az' | 'za'
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const LOGO = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:svg|png|webp|jpe?g)$/

export function normalizeServiceUrl(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('serviceUrl must be a string')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new TypeError('serviceUrl must be HTTPS without credentials, query or fragment')
  }
  return url.pathname === '/' ? url.origin : url.href.replace(/\/$/, '')
}

/** Validate JSON obtained from a file or a remote mirror before using it. */
export function parseProviders(value: unknown): readonly PdsProvider[] {
  if (!Array.isArray(value)) throw new TypeError('Expected a provider array')
  const ids = new Set<string>()
  const urls = new Set<string>()
  return Object.freeze(value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Invalid provider')
    const p = entry as Record<string, unknown>
    const text = (key: string): string => {
      if (typeof p[key] !== 'string' || !(p[key] as string).trim()) throw new TypeError(`Invalid ${key}`)
      return (p[key] as string).trim()
    }
    const id = text('id')
    if (!ID.test(id) || ids.has(id)) throw new TypeError('Invalid or duplicate provider ID')
    const serviceUrl = normalizeServiceUrl(p.serviceUrl)
    if (urls.has(serviceUrl)) throw new TypeError('Duplicate provider URL')
    if (typeof p.enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
    if (p.requiresInvite !== undefined && typeof p.requiresInvite !== 'boolean') throw new TypeError('requiresInvite must be a boolean')
    if (p.logo !== undefined && (typeof p.logo !== 'string' || !LOGO.test(p.logo) || p.logo.includes('..'))) throw new TypeError('Invalid logo filename')
    ids.add(id)
    urls.add(serviceUrl)
    return Object.freeze({
      id, name: text('name'), serviceUrl, description: text('description'), region: text('region'), enabled: p.enabled,
      ...(p.logo !== undefined ? { logo: p.logo as string } : {}),
      ...(p.requiresInvite !== undefined ? { requiresInvite: p.requiresInvite as boolean } : {}),
    })
  }))
}

/** An immutable, bundled snapshot. Importing this module performs no network requests. */
export const providers = parseProviders(source)

export function getProvider(id: string): PdsProvider | undefined {
  return providers.find(provider => provider.id === id)
}

export function selectProviders(query: ProviderQuery = {}, directory: readonly PdsProvider[] = providers): readonly PdsProvider[] {
  for (const id of query.ids ?? []) if (!directory.some(p => p.id === id)) throw new TypeError(`Unknown provider: ${id}`)
  return directory.filter(p => p.enabled
    && (!query.ids || query.ids.includes(p.id))
    && (!query.regions?.length || query.regions.includes(p.region))
    && (!query.invite || query.invite === 'any'
      || (query.invite === 'required' && p.requiresInvite === true)
      || (query.invite === 'not-required' && p.requiresInvite === false)
      || (query.invite === 'unknown' && p.requiresInvite === undefined)))
    .sort((a, b) => (query.sort === 'za' ? -1 : 1) * a.name.localeCompare(b.name, 'en'))
}

/** Copy logos/ to your app's public assets, then supply that directory's HTTPS URL. */
export function resolveProviderLogo(provider: PdsProvider, baseUrl: string | URL): string | undefined {
  if (!provider.logo) return undefined
  if (!LOGO.test(provider.logo) || provider.logo.includes('..')) throw new TypeError('Invalid logo filename')
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new TypeError('Expected an HTTPS asset directory')
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  return new URL(provider.logo, base).href
}
