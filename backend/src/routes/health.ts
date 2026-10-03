import type { Hono } from 'hono'
import type { Redis } from 'ioredis'

export function healthRoute(app: Hono, redis: Pick<Redis, 'ping'>) {
  app.get('/health', async c => {
    const timeout = Promise.withResolvers<never>()
    const timer = setTimeout(() => timeout.reject(new Error('Redis ping timeout')), 2000)
    try {
      await Promise.race([
        redis.ping(),
        timeout.promise,
      ])
      return c.json({ status: 'ok' })
    } catch {
      return c.json({ status: 'unavailable' }, 503)
    } finally {
      clearTimeout(timer)
    }
  })
}
