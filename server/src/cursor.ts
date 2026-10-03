import type { CursorStore } from '@bsky/jetstream'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { setTimeout as delay } from 'node:timers/promises'

export const CURSOR_KEY = 'atmosphere:jetstream:cursor'
export class RedisCursorStore implements CursorStore {
  private redis: Pick<Redis, 'get' | 'set'>
  private log: Logger
  constructor(redis: Pick<Redis, 'get' | 'set'>, log: Logger) { this.redis = redis; this.log = log }
  async load() {
    // Persist a live timestamp boundary before the first event. Without it,
    // a failed first write would restart at live and silently skip that event.
    await this.redis.set(CURSOR_KEY, String(Date.now() * 1000), 'NX')
    const raw = await this.redis.get(CURSOR_KEY)
    const seq = Number(raw)
    if (!Number.isSafeInteger(seq) || seq <= 0) throw new Error('Invalid stored v2 cursor')
    this.log.info({ cursor: seq }, 'Restoring Jetstream cursor')
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
