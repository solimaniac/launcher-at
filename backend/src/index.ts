import { loadEnv } from './env.ts'
import { buildServer } from './server.ts'
import { connectRedis } from './storage.ts'

const config = loadEnv()
// Health route closes over the client initialized before HTTP starts.
const app = buildServer({ ping: () => redis.ping() }, config.logLevel)
const redis = connectRedis(config.redisUrl, app.log)
let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  app.log.info({ signal }, 'Graceful shutdown')
  const deadline = setTimeout(() => process.exit(1), 10000).unref()
  try {
    await app.close()
    await redis.quit()
  } finally { clearTimeout(deadline) }
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
try {
  await redis.connect()
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error({ err }, 'Startup failed')
  redis.disconnect()
  await app.close()
  process.exitCode = 1
}
