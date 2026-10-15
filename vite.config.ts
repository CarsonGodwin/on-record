import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Locks the built page down so the "nothing is uploaded" promise is enforced by
 * the browser: no network requests at all, and only scripts, styles and fonts
 * from the site itself. Images allow data: (the paper grain) and blob: (poster
 * downloads). Build-only, since the dev server needs inline scripts and a socket
 * for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
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

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
})
