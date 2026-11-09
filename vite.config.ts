import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { providers as providerDirectory } from 'pds-registry'
import { parseProviders, parseApps } from './src/config.ts'
import { metadataFor } from './build/metadata.ts'
import { embedsPlugin } from './build/embeds.ts'

const DEV_ORIGIN = 'http://127.0.0.1:5173'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

// Configuration is validated here, so invalid providers or apps fail `npm run dev` and `npm run build`.
const providers = parseProviders(providerDirectory)
const apps = parseApps(
  readdirSync('apps').map(id => readJson(`apps/${id}/config.json`)),
  providers,
)

/** Keep the existing public API and asset paths, backed by the extracted package. */
const providerRegistry = JSON.stringify(
  providers.map(provider => ({ ...provider, ...(provider.logo ? { logo: `/providers/${provider.logo}` } : {}) })),
  null,
  2,
)
const directoryRoot = dirname(createRequire(import.meta.url).resolve('pds-registry/package.json'))
const providerLogos = Object.fromEntries(
  providers
    .filter(provider => provider.logo)
    .map(provider => [`providers/${provider.logo}`, readFileSync(join(directoryRoot, 'logos', provider.logo!))]),
)

/** Serves generated JSON files in development and emits them into `dist/` on build. */
function staticDataPlugin(files: Record<string, string | Uint8Array>): Plugin {
  return {
    name: 'launcher-static-data',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      for (const [fileName, source] of Object.entries(files)) {
        server.middlewares.use(`/${fileName}`, (_req, res) => {
          const types: Record<string, string> = {
            json: 'application/json',
            svg: 'image/svg+xml',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
          }
          res.setHeader('Content-Type', types[fileName.split('.').at(-1)!] ?? 'application/octet-stream')
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

  return {
    test: { include: ['src/**/*.test.ts', 'build/**/*.test.ts'] },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { rolldownOptions: { input: ['index.html', 'callback.html'] } },
    plugins: [
      embedsPlugin(apps, origin),
      staticDataPlugin({
        'v1/providers.json': providerRegistry,
        'oauth-client-metadata.json': oauthMetadata,
        ...providerLogos,
      }),
    ],
  }
})
