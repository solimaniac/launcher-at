import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'

export function healthRoute(app: FastifyInstance, redis: Pick<Redis, 'ping'>) {
  app.get('/health', async (_request, reply) => {
    const timeout = Promise.withResolvers<never>()
    const timer = setTimeout(() => timeout.reject(new Error('Redis ping timeout')), 2000)
    try {
      await Promise.race([
        redis.ping(),
        timeout.promise,
      ])
      return { status: 'ok' }
    } catch {
      return reply.code(503).send({ status: 'unavailable' })
    } finally {
      clearTimeout(timer)
    }
  })
}
