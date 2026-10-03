import { expect, test, vi } from 'vitest'
import { buildServer } from '../src/server.ts'
import { loadEnv } from '../src/env.ts'
import { pino } from 'pino'

test('health distinguishes reachable Redis from an outage', async () => {
  let down = false
  let time = 1000
  const app = buildServer({ ping: async () => { if (down) throw new Error('offline'); return 'PONG' } }, pino({ level: 'silent' }), {}, () => time)
  expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' })
  down = true
  time += 1000
  expect((await app.request('/health')).status).toBe(503)
})
test('environment respects deployment port and requires production Redis', () => {
  expect(loadEnv({ PORT: '4321' }).port).toBe(4321)
  expect(() => loadEnv({ PORT: 'NaN' })).toThrow()
  expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow()
  expect(loadEnv({ NODE_ENV: 'production', REDIS_URL: 'redis://redis' }).allowedOrigins).toEqual([])
})

test('concurrent health probes share one ping and failures recover after the short cache', async () => {
  let time = 1000
  const gate = Promise.withResolvers<'PONG'>()
  const ping = vi.fn(() => gate.promise)
  const app = buildServer({ ping }, pino({ level: 'silent' }), {}, () => time)
  const first = app.request('/health')
  const second = app.request('/health')
  expect(ping).toHaveBeenCalledTimes(1)
  gate.resolve('PONG')
  expect((await first).status).toBe(200)
  expect((await second).status).toBe(200)
  expect((await app.request('/health')).status).toBe(200)
  expect(ping).toHaveBeenCalledTimes(1)
  time += 1000
  ping.mockRejectedValue(new Error('Redis down'))
  expect((await app.request('/health')).status).toBe(503)
  time += 1000
  ping.mockResolvedValue('PONG')
  expect((await app.request('/health')).status).toBe(200)
})

test('abuse configuration rejects invalid limits and ambiguous proxy flags', () => {
  for (const value of ['0', '-1', '1.5', 'NaN']) expect(() => loadEnv({ RATE_LIMIT_PER_MINUTE: value })).toThrow()
  expect(() => loadEnv({ TRUST_RAILWAY_PROXY: 'yes' })).toThrow()
  expect(loadEnv({}).trustRailwayProxy).toBe(false)
})

test('hung health ping times out without tying up all HTTP work slots', async () => {
  vi.useFakeTimers({ now: 1000 })
  try {
    const gate = Promise.withResolvers<'PONG'>()
    const app = buildServer({ ping: () => gate.promise }, pino({ level: 'silent' }))
    const response = app.request('/health')
    await vi.advanceTimersByTimeAsync(2000)
    expect((await response).status).toBe(503)
    expect((await app.request('/health')).status).toBe(503)
    gate.resolve('PONG')
  } finally { vi.useRealTimers() }
})
