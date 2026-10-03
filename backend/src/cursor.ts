import type { CursorStore } from '@bsky/jetstream'
import type { Redis } from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import { setTimeout as delay } from 'node:timers/promises'

export const CURSOR_KEY = 'atmosphere:jetstream:cursor'
export class RedisCursorStore implements CursorStore {
  private redis: Pick<Redis, 'get' | 'set'>
  private log: FastifyBaseLogger
  constructor(redis: Pick<Redis, 'get' | 'set'>, log: FastifyBaseLogger) { this.redis = redis; this.log = log }
  async load() {
    const raw = await this.redis.get(CURSOR_KEY)
    if (raw === null) return undefined
    const seq = Number(raw)
    if (!Number.isSafeInteger(seq) || seq <= 0 || seq >= 1e15) throw new Error('Invalid stored v2 cursor')
    return seq
  }
  async save(seq: number): Promise<void> {
    // SDK checkpoints are fire-and-forget. Retry here so failures neither
    // become unhandled rejections nor report a failed checkpoint as saved.
    for (;;) {
      try { await this.redis.set(CURSOR_KEY, String(seq)); return }
      catch (err) { this.log.error({ err }, 'Cursor checkpoint failed; retrying'); await delay(1000) }
    }
  }
}
