import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'

export function healthRoute(app: FastifyInstance, redis: Pick<Redis, 'ping'>) {
  app.get('/health', async (_request, reply) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis ping timeout')), 2000) }),
      ])
      return { status: 'ok' }
    } catch {
      return reply.code(503).send({ status: 'unavailable' })
    } finally {
      clearTimeout(timer)
    }
  })
}
