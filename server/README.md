# Activity backend

One persistent Node process: Hono HTTP with `@hono/node-server` and Pino structured logging, official `@bsky/jetstream` v2 consumer, official `@atproto/identity` resolution, and one Redis service. No workers, queue, Postgres, profiles, authentication, or frontend push connections. The static frontend polls the two REST endpoints when built with `PUBLIC_ACTIVITY_API` (see the root README's "Activity display"); its poll interval is sized against the default rate limits below.

## Meaning of “joined”

A join is an observed active account event attributed to a configured provider via the current PDS endpoint in the DID document. **It is not a guaranteed canonical account-creation event.** Migrations and reactivations can also emit active account events. Counts are events, not unique accounts.

“30 days” means **today's UTC calendar date plus the preceding 29 UTC dates**, not the last 720 hours. Event timestamps determine daily buckets and `joinedAt`; missing/invalid timestamps fall back to processing time, and future timestamps are capped at processing time.

First deployment starts at live activity, without historical backfill. Redis persists a live timestamp boundary before consuming the first event so a failed first write can be resumed safely. Subsequent checkpoints are Jetstream v2 sequence numbers. `observedSince` records when tracking first started; counts initially cover only observations since that time. A full period requires continuous observation. Long outages exceeding Jetstream's lookback, or DID-resolution failures, can leave gaps; `observedSince` is not a completeness guarantee.

## Local development

Node **22.18+** (Node 24 LTS recommended), npm, and Redis 7+:

```sh
# From repository root: only the backend dependencies are needed.
npm --prefix server install
# Or npm --prefix server ci for the committed lockfile.
docker run --name atmosphere-redis -p 6379:6379 -d redis:7-alpine
cp server/.env.example server/.env
cd server
npm run dev
```

The dev command loads `.env` and uses native Node TypeScript/watch support. Production uses compiled JavaScript:

```sh
# From repository root
npm --prefix server run typecheck
npm --prefix server test
npm --prefix server run build
npm --prefix server start
```

Tests mock identity/network responses and Redis in-process; they never require the production Jetstream or a running Redis. Production needs real Redis. Root frontend tests remain separate (`npm test`).

`npm start` reads process environment, not `.env`; for an explicit local production run use `node --env-file=.env dist/index.js` from `server/`.

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
| `TRUST_RAILWAY_PROXY` | `false`; trust Railway's `X-Real-IP` only after verifying the edge overwrites it and there is no direct origin access. Never trusts `X-Forwarded-For`. |
| `RATE_LIMIT_PER_MINUTE` | `120` requests per client per UTC minute, shared across all non-health paths and methods |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `1200` non-health requests per process per UTC minute, including requests rejected by the per-client quota |
| `MAX_CONCURRENT_REQUESTS` | `32` admitted HTTP requests in flight; excess returns 503 with `Retry-After: 1` |

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
- **`GET /health`** → HTTP 200 `{ "status": "ok" }` when Redis responds; HTTP 503 otherwise. Checks are single-flight with a one-second result cache and a two-second timeout. A Jetstream reconnect alone does not fail health. Excess health probes return 429.

Unexpected API storage errors return HTTP 503, not fabricated empty/zero data.

### Abuse protection and limits

**This is not DDoS immunity.** Admission limits cap Redis-backed work, memory used by quota tracking, and HTTP concurrency, but rejected traffic still consumes network bandwidth, sockets, and Node CPU. A sufficiently large or distributed flood can deny service or exhaust Railway resources. CORS is not an access-control or DDoS mechanism.

- Request admission runs before routes, CORS preflights, Redis reads, and error logging. API endpoints, unknown paths, query variations, HEAD, invalid requests, and OPTIONS share client/global quotas. Rejected requests do not hit Redis and are not individually logged.
- Rate limiting is **process-local**, not Redis-backed, matching the single-replica design. UTC minute windows reset on restart and can admit two windows' quota near a minute boundary. Quotas are not an even-per-second throttle. Shared NAT users and IPv6 clients in the same /64 share a limit; tune based on expected polling and usage.
- At most 4,096 client keys are retained per budget for the current minute. Live quotas are never evicted to admit a new identity; a full table denies new identities until reset. No IP addresses are stored in Redis or logged by the limiter.
- HTTP 429 includes `Retry-After` and `Cache-Control: no-store`. Allowed browser origins receive CORS headers on rejections and may read `Retry-After`. Clients should stop polling until then; do not retry-loop a 429/503.
- Health has its own 30-per-client/120-global-per-minute allowance, independent of API saturation. This prevents API traffic from consuming probe quotas, but an attacker flooding health can still deny probes. Coalesced pings bound its Redis load; health is not an unlimited bypass.
- Only GET, HEAD, and OPTIONS are admitted. Unsupported methods return 405. Request bodies/transfer encoding are rejected without buffering (400), oversized URLs return 414 (2,048-character cap), and Node rejects headers above 8 KiB (431). `Expect: 100-continue` uploads get 417. Rejected upload connections close after the response.
- Node limits sockets to 256, headers/request upload/inactivity to approximately ten seconds, idle keep-alive to five seconds, and requests per socket to 100. These are origin limits, not assurances about Railway's edge accepting traffic. HTTP work slots are released on errors as well as success.

#### Client-IP trust before deployment

Local/direct mode ignores all forwarded headers and uses the socket peer. Behind a reverse proxy that means clients share the proxy's quota until configured otherwise. Set `TRUST_RAILWAY_PROXY=true` **only for an origin exclusively reached through Railway's edge** after verifying its `X-Real-IP` overwrite behavior. [Railway documents this header as the client IP](https://docs.railway.com/networking/public-networking/specs-and-limits); the implementation never trusts the leftmost `X-Forwarded-For`, Cloudflare headers, request IDs, or arbitrary client-supplied identity values. Missing/invalid proxy identity shares one restrictive bucket. IPv4-mapped IPv6 and equivalent IPv6 spellings normalize so aliases cannot rotate quotas.

Before enabling trust, send repeated public requests with different spoofed `X-Real-IP` and `X-Forwarded-For` values from one connection/source and confirm the same quota is enforced; compare Railway's source-IP network logs. The production deployment's bounded header probe confirmed that Railway replaced three spoofed identities with the actual source IP; the temporary probe and domain were removed. A subsequent API smoke admitted exactly 120 requests and rejected further requests with 429 despite rotating spoofed headers, while `/health` stayed 200. Do not expose an alternative origin port/TCP proxy with forwarded-header trust enabled. An additional CDN changes the client-IP boundary: verify it instead of assuming the supplied client header is authoritative.

#### Railway edge protection

[Railway's documentation](https://docs.railway.com/networking/public-networking/specs-and-limits#ddos-protection) states its network-layer mitigation and domain RPS limits may not prevent application-layer overload. Configure edge rules/WAF or an external API-compatible DDoS/rate-limit service **before** public launch, with limits aligned to the origin's capacity. Apply protection to every attached domain, including the default Railway domain; an unprotected alternate domain is a bypass. [Railway Edge Rules](https://docs.railway.com/networking/edge-rules) can block unnecessary paths/sources before they reach Node. Monitor request rates, 429/503 rates, CPU/memory, Redis latency, and costs; maintain an incident plan to block floods at the edge.

Do not blindly enable [Railway Under Attack Mode](https://docs.railway.com/networking/waf) on this API-only domain: Railway says browser challenges are shown only on navigations, while API calls are blocked. The separately hosted static frontend does not automatically gain clearance, and this API sends no credentials. Choose API-compatible blocking/rate rules, or deliberately plan the same-root-domain browser clearance flow before using challenges.

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

Use one backend replica. Do not overlap deployments that consume the same Redis state; the current process/cursor design is not a multi-replica processor. Railway's overlap setting controls the period **after** the new deployment becomes active; even zero overlap does not prevent both consumers running during startup/healthchecks. Stop the old backend deployment and wait for removal before uploading its replacement. Keep automatic deployments disconnected until consumer coordination is implemented.

Cursors are not portable between Jetstream v1/v2 or necessarily between different instances. Do not point at numbered legacy v1 hosts. If changing Jetstream instances, inspect compatibility before resetting `atmosphere:jetstream:cursor`; an intentional reset starts live and creates a known observation gap. `OutdatedCursor` advisories are logged; a cursor rejected by the server requires operator intervention rather than silently discarding history.

## Railway

Provision exactly **one persistent Node service and one Railway Redis service**, in the same project/environment. No Postgres or separate worker. This repository includes `server/Dockerfile`, built from **repository root** so the shared provider configuration is included:

```sh
docker build -f server/Dockerfile -t atmosphere-activity .
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e ALLOWED_ORIGINS=https://your-launcher.example \
  atmosphere-activity
```

In the Railway backend service:

1. Leave **Root Directory `/`** (not `/server`). Upload from the repository root with `railway up --service server --environment production --ci`. Do not connect automatic repository deployments for this single-consumer design.
2. Set `RAILWAY_DOCKERFILE_PATH=server/Dockerfile`. The image installs/builds only the backend and copies `config/providers.json` into `/app/config`; it starts `node dist/index.js` as a non-root user.
3. Set `REDIS_URL=${{Redis.REDIS_URL}}` (replace `Redis` with your Redis service name), `NODE_ENV=production`, and `ALLOWED_ORIGINS` to the static site's exact HTTPS origin(s). ioredis uses `family: 0` for Railway's private IPv4/IPv6 networking.
4. Do not override the injected `PORT`; the process uses it automatically. Enable persistent deployment (no sleeping/serverless mode), with **one replica** and no overlapping consumers.
5. Set the service **healthcheck path to `/health`**; allow enough startup time for Redis connection. Jetstream availability is independent of this healthcheck. Railway healthchecks gate deployments, not continuous stream monitoring.
6. Keep the root build context intact. Changes to either `server/**` or `config/providers.json` require a deployment. For manual CLI uploads, leave Watch Paths empty: filters can skip an unchanged upload even after the previous deployment was removed.
7. Verify the public client-IP boundary described above, then enable `TRUST_RAILWAY_PROXY=true` for per-client limits. Configure API-compatible edge protection on all domains; the application limiter alone is not a volumetric DDoS defense.

As of the current [Railway documentation](https://docs.railway.com/config-as-code), new services cannot opt into deprecated `railway.json` / `railway.toml` Config as Code. Use the dashboard settings above, the Railway CLI's `railway api` for project settings, or the current [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) workflow (`railway config init/plan/apply`) with `healthcheck: '/health'`.

### Provisioned production deployment

Project [`launcher-at`](https://railway.com/project/44fb4fd8-4f01-4692-a781-d4e80dcab211), workspace **Personal Projects**, environment **production**. Public API: `https://server-production-1e48d.up.railway.app`. No frontend, Postgres, or worker is deployed.

- `server`: repository-root `server/Dockerfile`, Node 24, one replica in `sfo`, sleeping disabled, `/health` healthcheck with a 120-second timeout, zero post-activation overlap, and 15-second shutdown drain. Railway supplies `PORT`. Source is a CLI upload, not automatic GitHub deployments; Watch Paths are empty so stop-then-upload also works for unchanged source.
- `Redis`: Railway Redis 8.2 with a 5 GB volume mounted at `/data`, private-network-only access, password authentication, `appendonly yes`, `appendfsync everysec`, `save 60 1`, and `maxmemory-policy noeviction`. Credentials stay in Railway variables; the server uses `${{Redis.REDIS_URL}}`.
- `NODE_ENV=production`, `TRUST_RAILWAY_PROXY=true`, and empty `ALLOWED_ORIGINS`. Configure the future frontend's exact HTTPS origin before browser polling; no wildcard CORS is enabled.
- One service-wide edge rule blocks paths other than `/health`, `/api/v1/providers/counts`, and `/api/v1/joins/recent` with HTTP 404. It applies to every attached domain. No browser challenges or edge caching are enabled. This path filter is **not** volumetric DDoS/rate protection for the permitted API paths.
- Live verification observed Redis health, Jetstream connection, nonzero counts for the 11 configured tracked providers, recent verified handles, invalid-limit rejection (400), unsupported-method rejection (405), and edge path rejection (404). Tracking began at `2026-10-03T17:35:18.924Z`; no historical backfill was performed.

Future deployments must stop the existing consumer first. From the repository root:

```sh
railway down --service server --environment production --yes
# Wait for the deployment removal above to complete before uploading.
railway up --service server --environment production --ci
curl --fail https://server-production-1e48d.up.railway.app/health
```

This deliberately accepts brief HTTP downtime to prevent simultaneous Jetstream consumers. Redis and its cursor remain running; the replacement resumes from that cursor. Do not use rolling `up`/`redeploy` against a running backend or enable automatic deployments.

References: [Jetstream SDK](https://bsky.network/docs/jetstream-sdk/), [official client](https://github.com/bluesky-social/bsky/tree/main/packages/jetstream), [identity tooling](https://github.com/bluesky-social/atproto/tree/main/packages/identity), [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Railway Redis networking](https://docs.railway.com/networking/private-networking/library-configuration).
