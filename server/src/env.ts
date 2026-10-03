export function loadEnv(env: NodeJS.ProcessEnv = process.env) {
  const number = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback)
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`)
    return value
  }
  if (env.NODE_ENV === 'production' && !env.REDIS_URL) throw new Error('REDIS_URL is required in production')
  if (env.TRUST_RAILWAY_PROXY !== undefined && !['true', 'false'].includes(env.TRUST_RAILWAY_PROXY)) throw new Error('TRUST_RAILWAY_PROXY must be true or false')
  return {
    port: number('PORT', 3000, 65535),
    redisUrl: env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    jetstreamUrl: env.JETSTREAM_URL ?? 'https://jetstream.us-east.bsky.network',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5173,http://localhost:5173')).split(',').map(s => s.trim()).filter(Boolean),
    concurrency: number('IDENTITY_CONCURRENCY', 8, 20),
    logLevel: env.LOG_LEVEL ?? 'info',
    trustRailwayProxy: env.TRUST_RAILWAY_PROXY === 'true',
    requestsPerMinute: number('RATE_LIMIT_PER_MINUTE', 120, 10000),
    globalRequestsPerMinute: number('GLOBAL_RATE_LIMIT_PER_MINUTE', 1200, 100000),
    maxConcurrentRequests: number('MAX_CONCURRENT_REQUESTS', 32, 256),
  }
}
