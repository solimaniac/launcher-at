/**
 * Rich link previews: Open Graph/Twitter tags and a 1200×630 PNG per app, generated at build time.
 * In development and preview the plugin serves the matching document for `/?app=<id>`; in production
 * `dist/embed-routes.caddy` rewrites those URLs to the prebuilt `dist/embeds/<id>.html`.
 */
import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import type { Plugin } from 'vite'
import { DEFAULT_APP_ID, lookupApp, type AppConfig } from '../src/config.ts'
import en from '../locales/en.json' with { type: 'json' }

const IMAGE_WIDTH = 1200
const IMAGE_HEIGHT = 630
/** Maximum width of wrapped heading and description lines. */
const TEXT_WIDTH = 700
const LINE_HEIGHT = 1.35
const LOGO_TIMEOUT_MS = 15_000

/** Bundled fonts; Noto Sans also stands in for `system-ui` and any font missing on the build machine. */
const font = {
  fontFiles: ['build/fonts/NotoSans.ttf', 'build/fonts/NotoSans-Bold.ttf'],
  defaultFontFamily: 'Noto Sans',
  sansSerifFamily: 'Noto Sans',
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escape(value: string) {
  return value.replace(/[&<>"']/g, char => HTML_ESCAPES[char]!)
}

// ---------------------------------------------------------------------------
// Copy and meta tags
// ---------------------------------------------------------------------------

export function embedCopy(app: AppConfig) {
  if (app.id === DEFAULT_APP_ID) {
    return { title: en.site.title, heading: en.embed.genericHeading, description: en.embed.genericDescription }
  }
  const appTitle = en.embed.appTitle.replace('{{appName}}', app.appName)
  return { title: appTitle, heading: appTitle, description: en.embed.appDescription }
}

export function embedTags(app: AppConfig, origin: string) {
  const copy = embedCopy(app)
  const url = `${origin}/${app.id === DEFAULT_APP_ID ? '' : `?app=${app.id}`}`
  const image = `${origin}/embeds/${app.id}.png`
  const isCustomApp = app.id !== DEFAULT_APP_ID
  const imageAlt = isCustomApp ? `${app.appName}: ${copy.heading}` : copy.heading
  const property = (key: string, value: string) => `<meta property="${key}" content="${escape(value)}">`
  const name = (key: string, value: string) => `<meta name="${key}" content="${escape(value)}">`
  const tags = [
    name('description', copy.description),
    property('og:type', 'website'),
    ...(isCustomApp ? [property('og:site_name', app.appName)] : []),
    property('og:title', copy.title),
    property('og:description', copy.description),
    property('og:url', url),
    property('og:image', image),
    property('og:image:type', 'image/png'),
    property('og:image:width', String(IMAGE_WIDTH)),
    property('og:image:height', String(IMAGE_HEIGHT)),
    property('og:image:alt', imageAlt),
    name('twitter:card', 'summary_large_image'),
    name('twitter:title', copy.title),
    name('twitter:description', copy.description),
    name('twitter:image', image),
    name('twitter:image:alt', imageAlt),
  ]
  return `<!-- embed:start -->\n<title>${escape(copy.title)}</title>\n${tags.join('\n')}\n<!-- embed:end -->`
}

// ---------------------------------------------------------------------------
// Preview image
// ---------------------------------------------------------------------------

interface TextStyle {
  family: string
  weight: number
}

function measure(text: string, size: number, { family, weight }: TextStyle) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="200"><text x="0" y="120" font-family="${escape(family)}" font-size="${size}" font-weight="${weight}">${escape(text)}</text></svg>`
  return new Resvg(svg, { font }).getBBox()?.width ?? 0
}

/** Word-wraps `text` to `TEXT_WIDTH`, breaking inside words that are too long on their own. */
function wrap(text: string, size: number, style: TextStyle) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate, size, style) <= TEXT_WIDTH) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const char of word) {
      if (line && measure(line + char, size, style) > TEXT_WIDTH) {
        lines.push(line)
        line = ''
      }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Shrinks the font size in `step`s until `fits` accepts the wrapped lines or `minSize` is reached. */
function fitText(
  text: string,
  style: TextStyle,
  size: number,
  minSize: number,
  step: number,
  fits: (lines: string[], size: number) => boolean,
) {
  let lines = wrap(text, size, style)
  while (!fits(lines, size) && size > minSize) {
    size -= step
    lines = wrap(text, size, style)
  }
  return { lines, size }
}

/** The app's `logo_url`, or the launcher logo, with the MIME type needed for a data URL. */
async function loadLogo(app: AppConfig) {
  let logo: Buffer
  if (app.logo_url) {
    const response = await fetch(app.logo_url, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Could not load embed logo for ${app.id}: HTTP ${response.status}`)
    logo = Buffer.from(await response.arrayBuffer())
  } else {
    logo = readFileSync('public/logo.png')
  }
  const start = logo.subarray(0, 100).toString()
  const type = start.includes('<svg') || start.includes('<?xml') ? 'image/svg+xml' : 'image/png'
  return { logo, type }
}

function textLines(lines: string[], y: number, fontSize: number, weight: number) {
  return lines
    .map(
      (line, index) =>
        `<text x="72" y="${y + index * fontSize * LINE_HEIGHT}" font-size="${fontSize}" font-weight="${weight}">${escape(line)}</text>`,
    )
    .join('')
}

export async function embedImage(app: AppConfig) {
  const copy = embedCopy(app)
  const theme = app.theme
  const family = `${theme.fontFamily.replace(/system-ui/g, 'Noto Sans')}, Noto Sans`

  // Keep heading wrapping consistent across generic and custom-app previews.
  const heading = fitText(copy.heading, { family, weight: 700 }, 78, 24, 2, lines => lines.length <= 2)
  const description = fitText(
    copy.description,
    { family, weight: 400 },
    27,
    18,
    1,
    (lines, size) => lines.length * size * LINE_HEIGHT <= 100,
  )
  const { logo, type: logoType } = await loadLogo(app)
  const artwork = `<image x="830" y="135" width="360" height="360" preserveAspectRatio="xMidYMid meet" xlink:href="data:${logoType};base64,${logo.toString('base64')}"/>`

  const headingY = 245
  const descriptionY = headingY + (heading.lines.length - 1) * heading.size * LINE_HEIGHT + 64
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">
    <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="${theme.backgroundColor}"/>
    <circle cx="1010" cy="315" r="240" fill="${theme.primaryColor}" fill-opacity=".08"/>
    ${artwork}
    <g fill="${theme.textColor}" font-family="${escape(family)}">
      ${app.id !== DEFAULT_APP_ID ? `<text x="72" y="104" font-size="28" font-weight="700">${escape(en.embed.brand)}</text>` : ''}
      ${textLines(heading.lines, headingY, heading.size, 700)}
      ${textLines(description.lines, descriptionY, description.size, 400)}
    </g>
  </svg>`
  return new Resvg(svg, { font }).render().asPng()
}

// ---------------------------------------------------------------------------
// Vite plugin
// ---------------------------------------------------------------------------

/** Caddy rules that serve `/embeds/<id>.html` for `/?app=<id>` while keeping the visible URL. */
function caddyRoutes(apps: AppConfig[]) {
  return apps
    .map(
      app =>
        `@embed_${app.id} {\n  path / /index.html\n  query app=${app.id}\n}\nrewrite @embed_${app.id} /embeds/${app.id}.html`,
    )
    .join('\n')
}

export function embedsPlugin(apps: AppConfig[], origin: string): Plugin {
  // Each image is rendered once and reused across requests and the build.
  const images = new Map<string, Promise<Buffer>>()
  const imageFor = (app: AppConfig) => {
    let image = images.get(app.id)
    if (!image) {
      image = embedImage(app)
      images.set(app.id, image)
    }
    return image
  }
  const appForUrl = (url: string) => lookupApp(apps, new URL(url, origin).searchParams.get('app')).app
  // Replaces a previous embed block, or the empty `<title>` in the source HTML.
  const replaceTags = (html: string, app: AppConfig) =>
    html.replace(/<!-- embed:start -->[\s\S]*?<!-- embed:end -->|<title><\/title>/, embedTags(app, origin))
  const isIndex = (path: string) => path === '/' || path === '/index.html'

  return {
    name: 'launcher-embeds',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return isIndex(context.path) ? replaceTags(html, appForUrl(context.originalUrl ?? '/')) : html
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const app = apps.find(app => req.url?.split('?')[0] === `/embeds/${app.id}.png`)
        if (!app) {
          next()
          return
        }
        imageFor(app).then(image => {
          res.setHeader('Content-Type', 'image/png')
          res.end(image)
        }, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? '/', origin)
        if (isIndex(url.pathname)) req.url = `/embeds/${appForUrl(req.url ?? '/').id}.html${url.search}`
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
          this.emitFile({
            type: 'asset',
            fileName: `embeds/${app.id}.html`,
            source: replaceTags(String(index.source), app),
          })
        }
        this.emitFile({ type: 'asset', fileName: 'embed-routes.caddy', source: caddyRoutes(apps) })
      },
    },
  }
}
