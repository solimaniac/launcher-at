import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { parseProviders, parseApps } from './src/config.ts'
import { metadataFor } from './build/metadata.ts'
import { embedsPlugin } from './build/embeds.ts'
import en from './locales/en.json' with { type: 'json' }

const DEV_ORIGIN = 'http://127.0.0.1:5173'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

// Configuration is validated here, so invalid providers or apps fail `npm run dev` and `npm run build`.
const providers = parseProviders(readJson('config/providers.json'))
const apps = parseApps(readdirSync('apps').map(id => readJson(`apps/${id}/config.json`)))

/** Resolves a dotted locale key such as `providers.bluesky` in the English strings. */
function englishText(key: string) {
  let value: unknown = en
  for (const part of key.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
  }
  if (typeof value !== 'string') throw new Error(`Missing English provider description: ${key}`)
  return value
}

/** Public `/v1/providers.json`: the provider config with descriptions resolved to English text. */
const providerRegistry = JSON.stringify(
  providers.map(provider => ({ ...provider, description: englishText(provider.description) })),
  null,
  2,
)

function activityOrigin(value: string | undefined) {
  if (!value) return ''
  const url = new URL(value)
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.origin !== value || (url.protocol !== 'https:' && !loopback)) {
    throw new Error('PUBLIC_ACTIVITY_API must be an HTTPS origin (or loopback HTTP) without a path or trailing slash')
  }
  return value
}

/** Serves generated JSON files in development and emits them into `dist/` on build. */
function staticDataPlugin(files: Record<string, string>): Plugin {
  return {
    name: 'launcher-static-data',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      for (const [fileName, source] of Object.entries(files)) {
        server.middlewares.use(`/${fileName}`, (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(source)
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PUBLIC_')
  const origin = process.env.PUBLIC_ORIGIN || env.PUBLIC_ORIGIN || DEV_ORIGIN
  const oauthMetadata = JSON.stringify(metadataFor(origin), null, 2)
  const activityApi = activityOrigin(process.env.PUBLIC_ACTIVITY_API ?? env.PUBLIC_ACTIVITY_API)

  return {
    define: { __ACTIVITY_API__: JSON.stringify(activityApi) },
    test: { include: ['src/**/*.test.ts', 'build/**/*.test.ts'] },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { rolldownOptions: { input: ['index.html', 'callback.html'] } },
    plugins: [
      embedsPlugin(apps, origin),
      staticDataPlugin({ 'v1/providers.json': providerRegistry, 'oauth-client-metadata.json': oauthMetadata }),
    ],
  }
})
