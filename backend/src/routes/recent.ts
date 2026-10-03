import type { FastifyInstance } from 'fastify'
import type { Storage } from '../storage.ts'
import type { TrackedProvider } from '../providers.ts'

export function recentRoute(app: FastifyInstance, storage: Storage, providers: TrackedProvider[], now = Date.now) {
  const names = new Map(providers.map(p => [p.id, p.name]))
  app.get<{ Querystring: { limit?: number } }>('/api/v1/joins/recent', {
    schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, default: 50 } }, additionalProperties: false } },
  }, async request => {
    const joins = await storage.recent([...names.keys()], Math.min(request.query.limit ?? 50, 50), now())
    return { windowMinutes: 5, joins: joins.map(j => ({ handle: j.handle!, providerId: j.providerId, providerName: names.get(j.providerId)!, joinedAt: new Date(j.observedAt).toISOString() })) }
  })
}
