import { Jetstream, LexIndexer, websocketTransport } from '@bsky/jetstream'
import type { AccountEvent, CursorStore, LiveTransport, JetstreamConsumer } from '@bsky/jetstream'
import type { Logger } from 'pino'
import { setTimeout as delay } from 'node:timers/promises'
import type { Identity } from './identity.ts'
import { matchProvider } from './providers.ts'
import type { TrackedProvider } from './providers.ts'

export interface Join {
  seq: number
  did: string
  handle?: string
  providerId: string
  observedAt: number
}
export function createAccountHandler(
  identity: Identity,
  providers: TrackedProvider[],
  record: (join: Join) => Promise<void>,
  log: Logger,
  now = Date.now,
) {
  return async (event: AccountEvent) => {
    if (event.active !== true) return
    let resolved
    try {
      resolved = await identity.resolveDid(event.did)
    } catch (err) {
      log.warn({ err, seq: event.seq }, 'DID resolution failed')
      return
    }
    if (!resolved?.pds) {
      log.warn({ seq: event.seq }, 'DID has no valid PDS endpoint')
      return
    }
    const provider = matchProvider(resolved.pds, providers)
    if (!provider) {
      log.debug({ seq: event.seq }, 'Untracked PDS account event')
      return
    }
    const handle = await identity.verifyHandle(event.did, resolved.claimedHandle)
    const time = event.time ? Date.parse(event.time) : NaN
    const observedAt = Number.isFinite(time) ? Math.min(time, now()) : now()
    // Persistent write errors deliberately escape: the indexer must NOT ack.
    await record({ seq: event.seq, did: event.did, providerId: provider.id, handle, observedAt })
  }
}

// Account events arrive roughly every few seconds; this much silence means the
// stream is stuck (e.g. resuming into a Jetstream seq hole), not quiet.
export const STALL_MS = 180_000

export async function consumeAccounts(options: {
  url: string
  apiKey?: string
  cursor: CursorStore
  handle: (event: AccountEvent) => Promise<void>
  log: Logger
  signal: AbortSignal
  concurrency?: number
  transport?: LiveTransport
  stallMs?: number
}) {
  const { log, signal, stallMs = STALL_MS } = options
  const js = new Jetstream({ service: options.url, apiKey: options.apiKey })
  const indexer = new LexIndexer({ concurrency: options.concurrency ?? 8 }).account(options.handle)
  const transport =
    options.transport ??
    websocketTransport({
      onConnect: () => log.info('Jetstream connected'),
      onDisconnect: () => log.warn('Jetstream disconnected'),
      onReconnect: (err, { attempt }) => log.warn({ err, attempt }, 'Jetstream reconnecting'),
    })
  while (!signal.aborted) {
    const run = new AbortController()
    const stop = () => run.abort()
    signal.addEventListener('abort', stop, { once: true })
    let lastEvent = Date.now()
    const watchdog = setInterval(
      () => {
        if (Date.now() - lastEvent < stallMs) return
        log.error({ silentMs: Date.now() - lastEvent }, 'Jetstream stalled; restarting from durable cursor')
        run.abort()
      },
      Math.min(stallMs, 10_000),
    )
    const consumer: JetstreamConsumer = {
      kinds: ['account'],
      async run(stream, context) {
        let sourceError: unknown
        // The SDK indexer drains on normal stream end, but not when its source
        // throws. Normalize source shutdown so handlers settle BEFORE runner flush.
        async function* drainedStream() {
          try {
            for await (const batch of stream) {
              lastEvent = Date.now()
              yield batch
            }
          } catch (err) {
            sourceError = err
          }
        }
        await indexer.run(drainedStream(), context)
        if (sourceError && !run.signal.aborted) throw sourceError
      },
    }
    const runner = js.runner(consumer)
    const opts = {
      cursor: options.cursor,
      signal: run.signal,
      liveTransport: transport,
      onError: (err: Error) => log.warn({ err }, 'Jetstream event decoding failed'),
      onInfo: (info: { name: string; message?: string }) => log.warn({ info }, 'Jetstream advisory'),
    }
    try {
      // With an API key, every (re)start reads the archive from the durable cursor before
      // going live. The archive crosses seq holes that strand a live-only resume.
      await (options.apiKey ? runner.replay(opts) : runner.live(opts))
    } catch (err) {
      if (!run.signal.aborted) log.error({ err }, 'Jetstream processing stopped; resuming from durable cursor')
    } finally {
      clearInterval(watchdog)
      signal.removeEventListener('abort', stop)
    }
    if (!signal.aborted) await delay(1000, undefined, { signal }).catch(() => {})
  }
}
