# Activity backend

One persistent Node process: Fastify HTTP, official `@bsky/jetstream` v2 consumer, official `@atproto/identity` resolution, and one Redis service. No workers, queue, Postgres, profiles, authentication, or frontend push connections. The static frontend can poll the two REST endpoints; this change does not add frontend UI or polling.

## Meaning of “joined”

A join is an observed active account event attributed to a configured provider via the current PDS endpoint in the DID document. **It is not a guaranteed canonical account-creation event.** Migrations and reactivations can also emit active account events. Counts are events, not unique accounts.

“30 days” means **today's UTC calendar date plus the preceding 29 UTC dates**, not the last 720 hours. Event timestamps determine daily buckets and `joinedAt`; missing/invalid timestamps fall back to processing time, and future timestamps are capped at processing time.

First deployment starts at live activity, without historical backfill. Redis persists a live timestamp boundary before consuming the first event so a failed first write can be resumed safely. Subsequent checkpoints are Jetstream v2 sequence numbers. `observedSince` records when tracking first started; counts initially cover only observations since that time. A full period requires continuous observation. Long outages exceeding Jetstream's lookback, or DID-resolution failures, can leave gaps; `observedSince` is not a completeness guarantee.

## Local development

Node **22.18+** (Node 24 LTS recommended), npm, and Redis 7+:

```sh
# From repository root: only the backend dependencies are needed.
npm --prefix backend install
# Or npm --prefix backend ci for the committed lockfile.
docker run --name atmosphere-redis -p 6379:6379 -d redis:7-alpine
cp backend/.env.example backend/.env
cd backend
npm run dev
```

The dev command loads `.env` and uses native Node TypeScript/watch support. Production uses compiled JavaScript:

```sh
# From repository root
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend start
```

Tests mock identity/network responses and Redis in-process; they never require the production Jetstream or a running Redis. Production needs real Redis. Root frontend tests remain separate (`npm test`).

`npm start` reads process environment, not `.env`; for an explicit local production run use `node --env-file=.env dist/index.js` from `backend/`.

### Environment

| Variable | Default / purpose |
|---|---|
| `PORT` | `3000`; respects Railway's injected port; binds `0.0.0.0` |
| `REDIS_URL` | `redis://127.0.0.1:6379` locally; required in production; `rediss://` supported by ioredis |
| `JETSTREAM_URL` | `https://jetstream.us-east.bsky.network`, the public **v2** service origin |
| `ALLOWED_ORIGINS` | Comma-separated exact origins. Development defaults to `http://127.0.0.1:5173,http://localhost:5173`; production defaults to no cross-origin access. Explicit `*` is allowed; credentials are always disabled. |
| `NODE_ENV` | Set to `production` when deployed |
| `LOG_LEVEL` | `info`; use `debug` for untracked-provider and failed handle verification details |
| `IDENTITY_CONCURRENCY` | `8`, bounded maximum `20`; SDK indexer preserves per-DID order |

Keep `.env`, credentials, and service URLs containing passwords out of Git. `.env.example` contains only local placeholders.

## Provider tracking

`config/providers.json` is the only provider registry. The backend tracks entries only when **both** `enabled` and `tracking.enabled` are true. Disabled/missing tracking entries are excluded from counts, matching, and the recent API. The frontend's existing parser ignores the tracking fields.

Add tracking to a provider in that file:

```json
"tracking": {
  "enabled": true,
  "pdsHostMatchers": [{ "type": "exact", "value": "pds.example.com" }]
}
```

Only exact and suffix hostname comparisons are supported. Suffixes must begin with `.` to enforce a DNS-label boundary, e.g. `.host.bsky.network`. Matches are case-insensitive; ambiguous overlaps use the first provider in configuration order. Avoid overlapping matchers. Restart/redeploy after configuration changes.

**Verify physical PDS hosts, not just the signup entryway.** Check a provider's `com.atproto.sync.listRepos`, resolve a sample DID through PLC/DID tooling, and inspect `#atproto_pds`. Relay [`com.atproto.sync.listHosts`](https://relay1.us-east.bsky.network/xrpc/com.atproto.sync.listHosts?limit=1000) is another useful check. Do not infer hosting from a handle suffix.

The initial matchers were verified against relay host listings and sample DID documents: Bluesky's `*.host.bsky.network` (89 relay hosts), and exact hosts `eurosky.social`, `blacksky.app`, `pds.wsocial.network`, `northsky.social`, `selfhosted.social`, `tngl.sh`, `pds.sprk.so`, `npmx.social`, `pds.pckt.cafe`, `pds.witchcraft.systems`. Test/demo subdomains are not automatically included. One sampled repository listed by selfhosted.social had migrated elsewhere; attribution correctly uses its current DID endpoint, not the listing host.

Handles are display-only: a valid claimed handle must resolve back to the same DID. Missing, malformed, `handle.invalid`, mismatched, or unresolvable handles never enter the public feed, but successful PDS attribution still increments the count. No AppView/profile/avatar fetches occur.

## API

Read-only, no authentication or cookies:

- **`GET /api/v1/providers/counts`** → `{ "windowDays": 30, "observedSince": "...", "providers": [{ "id": "...", "name": "...", "joined": 0 }] }`. Includes every tracked provider, even zero-count providers; ignores unknown Redis hash fields. Reads 30 daily hashes in one pipeline. `observedSince` is `null` if tracking metadata is absent.
- **`GET /api/v1/joins/recent?limit=50`** → `{ "windowMinutes": 5, "joins": [{ "handle": "...", "providerId": "...", "providerName": "...", "joinedAt": "..." }] }`. Default/max 50; larger limits are capped. Non-integer or nonpositive limits return 400. Newest first, never older than five minutes, no public DIDs. Fewer valid handles means fewer results.
- **`GET /health`** → HTTP 200 `{ "status": "ok" }` when Redis responds; HTTP 503 otherwise. A Jetstream reconnect alone does not fail health.

Unexpected API storage errors return HTTP 503, not fabricated empty/zero data.

## Redis retention and recovery

| Key | Contents / retention |
|---|---|
| `atmosphere:joins:recent` | Sorted set of sequence, DID, verified handle, provider ID, observed timestamp; pruned on insert/read and every 30 seconds; five-minute key TTL when idle |
| `atmosphere:joins:count:YYYY-MM-DD` | Hash of provider ID → aggregate count; expires 32 days after its last increment; no DIDs |
| `atmosphere:jetstream:cursor` | Last contiguous successfully acknowledged v2 sequence (live timestamp boundary before first checkpoint); persistent operational metadata |
| `atmosphere:tracking:startedAt` | Set once with `NX`; persistent operational timestamp |
| `atmosphere:jetstream:counted:<seq>` | One-day replay marker containing only `1`; no DID/handle; atomic with count/feed write |

Only aggregates survive beyond the short-lived feed, apart from non-user-identifying operational metadata. No permanent user histories or identity caches are stored. Redis needs persistence and a non-evicting policy; losing Redis data loses counts and the observation boundary. Redis persistence/backups should respect the same short-lived identity retention policy.

The SDK manages WebSocket reconnect/resume and bounded concurrency. An account handler acknowledges only after its persistent write succeeds. A Redis count-write error stops that indexing run; the small supervisor restarts from the durable cursor. One atomic Lua operation combines the counter, optional recent entry, and replay marker, preventing duplicate counts on ambiguous replies or concurrent completions replayed after an earlier failure. Markers expire after one day; this is deliberately not an unlimited exactly-once guarantee.

DID failures/malformed endpoints are logged and skipped; untracked providers are debug-only. Handle failures omit display data without dropping counts. Checkpoint failures retry without reporting success or producing an unhandled rejection. An unreachable Redis during cursor loading never falls back silently to live. SIGINT/SIGTERM stop the source, drain pending handlers, flush checkpoints, close HTTP, then quit Redis. Shutdown has a ten-second hard deadline if dependencies never recover.

Use one backend replica. Do not overlap deployments that consume the same Redis state; the current process/cursor design is not a multi-replica processor. Configure Railway's draining/overlap settings so the old consumer exits before the new one runs.

Cursors are not portable between Jetstream v1/v2 or necessarily between different instances. Do not point at numbered legacy v1 hosts. If changing Jetstream instances, inspect compatibility before resetting `atmosphere:jetstream:cursor`; an intentional reset starts live and creates a known observation gap. `OutdatedCursor` advisories are logged; a cursor rejected by the server requires operator intervention rather than silently discarding history.

## Railway

Provision exactly **one persistent Node service and one Railway Redis service**, in the same project/environment. No Postgres or separate worker. This repository includes `backend/Dockerfile`, built from **repository root** so the shared provider configuration is included:

```sh
docker build -f backend/Dockerfile -t atmosphere-activity .
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e ALLOWED_ORIGINS=https://your-launcher.example \
  atmosphere-activity
```

In the Railway backend service:

1. Connect the repository; leave **Root Directory `/`** (not `/backend`).
2. Set `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`. The image installs/builds only the backend and copies `config/providers.json` into `/app/config`; it starts `node dist/index.js` as a non-root user.
3. Set `REDIS_URL=${{Redis.REDIS_URL}}` (replace `Redis` with your Redis service name), `NODE_ENV=production`, and `ALLOWED_ORIGINS` to the static site's exact HTTPS origin(s). ioredis uses `family: 0` for Railway's private IPv4/IPv6 networking.
4. Do not override the injected `PORT`; the process uses it automatically. Enable persistent deployment (no sleeping/serverless mode), with **one replica** and no overlapping consumers.
5. Set the service **healthcheck path to `/health`**; allow enough startup time for Redis connection. Jetstream availability is independent of this healthcheck. Railway healthchecks gate deployments, not continuous stream monitoring.
6. Keep the root build context intact; watch both `backend/**` and `config/providers.json` for redeployment. The frontend stays a separately hosted static site.

As of the current [Railway documentation](https://docs.railway.com/config-as-code), new services cannot opt into deprecated `railway.json` / `railway.toml` Config as Code. Use the dashboard settings above or the current [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) workflow (`railway config init/plan/apply`) with `healthcheck: '/health'`. No deployment or resource provisioning is performed by this repository change.

References: [Jetstream SDK](https://bsky.network/docs/jetstream-sdk/), [official client](https://github.com/bluesky-social/bsky/tree/main/packages/jetstream), [identity tooling](https://github.com/bluesky-social/atproto/tree/main/packages/identity), [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Railway Redis networking](https://docs.railway.com/networking/private-networking/library-configuration).
