import { expect, test, vi } from 'vitest'
import RedisMock from 'ioredis-mock'
import { Jetstream, LexIndexer } from '@bsky/jetstream'
import type { AccountEvent, LiveTransport } from '@bsky/jetstream'
import { pino } from 'pino'
import { createAccountHandler, consumeAccounts } from '../src/jetstream.ts'
import { RedisCursorStore, CURSOR_KEY } from '../src/cursor.ts'
import { loadProviders } from '../src/providers.ts'

const log = pino({ level: 'silent' })
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
test('a silent stream is restarted from the durable cursor', async () => {
  const redis = new RedisMock(); await redis.flushall()
  await redis.set(CURSOR_KEY, '1')
  const abort = new AbortController()
  const cursors: string[] = []
  // Mimics resuming into a Jetstream seq hole: one event, then silence until aborted.
  const transport: LiveTransport = {
    async *stream(getUrl, signal) {
      cursors.push(new URL(getUrl()).searchParams.get('cursor')!)
      if (cursors.length === 3) abort.abort()
      yield frame(cursors.length + 1)
      const { promise, resolve } = Promise.withResolvers<unknown>()
      signal.addEventListener('abort', resolve, { once: true })
      if (!signal.aborted) await promise
    },
  }
  await consumeAccounts({ url: 'https://example.test', cursor: new RedisCursorStore(redis, log), handle: async () => {}, log, signal: abort.signal, transport, stallMs: 50 })
  expect(cursors).toEqual(['1', '2', '3'])
  await redis.quit()
}, 10_000)
test('first connection starts at a persisted live boundary, not historical backfill', async () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-03T12:00:00Z') })
  try {
    const redis = new RedisMock(); await redis.flushall()
    let url = ''
    const transport: LiveTransport = { async *stream(getUrl) { url = getUrl(); yield frame(5) } }
    await new Jetstream('https://example.test').runner(new LexIndexer().account(() => {})).live({ cursor: new RedisCursorStore(redis, log), liveTransport: transport })
    expect(Number(new URL(url).searchParams.get('cursor'))).toBe(Date.now() * 1000)
    expect(await redis.get(CURSOR_KEY)).toBe('5')
    await redis.quit()
  } finally { vi.useRealTimers() }
})

test('source shutdown drains pending identity/count work before final checkpoint', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const abort = new AbortController()
  await redis.set(CURSOR_KEY, '1')
  const ready = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const sourceStopped = Promise.withResolvers<void>()
  const transport: LiveTransport = { async *stream() { yield frame(7); sourceStopped.resolve(); throw new Error('socket shutdown') } }
  let finished = false
  const run = consumeAccounts({ url: 'https://example.test', cursor: new RedisCursorStore(redis, log), log, signal: abort.signal, transport,
    handle: async () => { ready.resolve(); await gate.promise },
  }).then(() => { finished = true })
  await ready.promise
  abort.abort()
  await sourceStopped.promise
  expect(finished).toBe(false)
  expect(await redis.get(CURSOR_KEY)).toBe('1')
  gate.resolve()
  await run
  expect(await redis.get(CURSOR_KEY)).toBe('7')
  await redis.quit()
})

test('a checkpoint failure stays pending until Redis accepts it', async () => {
  vi.useFakeTimers()
  try {
    const redis = new RedisMock(); await redis.flushall()
    vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('Redis unavailable'))
    let saved = false
    const work = new RedisCursorStore(redis, log).save(8).then(() => { saved = true })
    await Promise.resolve()
    expect(saved).toBe(false)
    expect(await redis.get(CURSOR_KEY)).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    await work
    expect(await redis.get(CURSOR_KEY)).toBe('8')
    await redis.quit()
  } finally { vi.useRealTimers() }
})

test('failed first count cannot lose the live boundary on restart', async () => {
  const redis = new RedisMock(); await redis.flushall()
  const cursor = new RedisCursorStore(redis, log)
  const boundary = await cursor.load()
  const transport: LiveTransport = { async *stream() { yield frame(9) } }
  await expect(new Jetstream('https://example.test').runner(new LexIndexer().account(async () => { throw new Error('write failed') })).live({ cursor, liveTransport: transport })).rejects.toThrow('write failed')
  expect(await new RedisCursorStore(redis, log).load()).toBe(boundary)
  await redis.quit()
})
