import { expect, test } from 'vitest'
import { buildServer } from '../src/server.ts'
import { loadEnv } from '../src/env.ts'
import { pino } from 'pino'

test('health distinguishes reachable Redis from an outage', async () => {
  let down = false
  const app = buildServer({ ping: async () => { if (down) throw new Error('offline'); return 'PONG' } }, pino({ level: 'silent' }))
  expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' })
  down = true
  expect((await app.request('/health')).status).toBe(503)
})
test('environment respects deployment port and requires production Redis', () => {
  expect(loadEnv({ PORT: '4321' }).port).toBe(4321)
  expect(() => loadEnv({ PORT: 'NaN' })).toThrow()
  expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow()
  expect(loadEnv({ NODE_ENV: 'production', REDIS_URL: 'redis://redis' }).allowedOrigins).toEqual([])
})
