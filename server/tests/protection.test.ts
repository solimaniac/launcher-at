import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Hono } from 'hono'
import { pino } from 'pino'
import { requestProtection } from '../src/protection.ts'
import { buildServer } from '../src/server.ts'

const log = pino({ level: 'silent' })
const request = (ip: string) => ({ headers: { 'x-real-ip': ip, origin: 'https://launcher.example' } })
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(1000) })
afterEach(() => { vi.restoreAllMocks() })

test('quota is shared across routes, returns browser-readable retry, and resets at the boundary', async () => {
  let time = 59000
  const app = new Hono()
  let work = 0
  app.use('*', requestProtection({ trustRailwayProxy: true, requestsPerMinute: 2, allowedOrigins: ['https://launcher.example'] }, () => time))
  app.get('*', c => { work++; return c.json({ ok: true }) })
  expect((await app.request('/api/counts', request('192.0.2.1'))).status).toBe(200)
  expect((await app.request('/api/recent', request('192.0.2.1'))).status).toBe(200)
  const blocked = await app.request('/api/other?cachebust=1', request('192.0.2.1'))
  expect(blocked.status).toBe(429)
  expect(blocked.headers.get('retry-after')).toBe('1')
  expect(blocked.headers.get('cache-control')).toBe('no-store')
  expect(blocked.headers.get('access-control-allow-origin')).toBe('https://launcher.example')
  expect(blocked.headers.get('access-control-expose-headers')).toBe('Retry-After')
  expect(blocked.headers.get('access-control-allow-credentials')).toBeNull()
  expect(work).toBe(2)
  expect((await app.request('/api/counts', request('192.0.2.2'))).status).toBe(200)
  time = 60000
  expect((await app.request('/api/counts', request('192.0.2.1'))).status).toBe(200)
})

test('untrusted headers cannot rotate quotas; IPv4 mapped and IPv6 /64 addresses normalize', async () => {
  const direct = new Hono()
  direct.use('*', requestProtection({ requestsPerMinute: 1 }))
  direct.get('*', c => c.text('ok'))
  expect((await direct.request('/', request('192.0.2.1'))).status).toBe(200)
  expect((await direct.request('/', { headers: { 'x-real-ip': '192.0.2.2', 'x-forwarded-for': '192.0.2.3' } })).status).toBe(429)
  const app = new Hono()
  app.use('*', requestProtection({ trustRailwayProxy: true, requestsPerMinute: 1 }))
  app.get('*', c => c.text('ok'))
  expect((await app.request('/', request('192.0.2.1'))).status).toBe(200)
  expect((await app.request('/', request('::ffff:192.0.2.1'))).status).toBe(429)
  expect((await app.request('/', request('2001:db8:1::1'))).status).toBe(200)
  expect((await app.request('/', request('2001:0db8:0001:0000::2'))).status).toBe(429)
  expect((await app.request('/', request('not-an-ip'))).status).toBe(200)
  expect((await app.request('/', { headers: { 'x-forwarded-for': '203.0.113.1' } })).status).toBe(429)
})

test('distributed requests and client churn are bounded without evicting live quotas', async () => {
  const app = new Hono()
  app.use('*', requestProtection({ trustRailwayProxy: true, globalRequestsPerMinute: 2 }))
  app.get('*', c => c.text('ok'))
  expect((await app.request('/', request('192.0.2.1'))).status).toBe(200)
  expect((await app.request('/', request('192.0.2.2'))).status).toBe(200)
  expect((await app.request('/', request('192.0.2.3'))).status).toBe(429)
  const capped = new Hono()
  capped.use('*', requestProtection({ trustRailwayProxy: true, globalRequestsPerMinute: 10000, requestsPerMinute: 1 }))
  capped.get('*', c => c.text('ok'))
  for (let i = 0; i < 4096; i++) expect((await capped.request('/', request(`10.0.${Math.floor(i / 256)}.${i % 256}`))).status).toBe(200)
  expect((await capped.request('/', request('10.1.0.1'))).status).toBe(429)
  expect((await capped.request('/', request('10.0.0.0'))).status).toBe(429)
})

test('in-flight work is capped and a completed or failed request frees its slot', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const app = new Hono()
  app.use('*', requestProtection({ maxConcurrentRequests: 1 }))
  app.get('/slow', async c => { entered.resolve(); await release.promise; return c.text('done') })
  app.get('/fail', () => { throw new Error('storage unavailable') })
  app.onError((_err, c) => c.text('failed', 503))
  app.get('/fast', c => c.text('ok'))
  const slow = app.request('/slow')
  await entered.promise
  expect((await app.request('/fast')).status).toBe(503)
  release.resolve()
  expect((await slow).status).toBe(200)
  expect((await app.request('/fail')).status).toBe(503)
  expect((await app.request('/fast')).status).toBe(200)
})

test('methods, uploads, long URLs, preflights and health floods cannot bypass admission', async () => {
  const app = new Hono()
  let work = 0
  app.use('*', requestProtection({ requestsPerMinute: 3 }))
  app.all('*', c => { work++; return c.text('ok') })
  expect((await app.request('/', { method: 'POST', body: 'upload' })).status).toBe(405)
  expect((await app.request('/', { headers: { 'content-length': '10000' } })).status).toBe(400)
  expect((await app.request('/?' + 'x'.repeat(2100))).status).toBe(414)
  expect((await app.request('/', { method: 'OPTIONS' })).status).toBe(429)
  expect(work).toBe(0)
  const health = buildServer({ ping: async () => 'PONG' }, log, { globalRequestsPerMinute: 1 }, () => 1000)
  expect((await health.request('/unknown')).status).toBe(404)
  for (let i = 0; i < 30; i++) expect((await health.request('/health')).status).toBe(200)
  expect((await health.request('/health')).status).toBe(429)
})
