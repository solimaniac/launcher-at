import Fastify, { LogController } from 'fastify'
import type { Redis } from 'ioredis'
import { healthRoute } from './routes/health.ts'
import cors from '@fastify/cors'
import type { Storage } from './storage.ts'
import type { TrackedProvider } from './providers.ts'
import { countsRoute } from './routes/counts.ts'
import { recentRoute } from './routes/recent.ts'

export function buildServer(redis: Pick<Redis, 'ping'>, logLevel = 'info') {
  const app = Fastify({ logger: logLevel === 'silent' ? false : { level: logLevel }, logController: new LogController({ disableRequestLogging: true }) })
  healthRoute(app, redis)
  return app
}

export async function activityRoutes(app: ReturnType<typeof buildServer>, storage: Storage, providers: TrackedProvider[], allowedOrigins: string[], now = Date.now) {
  await app.register(cors, { origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, credentials: false, methods: ['GET'] })
  countsRoute(app, storage, providers, now)
  recentRoute(app, storage, providers, now)
  app.setErrorHandler((err, request, reply) => {
    const error = err as Error & { statusCode?: number }
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ error: 'Invalid request' })
    request.log.error({ err }, 'Activity API failed')
    return reply.code(503).send({ error: 'Activity temporarily unavailable' })
  })
}
