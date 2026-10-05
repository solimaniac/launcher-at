import type { Hono } from 'hono'
import type { Storage } from '../storage.ts'
import type { TrackedProvider } from '../providers.ts'

export function recentRoute(app: Hono, storage: Storage, providers: TrackedProvider[]) {
  const names = new Map(providers.map(p => [p.id, p.name]))
  app.get('/api/v1/joins/recent', async c => {
    const values = c.req.queries('limit')
    const limit = values ? Number(values[0]) : 50
    if ((values && values.length !== 1) || !Number.isInteger(limit) || limit < 1)
      return c.json({ error: 'Invalid request' }, 400)
    const joins = await storage.recent([...names.keys()], limit)
    return c.json({
      joins: joins.map(j => ({
        handle: j.handle!,
        providerId: j.providerId,
        providerName: names.get(j.providerId)!,
        joinedAt: new Date(j.observedAt).toISOString(),
      })),
    })
  })
}
