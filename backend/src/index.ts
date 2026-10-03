import { loadEnv } from './env.ts'
import { buildServer, activityRoutes } from './server.ts'
import { connectRedis, Storage } from './storage.ts'
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
let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  app.log.info({ signal }, 'Graceful shutdown')
  const deadline = setTimeout(() => process.exit(1), 10000).unref()
  try {
    abort.abort()
    await consumer
    await app.close()
    await redis.quit()
  } finally { clearTimeout(deadline) }
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
try {
  await redis.connect()
  await storage.initialize()
  consumer = consumeAccounts({ url: config.jetstreamUrl, cursor: new RedisCursorStore(redis, app.log),
    handle: createAccountHandler(createIdentity(app.log), providers, join => storage.record(join), app.log),
    concurrency: config.concurrency, log: app.log, signal: abort.signal,
  })
  await activityRoutes(app, storage, providers, config.allowedOrigins)
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error({ err }, 'Startup failed')
  redis.disconnect()
  await app.close()
  process.exitCode = 1
}
