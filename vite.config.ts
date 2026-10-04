import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { parseProviders, parseApps } from './src/config.ts'
import { metadataFor } from './build/metadata.ts'
import { embedsPlugin } from './build/embeds.ts'
import en from './locales/en.json' with { type: 'json' }
const providers = parseProviders(JSON.parse(readFileSync('config/providers.json', 'utf8')))
const registry = JSON.stringify(providers.map(provider => {
  let description: unknown = en
  for (const key of provider.description.split('.')) {
    description = description && typeof description === 'object' ? (description as Record<string, unknown>)[key] : undefined
  }
  if (typeof description !== 'string') throw new Error(`Missing English provider description: ${provider.description}`)
  return { ...provider, description }
}), null, 2)
const apps = parseApps(readdirSync('apps').map(id => JSON.parse(readFileSync(`apps/${id}/config.json`, 'utf8'))))
function activityOrigin(value: string | undefined) {
  if (!value) return ''
  const url = new URL(value)
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.origin !== value || (url.protocol !== 'https:' && !loopback)) throw new Error('PUBLIC_ACTIVITY_API must be an HTTPS origin (or loopback HTTP) without a path or trailing slash')
  return value
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PUBLIC_')
  const origin = process.env.PUBLIC_ORIGIN || env.PUBLIC_ORIGIN || 'http://127.0.0.1:5173'
  const metadata = JSON.stringify(metadataFor(origin), null, 2)
  return {
  define: { __ACTIVITY_API__: JSON.stringify(activityOrigin(process.env.PUBLIC_ACTIVITY_API ?? env.PUBLIC_ACTIVITY_API)) },
  test: { include: ['src/**/*.test.ts', 'build/**/*.test.ts'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { rolldownOptions: { input: ['index.html', 'callback.html'] } },
  plugins: [embedsPlugin(apps, origin), {
    name: 'launcher-static-data',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'v1/providers.json', source: registry })
      this.emitFile({ type: 'asset', fileName: 'oauth-client-metadata.json', source: metadata })
    },
    configureServer(server) {
      server.middlewares.use('/v1/providers.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(registry)
      })
      server.middlewares.use('/oauth-client-metadata.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(metadata)
      })
    },
  }],
  }
})
