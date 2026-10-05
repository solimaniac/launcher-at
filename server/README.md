# Activity backend

Optional backend for launcher.at. It watches the AT Protocol [Jetstream](https://bsky.network/docs/jetstream-sdk/) for accounts becoming active on a tracked provider, and serves:

- how many people joined each provider in the last 30 days
- the most recent joins (verified handles only), used for the rocket-launch animation

It's a single Node.js process ([Hono](https://hono.dev)) backed by Redis. Providers come from the shared [`config/providers.json`](../config/providers.json).

## Run locally

Requires Node.js 22.18+ and Redis 7+.

```sh
docker run --name launcher-redis -p 6379:6379 -d redis:7-alpine
cd server
npm ci
cp .env.example .env
npm run dev
```

The API runs at http://127.0.0.1:3000. To use it from the frontend, set `PUBLIC_ACTIVITY_API=http://127.0.0.1:3000` in the root `.env.local`.

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Run from source with watch mode (loads `.env`)   |
| `npm test`          | Tests (Redis and network are mocked)             |
| `npm run typecheck` | TypeScript checks                                |
| `npm run build`     | Compile to `dist/`                               |
| `npm start`         | Run `dist/` (reads the process environment only) |

Linting runs from the repository root with `npm run lint`.

## Environment variables

| Variable                       | Default                                                        | Description                                                                                                  |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `REDIS_URL`                    | `redis://127.0.0.1:6379`                                       | **Required in production.**                                                                                  |
| `ALLOWED_ORIGINS`              | dev: `http://127.0.0.1:5173,http://localhost:5173`; prod: none | Comma-separated origins allowed to call the API (CORS). `*` allows any.                                      |
| `PORT`                         | `3000`                                                         | HTTP port.                                                                                                   |
| `NODE_ENV`                     | –                                                              | Set to `production` when deployed.                                                                           |
| `JETSTREAM_URL`                | `https://jetstream.us-east.bsky.network`                       | Jetstream v2 service.                                                                                        |
| `JETSTREAM_API_KEY`            | –                                                              | Recommended in production. Lets restarts replay the archive from the saved cursor, so no events are missed.  |
| `LOG_LEVEL`                    | `info`                                                         | Pino log level.                                                                                              |
| `IDENTITY_CONCURRENCY`         | `8`                                                            | Parallel DID lookups (max 20).                                                                               |
| `TRUST_RAILWAY_PROXY`          | `false`                                                        | Use Railway's `X-Real-IP` as the client IP. Enable only when the server is reachable solely through Railway. |
| `RATE_LIMIT_PER_MINUTE`        | `120`                                                          | Requests per client IP per minute.                                                                           |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `1200`                                                         | Requests per process per minute.                                                                             |
| `MAX_CONCURRENT_REQUESTS`      | `32`                                                           | In-flight requests before returning 503.                                                                     |

## API

All endpoints are read-only `GET` requests with no authentication.

| Endpoint                        | Response                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `/api/v1/providers/counts`      | `{ windowDays: 30, observedSince, providers: [{ id, name, joined }] }`              |
| `/api/v1/joins/recent?limit=50` | `{ joins: [{ handle, providerId, providerName, joinedAt }] }`, newest first, max 50 |
| `/health`                       | `200 { status: "ok" }` when Redis responds, otherwise `503`                         |

Rate-limited requests get `429` with a `Retry-After` header. Clients should wait that long before retrying.

## Tracking a provider

Add a `tracking` block to the provider in `config/providers.json`:

```json
"tracking": {
  "enabled": true,
  "pdsHostMatchers": [{ "type": "exact", "value": "pds.example.com" }]
}
```

Matchers are compared against the PDS hostname in each account's DID document. Use `"type": "suffix"` with a leading dot (e.g. `.host.bsky.network`) to match subdomains. Check real PDS hosts (for example with [`com.atproto.sync.listHosts`](https://relay1.us-east.bsky.network/xrpc/com.atproto.sync.listHosts?limit=1000)) rather than guessing from handles. Restart after changes.

## Things to know

- **"Joined" is approximate.** It counts account-activation events, which also include migrations and reactivations. The 30-day window is today plus the previous 29 UTC days.
- **No backfill.** Counts start from the first time the server runs (`observedSince`).
- **Run exactly one instance.** Two processes sharing a Redis would double-count. When redeploying, stop the old instance before starting the new one.
- **Redis needs persistence** and `maxmemory-policy noeviction`. Only aggregate counts and the latest 50 joins are kept.

## Docker

Build from the repository root so the shared provider config is included:

```sh
docker build -f server/Dockerfile -t launcher-activity .
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e ALLOWED_ORIGINS=https://your-launcher.example \
  launcher-activity
```

Use `/health` as the healthcheck path.
