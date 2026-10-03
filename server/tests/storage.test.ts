import { expect, test } from 'vitest'
import RedisMock from 'ioredis-mock'
import { Storage, DAY_MS, RECENT_MS, RECENT_KEY, countKey } from '../src/storage.ts'
import { createAccountHandler } from '../src/jetstream.ts'
import { loadProviders } from '../src/providers.ts'
import { pino } from 'pino'
import type { AccountEvent } from '@bsky/jetstream'
const now = Date.parse('2026-10-03T00:01:00Z')
const join = (seq: number, observedAt = now) => ({ seq, did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'alice.example', providerId: 'bluesky', observedAt })

test('atomic replay is idempotent; counts persist but identities expire from recent', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  await storage.initialize(now); await storage.initialize(now + 10000)
  await storage.record(join(1), now); await storage.record(join(1), now)
  expect(await storage.counts(['bluesky', 'eurosky'], now)).toEqual({ observedSince: new Date(now).toISOString(), totals: { bluesky: 1, eurosky: 0 } })
  expect(await redis.ttl(countKey(now))).toBeGreaterThan(31 * 86400)
  expect(await redis.pttl(RECENT_KEY)).toBeLessThanOrEqual(RECENT_MS)
  expect(await storage.recent(['bluesky'], 50, now + RECENT_MS + 1)).toEqual([])
  expect(await redis.zcard(RECENT_KEY)).toBe(0)
  expect((await storage.counts(['bluesky'], now)).totals.bluesky).toBe(1)
  await redis.quit()
})
test('UTC aggregation includes today plus 29 prior dates, not an exact 720-hour window', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  await storage.record(join(1), now)
  await storage.record(join(2, now - 29 * DAY_MS - 30000), now)
  await storage.record(join(3, now - 30 * DAY_MS), now)
  expect((await storage.counts(['bluesky'], now)).totals.bluesky).toBe(2)
  await redis.quit()
})
test('five-minute boundary, newest order, bounded volume and removed-provider filtering', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  for (let i = 1; i <= 60; i++) await storage.record(join(i, now - i * 1000), now)
  await storage.record(join(100, now - RECENT_MS), now)
  await storage.record(join(101, now - RECENT_MS - 1), now)
  expect(await redis.zcard(RECENT_KEY)).toBe(61)
  const recent = await storage.recent(['bluesky'], 100, now)
  expect(recent.map(j => j.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
  expect((await storage.recent(['bluesky'], 50, now + RECENT_MS - 1000)).map(j => j.seq)).toEqual([1])
  await storage.recent([], 50, now)
  expect(await redis.zcard(RECENT_KEY)).toBe(0)
  await redis.quit()
})
test('failed handle verification still counts, but never publishes unverified handles', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const storage = new Storage(redis)
  const handle = createAccountHandler({ resolveDid: async () => ({ pds: 'https://eurosky.social', claimedHandle: 'wrong.example' }), verifyHandle: async () => undefined }, loadProviders(), j => storage.record(j, now), pino({ level: 'silent' }), () => now)
  await handle({ active: true, seq: 1, did: join(1).did } as AccountEvent)
  expect((await storage.counts(['eurosky'], now)).totals.eurosky).toBe(1)
  expect(await storage.recent(['eurosky'], 50, now)).toEqual([])
  await redis.quit()
})
