import { expect, test, vi } from 'vitest'
import RedisMock from 'ioredis-mock'
import { Jetstream, LexIndexer } from '@bsky/jetstream'
import type { AccountEvent, LiveTransport } from '@bsky/jetstream'
import { buildServer } from '../src/server.ts'
import { createAccountHandler } from '../src/jetstream.ts'
import { RedisCursorStore, CURSOR_KEY } from '../src/cursor.ts'
import { loadProviders } from '../src/providers.ts'

const log = buildServer({ ping: async () => 'PONG' }, 'silent').log
const did = 'did:plc:abcdefghijklmnopqrstuvwx'
const event = { did, seq: 2, active: true } as AccountEvent
const frame = (seq: number) => JSON.stringify({ $type: 'message', payload: { $type: 'network.bsky.jetstream.subscribeEvents#account', did, seq, time: new Date().toISOString(), account: { did, active: true } } })
test('active attributed events produce joins; inactive and untracked events do not', async () => {
  const identity = { resolveDid: vi.fn(async () => ({ pds: 'https://amanita.us-east.host.bsky.network', claimedHandle: 'custom.example' })), verifyHandle: vi.fn(async () => 'custom.example') }
  const joins: unknown[] = []
  const handler = createAccountHandler(identity, loadProviders(), async j => { joins.push(j) }, log, () => 1234)
  await handler({ ...event, active: false })
  expect(identity.resolveDid).not.toHaveBeenCalled()
  await handler(event)
  expect(joins).toEqual([{ seq: 2, did, providerId: 'bluesky', handle: 'custom.example', observedAt: 1234 }])
  identity.resolveDid.mockResolvedValue({ pds: 'https://unknown.example', claimedHandle: 'custom.example' })
  await handler(event)
  expect(joins).toHaveLength(1)
  identity.resolveDid.mockRejectedValue(new Error('bad identity'))
  await handler(event)
  expect(joins).toHaveLength(1)
})
test('restores durable cursor and never advances it past a failed persistent write', async () => {
  const redis = new RedisMock()
  await redis.flushall()
  await redis.set(CURSOR_KEY, '1')
  const cursor = new RedisCursorStore(redis, log)
  let url = ''
  const transport: LiveTransport = { async *stream(getUrl) { url = getUrl(); yield frame(2); yield frame(3) } }
  const indexer = new LexIndexer({ concurrency: 1 }).account(async e => { if (e.seq === 3) throw new Error('Redis write failed') })
  await expect(new Jetstream('https://example.test').runner(indexer).live({ cursor, liveTransport: transport })).rejects.toThrow('Redis write failed')
  expect(new URL(url).searchParams.get('cursor')).toBe('1')
  expect(new URL(url).searchParams.getAll('kinds')).toEqual(['account'])
  expect(await new RedisCursorStore(redis, log).load()).toBe(2)
  await redis.quit()
})
test('first connection omits cursor: live, not automatic backfill', async () => {
  const redis = new RedisMock(); await redis.flushall()
  let url = ''
  const transport: LiveTransport = { async *stream(getUrl) { url = getUrl(); yield frame(5) } }
  await new Jetstream('https://example.test').runner(new LexIndexer().account(() => {})).live({ cursor: new RedisCursorStore(redis, log), liveTransport: transport })
  expect(new URL(url).searchParams.has('cursor')).toBe(false)
  expect(await redis.get(CURSOR_KEY)).toBe('5')
  await redis.quit()
})
