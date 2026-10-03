import type { Hono } from 'hono'
import type { Redis } from 'ioredis'

export function healthRoute(app: Hono, redis: Pick<Redis, 'ping'>, now = Date.now) {
  let pending: Promise<boolean> | undefined
  let healthy = false
  let checkedUntil = 0
  async function check() {
    const timeout = Promise.withResolvers<never>()
    const timer = setTimeout(() => timeout.reject(new Error('Redis ping timeout')), 2000)
    try {
      await Promise.race([redis.ping(), timeout.promise])
      return true
    } catch { return false }
    finally { clearTimeout(timer) }
  }
  app.get('/health', async c => {
    c.header('Cache-Control', 'no-store')
    if (now() >= checkedUntil) {
      pending ??= check().then(result => {
        healthy = result
        checkedUntil = now() + 1000
        pending = undefined
        return result
      })
      await pending
    }
    return healthy ? c.json({ status: 'ok' }) : c.json({ status: 'unavailable' }, 503)
  })
}
