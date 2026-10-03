import { Jetstream, LexIndexer, websocketTransport } from '@bsky/jetstream'
import type { AccountEvent, CursorStore, LiveTransport } from '@bsky/jetstream'
import type { FastifyBaseLogger } from 'fastify'
import { setTimeout as delay } from 'node:timers/promises'
import type { Identity } from './identity.ts'
import { matchProvider } from './providers.ts'
import type { TrackedProvider } from './providers.ts'

export interface Join { seq: number; did: string; handle?: string; providerId: string; observedAt: number }
export function createAccountHandler(identity: Identity, providers: TrackedProvider[], record: (join: Join) => Promise<void>, log: FastifyBaseLogger, now = Date.now) {
  return async (event: AccountEvent) => {
    if (event.active !== true) return
    let resolved
    try { resolved = await identity.resolveDid(event.did) }
    catch (err) { log.warn({ err, seq: event.seq }, 'DID resolution failed'); return }
    if (!resolved?.pds) { log.warn({ seq: event.seq }, 'DID has no valid PDS endpoint'); return }
    const provider = matchProvider(resolved.pds, providers)
    if (!provider) { log.debug({ seq: event.seq }, 'Untracked PDS account event'); return }
    const handle = await identity.verifyHandle(event.did, resolved.claimedHandle)
    const time = event.time ? Date.parse(event.time) : NaN
    const observedAt = Number.isFinite(time) ? Math.min(time, now()) : now()
    // Persistent write errors deliberately escape: the indexer must NOT ack.
    await record({ seq: event.seq, did: event.did, providerId: provider.id, handle, observedAt })
  }
}

export async function consumeAccounts(options: {
  url: string; cursor: CursorStore; handle: (event: AccountEvent) => Promise<void>
  log: FastifyBaseLogger; signal: AbortSignal; concurrency?: number; transport?: LiveTransport
}) {
  const { log, signal } = options
  const js = new Jetstream(options.url)
  const pending = new Set<Promise<void>>()
  const indexer = new LexIndexer({ concurrency: options.concurrency ?? 8 }).account(event => {
    const work = options.handle(event)
    pending.add(work)
    void work.then(() => pending.delete(work), () => pending.delete(work))
    return work
  })
  const transport = options.transport ?? websocketTransport({
    onConnect: () => log.info('Jetstream connected'),
    onDisconnect: () => log.warn('Jetstream disconnected'),
    onReconnect: (err, { attempt }) => log.warn({ err, attempt }, 'Jetstream reconnecting'),
  })
  while (!signal.aborted) {
    try {
      await js.runner(indexer).live({ cursor: options.cursor, signal, liveTransport: transport,
        onError: err => log.warn({ err }, 'Jetstream event decoding failed'),
        onInfo: info => log.warn({ info }, 'Jetstream advisory'),
      })
    } catch (err) {
      if (!signal.aborted) log.error({ err }, 'Jetstream processing stopped; resuming from durable cursor')
    } finally {
      // SDK abort/source-error exits need draining before restarting or closing Redis.
      await Promise.allSettled([...pending])
    }
    if (!signal.aborted) await delay(1000, undefined, { signal }).catch(() => {})
  }
}
