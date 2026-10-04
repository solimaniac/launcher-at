import { loadEnv } from './env.ts'
import { buildServer, activityRoutes } from './server.ts'
import { connectRedis, Storage } from './storage.ts'
import { loadProviders } from './providers.ts'
import { createIdentity } from './identity.ts'
import { RedisCursorStore } from './cursor.ts'
import { consumeAccounts, createAccountHandler } from './jetstream.ts'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { once } from 'node:events'
import { pino } from 'pino'
import type { Socket } from 'node:net'

const config = loadEnv()
const log = pino({ level: config.logLevel })
const redis = connectRedis(config.redisUrl, log)
const app = buildServer(redis, log, config)
const storage = new Storage(redis)
const providers = loadProviders()
const abort = new AbortController()
let consumer: Promise<void> | undefined
let server: ServerType | undefined
async function closeServer() {
  if (!server) return
  const closed = Promise.withResolvers<void>()
  server.close(err => err ? closed.reject(err) : closed.resolve())
  await closed.promise
}
let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  log.info({ signal }, 'Graceful shutdown')
  const deadline = setTimeout(() => process.exit(1), 10000).unref()
  try {
    abort.abort()
    await consumer
    await closeServer()
    await redis.quit()
  } catch (err) {
    log.error({ err }, 'Shutdown failed')
    process.exitCode = 1
  } finally { redis.disconnect(); clearTimeout(deadline) }
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
try {
  await redis.connect()
  await storage.initialize()
  await storage.recent(providers.map(p => p.id))
  activityRoutes(app, storage, providers, config.allowedOrigins)
  server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0', serverOptions: {
    maxHeaderSize: 8192, headersTimeout: 10000, requestTimeout: 10000,
    keepAliveTimeout: 5000, connectionsCheckingInterval: 1000,
  } })
  server.maxConnections = 256
  server.setTimeout(10000)
  server.on('timeout', (socket: Socket) => socket.destroy())
  if ('maxRequestsPerSocket' in server) server.maxRequestsPerSocket = 100
  server.on('checkContinue', (_request, response) => { response.writeHead(417, { Connection: 'close' }); response.end() })
  await once(server, 'listening')
  log.info({ port: config.port }, 'HTTP server listening')
  consumer = consumeAccounts({ url: config.jetstreamUrl, apiKey: config.jetstreamApiKey, cursor: new RedisCursorStore(redis, log),
    handle: createAccountHandler(createIdentity(log), providers, join => storage.record(join), log),
    concurrency: config.concurrency, log, signal: abort.signal,
  })
} catch (err) {
  log.error({ err }, 'Startup failed')
  abort.abort()
  await consumer
  redis.disconnect()
  await closeServer()
  process.exitCode = 1
}
