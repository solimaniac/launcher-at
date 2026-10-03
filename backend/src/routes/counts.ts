import type { FastifyInstance } from 'fastify'
import type { Storage } from '../storage.ts'
import type { TrackedProvider } from '../providers.ts'

export function countsRoute(app: FastifyInstance, storage: Storage, providers: TrackedProvider[], now = Date.now) {
  app.get('/api/v1/providers/counts', async () => {
    const { observedSince, totals } = await storage.counts(providers.map(p => p.id), now())
    return { windowDays: 30, observedSince, providers: providers.map(p => ({ id: p.id, name: p.name, joined: totals[p.id] ?? 0 })) }
  })
}
