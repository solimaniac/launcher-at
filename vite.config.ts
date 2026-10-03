import { defineConfig, loadEnv } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { parseProviders, parseApps } from './src/config.ts'
import { metadataFor } from './build/metadata.ts'
const providers = parseProviders(JSON.parse(readFileSync('config/providers.json', 'utf8')))
const registry = JSON.stringify(providers, null, 2)
parseApps(readdirSync('apps').map(id => JSON.parse(readFileSync(`apps/${id}/config.json`, 'utf8'))))
export default defineConfig(({ mode }) => {
  const origin = loadEnv(mode, process.cwd(), 'PUBLIC_').PUBLIC_ORIGIN || 'http://127.0.0.1:5173'
  const metadata = JSON.stringify(metadataFor(origin), null, 2)
  return {
  server: { host: '127.0.0.1' },
  plugins: [{
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
