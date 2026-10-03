import { expect, test } from 'vitest'
import RedisMock from 'ioredis-mock'
import { buildServer, activityRoutes } from '../src/server.ts'
import { Storage, DAY_MS, RECENT_MS, countKey } from '../src/storage.ts'
import { loadProviders } from '../src/providers.ts'
const now = Date.parse('2026-10-03T12:00:00Z')

test('counts include all tracked IDs, zeros, observedSince and exactly 30 UTC buckets', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis); await storage.initialize(now)
  await redis.hset(countKey(now), 'bluesky', 3, 'unknown', 100)
  await redis.hset(countKey(now - 29 * DAY_MS), 'bluesky', 7)
  await redis.hset(countKey(now - 30 * DAY_MS), 'bluesky', 999)
  const app = buildServer(redis, 'silent')
  const providers = loadProviders()
  await activityRoutes(app, storage, providers, [], () => now)
  const response = (await app.inject('/api/v1/providers/counts')).json()
  expect(response).toEqual({ windowDays: 30, observedSince: new Date(now).toISOString(), providers: providers.map(p => ({ id: p.id, name: p.name, joined: p.id === 'bluesky' ? 10 : 0 })) })
  await app.close(); await redis.quit()
})
test('recent is newest-first, expires on read, caps at 50 and never exposes DIDs', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  for (let i = 1; i <= 60; i++) await storage.record({ seq: i, did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'alice' + i + '.example', providerId: 'bluesky', observedAt: now - i * 1000 }, now)
  const app = buildServer(redis, 'silent')
  let clock = now
  await activityRoutes(app, storage, loadProviders(), ['https://launcher.example'], () => clock)
  const result = await app.inject({ url: '/api/v1/joins/recent?limit=100', headers: { origin: 'https://launcher.example' } })
  const joins = result.json().joins
  expect(joins).toHaveLength(50)
  expect(joins[0]).toEqual({ handle: 'alice1.example', providerId: 'bluesky', providerName: 'Bluesky', joinedAt: new Date(now - 1000).toISOString() })
  expect(joins[49].handle).toBe('alice50.example')
  expect(result.headers['access-control-allow-origin']).toBe('https://launcher.example')
  expect(result.headers['access-control-allow-credentials']).toBeUndefined()
  expect((await app.inject({ url: '/api/v1/joins/recent', headers: { origin: 'https://evil.example' } })).headers['access-control-allow-origin']).toBeUndefined()
  expect((await app.inject('/api/v1/joins/recent?limit=2')).json().joins).toHaveLength(2)
  for (const limit of ['0', '-1', 'oops', '1.5']) expect((await app.inject('/api/v1/joins/recent?limit=' + limit)).statusCode).toBe(400)
  clock += RECENT_MS + 1
  expect((await app.inject('/api/v1/joins/recent')).json()).toEqual({ windowMinutes: 5, joins: [] })
  await app.close(); await redis.quit()
})
