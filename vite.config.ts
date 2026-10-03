import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { parseProviders } from './src/config.ts'
const providers = parseProviders(JSON.parse(readFileSync('config/providers.json', 'utf8')))
const registry = JSON.stringify(providers, null, 2)
export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [{
    name: 'launcher-static-data',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'v1/providers.json', source: registry }) },
    configureServer(server) {
      server.middlewares.use('/v1/providers.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(registry)
      })
    },
  }],
})
