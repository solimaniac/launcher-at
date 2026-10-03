import { Redis } from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'

export function connectRedis(url: string, log: FastifyBaseLogger) {
  const redis = new Redis(url, { family: 0, lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 5000 })
  redis.on('ready', () => log.info('Redis connected'))
  redis.on('reconnecting', () => log.warn('Redis reconnecting'))
  redis.on('error', err => log.error({ err }, 'Redis connection error'))
  return redis
}
