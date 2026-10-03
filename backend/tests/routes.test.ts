import { expect, test, vi } from 'vitest'
import RedisMock from 'ioredis-mock'
import { buildServer, activityRoutes } from '../src/server.ts'
import { Storage, DAY_MS, RECENT_MS, countKey } from '../src/storage.ts'
import { loadProviders } from '../src/providers.ts'
import { pino } from 'pino'
const now = Date.parse('2026-10-03T12:00:00Z')
type RecentResponse = { windowMinutes: number; joins: { handle: string; providerId: string; providerName: string; joinedAt: string }[] }

test('counts include all tracked IDs, zeros, observedSince and exactly 30 UTC buckets', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis); await storage.initialize(now)
  await redis.hset(countKey(now), 'bluesky', 3, 'unknown', 100)
  await redis.hset(countKey(now - 29 * DAY_MS), 'bluesky', 7)
  await redis.hset(countKey(now - 30 * DAY_MS), 'bluesky', 999)
  const app = buildServer(redis, pino({ level: 'silent' }))
  const providers = loadProviders()
  activityRoutes(app, storage, providers, [], () => now)
  const response = await (await app.request('/api/v1/providers/counts')).json()
  expect(response).toEqual({ windowDays: 30, observedSince: new Date(now).toISOString(), providers: providers.map(p => ({ id: p.id, name: p.name, joined: p.id === 'bluesky' ? 10 : 0 })) })
  await redis.quit()
})
test('recent is newest-first, expires on read, caps at 50 and never exposes DIDs', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  for (let i = 1; i <= 60; i++) await storage.record({ seq: i, did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'alice' + i + '.example', providerId: 'bluesky', observedAt: now - i * 1000 }, now)
  const app = buildServer(redis, pino({ level: 'silent' }))
  let clock = now
  activityRoutes(app, storage, loadProviders(), ['https://launcher.example'], () => clock)
  const result = await app.request('/api/v1/joins/recent?limit=100', { headers: { origin: 'https://launcher.example' } })
  const { joins } = await result.json() as RecentResponse
  expect(joins).toHaveLength(50)
  expect(joins[0]).toEqual({ handle: 'alice1.example', providerId: 'bluesky', providerName: 'Bluesky', joinedAt: new Date(now - 1000).toISOString() })
  expect(joins[49].handle).toBe('alice50.example')
  expect(result.headers.get('access-control-allow-origin')).toBe('https://launcher.example')
  expect(result.headers.get('access-control-allow-credentials')).toBeNull()
  expect((await app.request('/api/v1/joins/recent', { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin')).toBeNull()
  expect((await (await app.request('/api/v1/joins/recent?limit=2')).json() as RecentResponse).joins).toHaveLength(2)
  for (const limit of ['0', '-1', 'oops', '1.5']) expect((await app.request('/api/v1/joins/recent?limit=' + limit)).status).toBe(400)
  clock += RECENT_MS + 1
  expect(await (await app.request('/api/v1/joins/recent')).json()).toEqual({ windowMinutes: 5, joins: [] })
  await redis.quit()
})

test('storage failures return 503 rather than empty activity', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  const app = buildServer(redis, pino({ level: 'silent' }))
  activityRoutes(app, storage, loadProviders(), ['https://launcher.example'])
  vi.spyOn(storage, 'counts').mockRejectedValue(new Error('Redis unavailable'))
  vi.spyOn(storage, 'recent').mockRejectedValue(new Error('Redis unavailable'))
  for (const path of ['/api/v1/providers/counts', '/api/v1/joins/recent']) {
    const response = await app.request(path, { headers: { origin: 'https://launcher.example' } })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Activity temporarily unavailable' })
    expect(response.headers.get('access-control-allow-origin')).toBe('https://launcher.example')
  }
  await redis.quit()
})
