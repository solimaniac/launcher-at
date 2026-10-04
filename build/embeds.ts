import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import type { Plugin } from 'vite'
import { lookupApp, type AppConfig } from '../src/config.ts'
import en from '../locales/en.json' with { type: 'json' }

function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
export function embedCopy(app: AppConfig) {
  return {
    title: app.id === 'default' ? en.site.title : en.embed.appTitle.replace('{{appName}}', app.appName),
    heading: app.id === 'default' ? en.intro.title : en.embed.appTitle.replace('{{appName}}', app.appName),
    description: app.id === 'default' ? en.intro.generic : en.intro.app.replace('{{appName}}', app.appName),
  }
}
export function embedTags(app: AppConfig, origin: string) {
  const copy = embedCopy(app)
  const url = `${origin}/${app.id === 'default' ? '' : `?app=${app.id}`}`
  const image = `${origin}/embeds/${app.id}.png`
  const meta = (key: string, value: string, property = true) => `<meta ${property ? 'property' : 'name'}="${key}" content="${escape(value)}">`
  return `<!-- embed:start -->\n<title>${escape(copy.title)}</title>\n${[
    meta('description', copy.description, false),
    meta('og:type', 'website'), meta('og:site_name', app.appName),
    meta('og:title', copy.title), meta('og:description', copy.description), meta('og:url', url),
    meta('og:image', image), meta('og:image:type', 'image/png'),
    meta('og:image:width', '1200'), meta('og:image:height', '630'), meta('og:image:alt', `${app.appName}: ${copy.heading}`),
    meta('twitter:card', 'summary_large_image', false), meta('twitter:title', copy.title, false),
    meta('twitter:description', copy.description, false), meta('twitter:image', image, false),
    meta('twitter:image:alt', `${app.appName}: ${copy.heading}`, false),
  ].join('\n')}\n<!-- embed:end -->`
}

const font = {
  fontFiles: ['build/fonts/NotoSans.ttf', 'build/fonts/NotoSans-Bold.ttf'],
  defaultFontFamily: 'Noto Sans', sansSerifFamily: 'Noto Sans',
}
function measure(text: string, size: number, family: string, weight: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="200"><text x="0" y="120" font-family="${escape(family)}" font-size="${size}" font-weight="${weight}">${escape(text)}</text></svg>`
  return new Resvg(svg, { font }).getBBox()?.width ?? 0
}
function wrap(text: string, size: number, family: string, weight: number, width: number) {
  const lines: string[] = []
  let line = ''
  // Break even unspaced names rather than letting branding escape the image.
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate, size, family, weight) <= width) { line = candidate; continue }
    if (line) lines.push(line)
    line = ''
    for (const char of word) {
      if (line && measure(line + char, size, family, weight) > width) { lines.push(line); line = '' }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}
export async function embedImage(app: AppConfig) {
  const copy = embedCopy(app)
  const theme = app.theme
  const family = `${theme.fontFamily.replace(/system-ui/g, 'Noto Sans')}, Noto Sans`
  let size = 60
  let heading = wrap(copy.heading, size, family, 700, 880)
  while (heading.length > 2 && size > 24) { size -= 2; heading = wrap(copy.heading, size, family, 700, 880) }
  let descriptionSize = 25
  let description = wrap(copy.description, descriptionSize, family, 400, 880)
  while (description.length * descriptionSize * 1.35 > 130 && descriptionSize > 12) {
    descriptionSize -= 1
    description = wrap(copy.description, descriptionSize, family, 400, 880)
  }
  const brandSize = Math.min(25, 25 * 770 / Math.max(770, measure(app.appName, 25, family, 650)))
  let logo: Buffer
  if (app.logo_url) {
    const response = await fetch(app.logo_url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Could not load embed logo for ${app.id}: HTTP ${response.status}`)
    logo = Buffer.from(await response.arrayBuffer())
  } else logo = readFileSync('public/logo.png')
  const logoType = logo.subarray(0, 100).toString().includes('<svg') || logo.subarray(0, 100).toString().includes('<?xml') ? 'image/svg+xml' : 'image/png'
  const headingY = 260
  const descriptionY = headingY + heading.length * size * 1.18 + 28
  const textLines = (lines: string[], y: number, fontSize: number, weight: number) => lines.map((line, index) => `<text x="160" y="${y + index * fontSize * 1.35}" font-size="${fontSize}" font-weight="${weight}">${escape(line)}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${theme.primaryColor}" stop-opacity=".16"/><stop offset=".75" stop-color="${theme.backgroundColor}" stop-opacity="0"/></linearGradient></defs>
    <rect width="1200" height="630" fill="${theme.backgroundColor}"/>
    <rect width="1200" height="630" fill="url(#sky)"/>
    <rect x="88" y="64" width="1024" height="502" rx="24" fill="${theme.backgroundColor}" stroke="${theme.textColor}" stroke-opacity=".22"/>
    <g fill="${theme.textColor}" font-family="${escape(family)}">
      <image x="160" y="121" width="48" height="48" preserveAspectRatio="xMidYMid meet" xlink:href="data:${logoType};base64,${logo.toString('base64')}"/>
      <text x="224" y="154" font-size="${brandSize}" font-weight="650">${escape(app.appName)}</text>
      ${textLines(heading, headingY, size, 700)}
      ${textLines(description, descriptionY, descriptionSize, 400)}
    </g>
  </svg>`
  const renderer = new Resvg(svg, { font })
  return renderer.render().asPng()
}

export function embedsPlugin(apps: AppConfig[], origin: string): Plugin {
  const images = new Map<string, Promise<Buffer>>()
  const imageFor = (app: AppConfig) => {
    let image = images.get(app.id)
    if (!image) { image = embedImage(app); images.set(app.id, image) }
    return image
  }
  const selected = (url: string) => lookupApp(apps, new URL(url, origin).searchParams.get('app')).app
  const replaceTags = (html: string, app: AppConfig) => html.replace(/<!-- embed:start -->[\s\S]*?<!-- embed:end -->|<title><\/title>/, embedTags(app, origin))
  return {
    name: 'launcher-embeds',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return context.path === '/index.html' || context.path === '/' ? replaceTags(html, selected(context.originalUrl ?? '/')) : html
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const app = apps.find(app => req.url?.split('?')[0] === `/embeds/${app.id}.png`)
        if (!app) { next(); return }
        imageFor(app).then(image => { res.setHeader('Content-Type', 'image/png'); res.end(image) }, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? '/', origin)
        if (url.pathname === '/' || url.pathname === '/index.html') req.url = `/embeds/${selected(req.url ?? '/').id}.html${url.search}`
        next()
      })
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const index = bundle['index.html']
        if (!index || index.type !== 'asset') throw new Error('Missing built index.html for embeds')
        for (const app of apps) {
          this.emitFile({ type: 'asset', fileName: `embeds/${app.id}.png`, source: await imageFor(app) })
          this.emitFile({ type: 'asset', fileName: `embeds/${app.id}.html`, source: replaceTags(String(index.source), app) })
        }
        const routes = apps.map(app => `@embed_${app.id} {\n  path / /index.html\n  query app=${app.id}\n}\nrewrite @embed_${app.id} /embeds/${app.id}.html`).join('\n')
        this.emitFile({ type: 'asset', fileName: 'embed-routes.caddy', source: routes })
      },
    },
  }
}
