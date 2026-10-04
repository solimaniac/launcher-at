// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { ActivityError, MAX_BACKOFF_MS, POLL_MS, REVEAL_MS, fetchRecentJoins, formatJoinCount, startJoinFeed, type RecentJoin } from './activity'

let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
})
const join = (n: number): RecentJoin => ({ handle: `user${n}.example`, providerId: 'bluesky', providerName: 'Bluesky', joinedAt: new Date(Date.UTC(2026, 9, 3, 12, 0, n)).toISOString() })
// Server order: newest first.
const newest = (...ns: number[]) => ns.sort((a, b) => b - a).map(join)
const joinText = (join: RecentJoin) => `${join.handle} joined on ${join.providerName}`

test('counts truncate to the largest whole compact unit', () => {
  expect([0, 7, 999].map(formatJoinCount)).toEqual(['0', '7', '999'])
  expect([1000, 1999, 9999, 10_000, 99_999, 100_000, 999_999].map(formatJoinCount)).toEqual(['1K+', '1K+', '9K+', '10K+', '99K+', '100K+', '999K+'])
  expect([1_000_000, 1_999_999, 12_345_678].map(formatJoinCount)).toEqual(['1M+', '1M+', '12M+'])
})

test('feed reveals one new join per interval, oldest first, and never repeats', async () => {
  vi.useFakeTimers()
  const shown: string[] = []
  const responses = [newest(1, 2, 3), newest(1, 2, 3, 4)]
  const load = vi.fn(async () => responses.shift() ?? newest(1, 2, 3, 4))
  stop = startJoinFeed(load, join => shown.push(joinText(join)))
  await vi.advanceTimersByTimeAsync(0)
  expect(shown).toEqual(['user1.example joined on Bluesky'])
  await vi.advanceTimersByTimeAsync(REVEAL_MS)
  expect(shown).toEqual(['user1.example joined on Bluesky', 'user2.example joined on Bluesky'])
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(load).toHaveBeenCalledTimes(2)
  expect(shown).toEqual([1, 2, 3, 4].map(n => joinText(join(n))))
  await vi.advanceTimersByTimeAsync(POLL_MS)
  expect(shown).toHaveLength(4)
})

test('feed waits for Retry-After and backs off on failure instead of retry-looping', async () => {
  vi.useFakeTimers()
  const show = vi.fn()
  const load = vi.fn<() => Promise<RecentJoin[]>>().mockRejectedValueOnce(new ActivityError(MAX_BACKOFF_MS + 60_000)).mockRejectedValue(new Error('offline'))
  stop = startJoinFeed(load, show)
  await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS + 59_999)
  expect(load).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(POLL_MS * 4 - 1)
  expect(load).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(load).toHaveBeenCalledTimes(3)
  expect(show).not.toHaveBeenCalled()
})

test('rate-limited responses surface Retry-After; malformed joins are dropped', async () => {
  const limited = async () => new Response('{"error":"Too many requests"}', { status: 429, headers: { 'retry-after': '42' } })
  await expect(fetchRecentJoins('https://api.example', limited)).rejects.toMatchObject({ retryAfterMs: 42_000 })
  const mixed = async () => Response.json({ windowMinutes: 5, joins: [join(1), { handle: 'x' }, null] })
  expect(await fetchRecentJoins('https://api.example', mixed)).toEqual([join(1)])
})
