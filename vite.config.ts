import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer, defineConfig, type Plugin } from 'vite'

/**
 * Locks the built page down so the "nothing is uploaded" promise is enforced by
 * the browser: no network requests at all, and only scripts, styles and fonts
 * from the site itself. Images allow data: (the paper grain) and blob: (poster
 * downloads), and media allows blob: (the race video's preview). Build-only, since the dev server needs inline scripts and a socket
 * for hot reload.
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
 * Renders the landing page into index.html at build time, so search engines and
 * link unfurlers that don't run JavaScript still see the headline, copy and how-to.
 * The client replaces it on load (createRoot, not hydrate: the drop zone's wording
 * depends on the pointer type, which the build can't know).
 */
function prerenderLanding(): Plugin {
  return {
    name: 'prerender-landing',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        const server = await createServer({
          configFile: false,
          plugins: [react()],
          logLevel: 'error',
          appType: 'custom',
          server: { middlewareMode: true, hmr: false, ws: false },
        })
        try {
          const { default: App } = await server.ssrLoadModule('/src/App.tsx')
          const markup = renderToString(createElement(App))
          return html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
        } finally {
          await server.close()
        }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), prerenderLanding()],
})
