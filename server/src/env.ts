export function loadEnv(env: NodeJS.ProcessEnv = process.env) {
  const number = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback)
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`)
    return value
  }
  if (env.NODE_ENV === 'production' && !env.REDIS_URL) throw new Error('REDIS_URL is required in production')
  return {
    port: number('PORT', 3000, 65535),
    redisUrl: env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    jetstreamUrl: env.JETSTREAM_URL ?? 'https://jetstream.us-east.bsky.network',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5173,http://localhost:5173')).split(',').map(s => s.trim()).filter(Boolean),
    concurrency: number('IDENTITY_CONCURRENCY', 8, 20),
    logLevel: env.LOG_LEVEL ?? 'info',
  }
}
