import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'

export interface ProtectionOptions {
  allowedOrigins?: string[]
  trustRailwayProxy?: boolean
  requestsPerMinute?: number
  globalRequestsPerMinute?: number
  maxConcurrentRequests?: number
}

// One process, one-minute fixed windows. Never evict a live client's quota:
// reject new identities when the table fills, rather than allowing churn bypass.
class RequestBudget {
  private window = -1
  private total = 0
  private clients = new Map<string, number>()
  constructor(privateLimit: number, globalLimit: number) {
    this.privateLimit = privateLimit
    this.globalLimit = globalLimit
  }
  private privateLimit: number
  private globalLimit: number
  take(client: string, now: number): boolean {
    const window = Math.floor(now / 60000)
    if (window !== this.window) {
      this.window = window
      this.total = 0
      this.clients.clear()
    }
    if (this.total >= this.globalLimit) return false
    this.total++
    const count = this.clients.get(client) ?? 0
    if (count >= this.privateLimit || (!count && this.clients.size >= 4096)) return false
    this.clients.set(client, count + 1)
    return true
  }
}

function normalizeIp(address: string): string | undefined {
  // Do not accept forwarded lists, zone IDs, ports, or noncanonical IPv4 forms.
  if (address.includes('%') || !isIP(address)) return undefined
  const parsed = ipaddr.process(address)
  if (parsed.kind() === 'ipv4') return parsed.toString()
  // IPv6 privacy addresses in the same /64 share a quota.
  return parsed.toByteArray().slice(0, 8).join('.') + '/64'
}

export function clientKey(c: Context, trustRailwayProxy: boolean): string {
  if (trustRailwayProxy) {
    const supplied = c.req.header('x-real-ip')
    if (supplied) {
      const normalized = normalizeIp(supplied.trim())
      if (normalized) return normalized
    }
    // Missing/invalid edge identity shares one restrictive bucket. Never
    // fall back to an attacker-controlled X-Forwarded-For or arbitrary header.
    return 'unknown-proxy-client'
  }
  const peer = c.env?.incoming ? getConnInfo(c).remote.address : undefined
  return peer ? (normalizeIp(peer) ?? 'unknown-peer') : 'unknown-peer'
}

export function requestProtection(options: ProtectionOptions = {}, now = Date.now): MiddlewareHandler {
  const api = new RequestBudget(options.requestsPerMinute ?? 120, options.globalRequestsPerMinute ?? 1200)
  // Health has a separate bounded allowance so API saturation does not consume
  // deployment probes' quota. Health pings themselves are coalesced/cached.
  const health = new RequestBudget(30, 120)
  const origins = options.allowedOrigins ?? []
  const maxConcurrent = options.maxConcurrentRequests ?? 32
  let active = 0
  return async (c, next) => {
    const timestamp = now()
    const retryAfter = String(Math.max(1, Math.ceil((60000 - (timestamp % 60000)) / 1000)))
    const reject = (error: string, status: 400 | 405 | 414 | 429 | 503) => {
      c.header('Cache-Control', 'no-store')
      if (
        c.req.header('transfer-encoding') ||
        (c.req.header('content-length') && c.req.header('content-length') !== '0')
      ) {
        c.header('Connection', 'close')
        c.env?.outgoing?.once('finish', () => c.env.incoming.destroy())
      }
      // Rejections happen before CORS middleware. Preserve browser access to
      // status/Retry-After, without reflecting an unallowlisted origin.
      if (c.req.path.startsWith('/api/')) {
        const origin = c.req.header('origin')
        c.header('Vary', 'Origin')
        if (origin && (origins.includes('*') || origins.includes(origin))) {
          c.header('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin)
          c.header('Access-Control-Expose-Headers', 'Retry-After')
        }
      }
      return c.json({ error }, status)
    }
    const budget = c.req.path === '/health' ? health : api
    if (!budget.take(clientKey(c, options.trustRailwayProxy ?? false), timestamp)) {
      c.header('Retry-After', retryAfter)
      return reject('Too many requests', 429)
    }
    if (c.req.url.length > 2048) return reject('Request URL too long', 414)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      c.header('Allow', 'GET, HEAD, OPTIONS')
      return reject('Method not allowed', 405)
    }
    if (c.req.header('transfer-encoding') || (c.req.header('content-length') && c.req.header('content-length') !== '0'))
      return reject('Request bodies are not accepted', 400)
    if (active >= maxConcurrent) {
      c.header('Retry-After', '1')
      return reject('Server busy', 503)
    }
    active++
    try {
      await next()
    } finally {
      active--
    }
  }
}
