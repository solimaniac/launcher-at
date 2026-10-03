import { loadEnv } from './env.ts'
import { buildServer, activityRoutes } from './server.ts'
import { connectRedis, Storage, RECENT_KEY, RECENT_MS } from './storage.ts'
import { loadProviders } from './providers.ts'
import { createIdentity } from './identity.ts'
import { RedisCursorStore } from './cursor.ts'
import { consumeAccounts, createAccountHandler } from './jetstream.ts'

const config = loadEnv()
// Health route closes over the client initialized before HTTP starts.
const app = buildServer({ ping: () => redis.ping() }, config.logLevel)
const redis = connectRedis(config.redisUrl, app.log)
const storage = new Storage(redis)
const providers = loadProviders()
const abort = new AbortController()
let consumer: Promise<void> | undefined
let pruneTimer: ReturnType<typeof setInterval> | undefined
let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  app.log.info({ signal }, 'Graceful shutdown')
  const deadline = setTimeout(() => process.exit(1), 10000).unref()
  try {
    clearInterval(pruneTimer)
    abort.abort()
    await consumer
    await app.close()
    await redis.quit()
  } catch (err) {
    app.log.error({ err }, 'Shutdown failed')
    process.exitCode = 1
  } finally { redis.disconnect(); clearTimeout(deadline) }
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
try {
  await redis.connect()
  await storage.initialize()
  await storage.recent(providers.map(p => p.id))
  pruneTimer = setInterval(() => {
    void storage.redis.zremrangebyscore(RECENT_KEY, '-inf', '(' + (Date.now() - RECENT_MS))
      .catch(err => app.log.error({ err }, 'Recent activity pruning failed'))
  }, 30000).unref()
  await activityRoutes(app, storage, providers, config.allowedOrigins)
  await app.listen({ port: config.port, host: '0.0.0.0' })
  consumer = consumeAccounts({ url: config.jetstreamUrl, cursor: new RedisCursorStore(redis, app.log),
    handle: createAccountHandler(createIdentity(app.log), providers, join => storage.record(join), app.log),
    concurrency: config.concurrency, log: app.log, signal: abort.signal,
  })
} catch (err) {
  app.log.error({ err }, 'Startup failed')
  clearInterval(pruneTimer)
  abort.abort()
  await consumer
  redis.disconnect()
  await app.close()
  process.exitCode = 1
}
