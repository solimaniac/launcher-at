import Fastify, { LogController } from 'fastify'
import type { Redis } from 'ioredis'
import { healthRoute } from './routes/health.ts'

export function buildServer(redis: Pick<Redis, 'ping'>, logLevel = 'info') {
  const app = Fastify({ logger: logLevel === 'silent' ? false : { level: logLevel }, logController: new LogController({ disableRequestLogging: true }) })
  healthRoute(app, redis)
  return app
}
