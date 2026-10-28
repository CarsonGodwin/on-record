import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { resolve } from 'node:path'
import { createServer, defineConfig, type Plugin, type ViteDevServer } from 'vite'

/**
 * Locks the built page down so the "nothing is uploaded" promise is enforced by
 * the browser: no network requests at all, and only scripts, styles and fonts
 * from the site itself. Images allow blob: for the poster a touch screen shows to be
 * pressed and held, and for the cover SVGs the race export draws into its video; media
 * allows blob: for that video's preview. Fonts allow data: because Vite inlines the
 * smallest font subsets into the CSS, and images allow it too for any small image it might
 * inline the same way (none is imported today). Build-only, since the dev server needs
 * inline scripts and a socket for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Response headers for Cloudflare Pages / Workers static assets, emitted as dist/_headers.
 * The CSP is the same one as the meta tag, plus the directives a meta tag can't carry
 * (frame-ancestors). On hosts that ignore _headers, the meta tag still applies.
 */
const HEADERS = `/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS })
    },
  }
}

/**
 * Every page of the site, and the component rendered into it at build time: the module and
 * its export. The guides and the 404 page are only this markup (they have no script); the
 * landing page's client replaces its copy on load.
 */
const PAGES: Record<string, [module: string, component: string]> = {
  'index.html': ['/src/App.tsx', 'default'],
  'guides/spotify-extended-streaming-history/index.html': ['/src/components/Guide.tsx', 'SpotifyGuide'],
  'guides/apple-music-listening-history/index.html': ['/src/components/Guide.tsx', 'AppleGuide'],
  '404.html': ['/src/components/Guide.tsx', 'NotFound'],
}

/**
 * Renders each page's markup into its HTML, so search engines and link unfurlers that
 * don't run JavaScript still see the headline, copy and how-to. The landing page's client
 * replaces it on load (createRoot, not hydrate: the drop zone's wording depends on the
 * pointer type, which the build can't know).
 *
 * The dev server renders the scriptless pages too, so the guides can be worked on there,
 * but leaves the landing page to the client: its styles arrive with its script, so
 * prerendered markup would show unstyled first.
 */
function prerender(): Plugin {
  let dev: ViteDevServer | undefined
  return {
    name: 'prerender',
    configureServer(server) {
      dev = server
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        const page = PAGES[ctx.path.slice(1)]
        if (!page || (dev && ctx.path === '/index.html')) return html
        const server =
          dev ??
          (await createServer({
            configFile: false,
            plugins: [react()],
            logLevel: 'error',
            appType: 'custom',
            server: { middlewareMode: true, hmr: false, ws: false },
          }))
        try {
          const module = await server.ssrLoadModule(page[0])
          const markup = renderToString(createElement(module[page[1]]))
          html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
          // The 404 page is served at whatever address was missing, however deep, where
          // relative asset paths would point at folders that don't exist
          return ctx.path === '/404.html' ? html.replace(/(href|src)="\.\//g, '$1="/') : html
        } finally {
          if (!dev) await server.close()
        }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), prerender()],
  build: {
    rolldownOptions: {
      input: Object.keys(PAGES).map((page) => resolve(import.meta.dirname, page)),
    },
  },
})
