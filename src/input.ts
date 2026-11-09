import { LauncherError } from './types'

/** A handle is a domain, not a display name, email address, or profile URL. */
export function normalizeIdentifier(input: string): string {
  const value = input.trim().replace(/^@/, '')
  if (/^did:(?:plc:[a-z2-7]{24}|web:[a-zA-Z0-9._:%-]+)$/.test(value)) return value
  const handle = value.toLowerCase()
  const labels = handle.split('.')
  if (
    handle.length > 253 ||
    labels.length < 2 ||
    !/[a-z]/.test(labels.at(-1) ?? '') ||
    labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new LauncherError('errors.identifier')
  }
  return handle
}

export function normalizeService(input: string): string {
  try {
    const value = input.trim()
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname.includes('.')
    )
      throw new Error()
    return url.pathname === '/' ? url.origin : url.href.replace(/\/$/, '')
  } catch {
    throw new LauncherError('errors.service')
  }
}
