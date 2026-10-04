import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import type { Storage } from './storage.ts'
import type { TrackedProvider } from './providers.ts'
import { healthRoute } from './routes/health.ts'
import { countsRoute } from './routes/counts.ts'
import { recentRoute } from './routes/recent.ts'
import { requestProtection } from './protection.ts'
import type { ProtectionOptions } from './protection.ts'

export function buildServer(redis: Pick<Redis, 'ping'>, log: Logger, protection: ProtectionOptions = {}, now = Date.now) {
  const app = new Hono()
  app.use('*', requestProtection(protection, now))
  app.onError((err, c) => {
    log.error({ err }, 'Activity API failed')
    return c.json({ error: 'Activity temporarily unavailable' }, 503)
  })
  healthRoute(app, redis, now)
  return app
}

export function activityRoutes(app: Hono, storage: Storage, providers: TrackedProvider[], allowedOrigins: string[], now = Date.now) {
  app.use('/api/*', cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, credentials: false, allowMethods: ['GET'], exposeHeaders: ['Retry-After'], maxAge: 600 }))
  countsRoute(app, storage, providers, now)
  recentRoute(app, storage, providers)
}
