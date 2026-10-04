import { Redis } from 'ioredis'
import type { Logger } from 'pino'
import type { Join } from './jetstream.ts'

export function connectRedis(url: string, log: Logger) {
  const redis = new Redis(url, { family: 0, lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 5000 })
  redis.on('ready', () => log.info('Redis connected'))
  redis.on('reconnecting', () => log.warn('Redis reconnecting'))
  redis.on('error', err => log.error({ err }, 'Redis connection error'))
  return redis
}

export const DAY_MS = 86400000
export const RECENT_LIMIT = 50
export const RECENT_KEY = 'atmosphere:joins:recent'
export const STARTED_KEY = 'atmosphere:tracking:startedAt'
export const countKey = (time: number) => 'atmosphere:joins:count:' + new Date(time).toISOString().slice(0, 10)

// One atomic write: replays cannot increment twice, including an ambiguous
// network failure after Redis committed but before the client received a reply.
const recordScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
redis.call('EXPIRE', KEYS[2], 2764800)
if ARGV[2] ~= '' then
  redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
  redis.call('ZREMRANGEBYRANK', KEYS[3], 0, -tonumber(ARGV[4]) - 1)
end
redis.call('SET', KEYS[1], '1', 'EX', 86400)
return 1
`

export class Storage {
  readonly redis: Redis
  constructor(redis: Redis) { this.redis = redis }
  async initialize(now = Date.now()) {
    await this.redis.set(STARTED_KEY, new Date(now).toISOString(), 'NX')
  }
  async record(join: Join): Promise<void> {
    const member = join.handle ? JSON.stringify(join) : ''
    await this.redis.eval(recordScript, 3, 'atmosphere:jetstream:counted:' + join.seq,
      countKey(join.observedAt), RECENT_KEY, join.providerId, member, join.observedAt, RECENT_LIMIT)
  }
  async counts(ids: string[], now = Date.now()) {
    const pipe = this.redis.pipeline().get(STARTED_KEY)
    for (let day = 0; day < 30; day++) pipe.hgetall(countKey(now - day * DAY_MS))
    const rows = await pipe.exec()
    if (!rows) throw new Error('Redis count read failed')
    for (const [err] of rows) if (err) throw err
    const totals = Object.fromEntries(ids.map(id => [id, 0]))
    for (const [, bucket] of rows.slice(1)) {
      const counts = bucket as Record<string, string>
      for (const id of ids) totals[id] += Number(counts[id] ?? 0)
    }
    return { observedSince: rows[0]![1] as string | null, totals }
  }
  // The newest joins seen, however old: the feed shows the latest activity rather than a time window.
  async recent(ids: string[], limit = RECENT_LIMIT): Promise<Join[]> {
    const members = await this.redis.zrevrange(RECENT_KEY, 0, RECENT_LIMIT - 1)
    const enabled = new Set(ids)
    const joins: Join[] = []
    const excluded: string[] = []
    for (const member of members) {
      const join = JSON.parse(member) as Join
      if (!enabled.has(join.providerId)) { excluded.push(member); continue }
      if (join.handle && joins.length < Math.min(limit, RECENT_LIMIT)) joins.push(join)
    }
    if (excluded.length) await this.redis.zrem(RECENT_KEY, ...excluded)
    return joins
  }
}
