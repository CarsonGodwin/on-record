import { area, curveBasis, line } from 'd3-shape'
import type { GraphLink, GraphNode } from '../data/insights'
import { formatNumber } from '../lib/format'
import { mulberry32 } from '../lib/random'
import { starSize, type Layout } from './constellation'
import { DISPLAY, MONO, SERIF, TAU, drawRecord, fitText, quietestMinute, recordGuides, roundRect, type RecordModel } from './record'

/*
 * The shareable poster. Everything is measured in units of 1% of the width,
 * so the small preview and the full-size download are the same picture.
 */

export type PosterDesign = 'record' | 'constellation' | 'pulse'
export type PosterSize = 'post' | 'story' | 'print'
export type PosterPaper = 'midnight' | 'cream'

/** Print stays under iOS Safari's ~16.7 megapixel canvas limit */
export const POSTER_SIZES: Record<PosterSize, { label: string; ratio: string; width: number; height: number; note: string }> = {
  post: { label: 'Post', ratio: '4:5', width: 2160, height: 2700, note: 'Instagram feed' },
  story: { label: 'Story', ratio: '9:16', width: 2160, height: 3840, note: 'Stories and phone wallpapers' },
  print: { label: 'Print', ratio: '2:3', width: 3000, height: 4500, note: '10 × 15 in at 300 dpi' },
}

export interface PosterData {
  /** "2024" or "2023–2025" */
  period: string
  /** "every day of 2024" */
  subtitle: string
  record: RecordModel
  recordColors: string[]
  /** What the record's label says: "2024" or "ALL TIME" */
  recordTitle: string
  /** Top artists, with their chart colors */
  tracklist: { name: string; color: string; ms: number }[]
  graph: { nodes: GraphNode[]; links: GraphLink[]; layout: Layout }
  colors: Map<string, string>
  pulse: { artists: string[]; series: Map<string, number[]> }
  stats: { hours: number; streams: number; artists: number; peak: string }
  listener: string
}

interface Paper {
  bg: string
  ink: string
  muted: string
  rule: string
  glow: number
  grain: string
}

const PAPERS: Record<PosterPaper, Paper> = {
  midnight: { bg: '#0b0a0f', ink: '#f4f1ea', muted: 'rgba(244, 241, 234, 0.58)', rule: 'rgba(244, 241, 234, 0.2)', glow: 0.32, grain: '255,255,255' },
  cream: { bg: '#efe8da', ink: '#17141d', muted: 'rgba(23, 20, 29, 0.6)', rule: 'rgba(23, 20, 29, 0.22)', glow: 0.14, grain: '23,20,29' },
}

const CAPTIONS: Record<PosterDesign, string> = {
  record: 'One groove per day, from the label out. Midnight at the top, clockwise.',
  constellation: 'Stars are artists, sized by hours. Lines join artists played back to back.',
  pulse: 'One line per artist, in the order you found them, each scaled to its own peak.',
}

export interface PosterOptions {
  design: PosterDesign
  paper: PosterPaper
  title: string
}

export function renderPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: PosterData, o: PosterOptions) {
  const p = PAPERS[o.paper]
  const u = W / 100
  const pad = 6.5 * u
  const accent = data.tracklist[0]?.color ?? '#ff277c'
  const ratio = H / W
  // Taller formats have room for more of the tracklist
  const rows = ratio > 1.6 ? 4 : ratio > 1.4 ? 3 : 2
  const rowH = 4.3 * u

  // Paper and a couple of soft color glows from your top artists
  ctx.save()
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, W, H)
  const glows: [number, number, string][] = [
    [W * 0.05, H * 0.08, accent],
    [W * 0.95, H * 0.55, data.tracklist[1]?.color ?? '#0ca2bc'],
  ]
  for (const [x, y, color] of glows) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.95)
    g.addColorStop(0, withAlpha(color, p.glow))
    g.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Header
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = p.ink
  ctx.font = `600 ${1.7 * u}px ${MONO}`
  spacing(ctx, '0.22em')
  ctx.textAlign = 'left'
  ctx.fillText('A LISTENING RECORD', pad, pad + 1.7 * u)
  ctx.textAlign = 'right'
  ctx.fillText(data.period, W - pad, pad + 1.7 * u)
  spacing(ctx, '0px')
  ctx.fillStyle = p.rule
  ctx.fillRect(pad, pad + 3.1 * u, W - 2 * pad, Math.max(1, 0.12 * u))

  // Lay out the bottom block from the bottom up: caption, stats, tracklist, then title
  const captionY = H - pad
  const statsY = captionY - 3 * u
  const listBottom = statsY - 3.6 * u
  const listTop = listBottom - rows * rowH
  const listHeadY = listTop - 1.1 * u
  const subtitleY = listHeadY - 4.6 * u
  const titleMax = 11 * u
  ctx.textAlign = 'left'
  spacing(ctx, '-0.02em')
  const titleSize = measureFit(ctx, o.title, W - 2 * pad, titleMax, `800 {px}px ${DISPLAY}`)
  spacing(ctx, '0px')
  const titleY = subtitleY - 5.4 * u
  const artTop = pad + 6 * u
  const artBottom = titleY - titleSize * 0.8 - 4 * u
  const artH = artBottom - artTop
  const artW = W - 2 * pad

  if (o.design === 'record') {
    // The hour labels sit in the outer margin of the square, so it can run a little past the art box
    const s = Math.min(artW * 1.06, artH * 1.06)
    const x = (W - s) / 2
    const y = artTop + (artH - s) / 2
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 4 * u
    ctx.shadowOffsetY = 1.4 * u
    ctx.fillStyle = '#0b0a0f'
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, s * 0.455, 0, TAU)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(x, y)
    drawRecord(ctx, data.record, {
      size: s,
      colors: data.recordColors,
      focus: null,
      title: data.recordTitle,
      subtitle: `${formatNumber(data.stats.hours)} HRS  ·  ${formatNumber(data.stats.artists)} ARTISTS`,
      labelColor: accent,
      sheen: true,
      ink: p.muted,
      guides: recordGuides(data.record),
      guideMinute: quietestMinute(data.record),
    })
    ctx.restore()
    const r = s * 0.455
    sticker(ctx, x + s / 2 + r * 0.78, y + s / 2 - r * 0.86, 8 * u, data.listener, accent)
  } else if (o.design === 'constellation') {
    const R = Math.min(artW, artH) / 2 - 2.4 * u
    const cx = W / 2
    const cy = artTop + artH / 2
    starChart(ctx, data, cx, cy, R, u, p)
    sticker(ctx, cx + R * 0.8, cy - R * 0.84, 8 * u, data.listener, accent)
  } else {
    pulseArt(ctx, data, pad, artTop + 1.5 * u, artW, artH - 3 * u, u, p, accent, rows >= 3)
  }

  // Title and subtitle
  ctx.textAlign = 'left'
  ctx.fillStyle = p.ink
  spacing(ctx, '-0.02em')
  ctx.font = `800 ${titleSize}px ${DISPLAY}`
  ctx.fillText(o.title, pad - 0.3 * u, titleY)
  spacing(ctx, '0px')
  ctx.font = `italic ${4.6 * u}px ${SERIF}`
  ctx.fillStyle = o.paper === 'cream' ? darken(accent) : accent
  ctx.fillText(data.subtitle, pad, subtitleY)

  footer(ctx, data, { listHeadY, listTop, statsY, captionY }, rows, rowH, W, pad, u, p, o.design)
  grain(ctx, W, H, p)
  ctx.restore()
}

// ---------- Artwork ----------

function starChart(ctx: CanvasRenderingContext2D, data: PosterData, cx: number, cy: number, R: number, u: number, p: Paper) {
  const rand = mulberry32(11)

  // The sky: always night, even on cream paper, like a printed star map
  const sky = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R)
  sky.addColorStop(0, '#1d1847')
  sky.addColorStop(0.65, '#0f0c26')
  sky.addColorStop(1, '#07060c')
  ctx.fillStyle = sky
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, TAU)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, TAU)
  ctx.clip()
  // Celestial grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
  ctx.lineWidth = Math.max(1, 0.1 * u)
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.beginPath()
    ctx.arc(cx, cy, R * f, 0, TAU)
    ctx.stroke()
  }
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * TAU
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R)
    ctx.stroke()
  }
  // Background stars
  for (let i = 0; i < 700; i++) {
    const r = Math.sqrt(rand()) * R
    const a = rand() * TAU
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + rand() * 0.6})`
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, (0.04 + rand() * 0.13) * u, 0, TAU)
    ctx.fill()
  }
  ctx.restore()

  // Rim: two rings with degree ticks, in the paper's ink
  ctx.strokeStyle = p.ink
  ctx.lineWidth = Math.max(1, 0.14 * u)
  for (const r of [R + 0.5 * u, R + 2.2 * u]) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.stroke()
  }
  for (let d = 0; d < 360; d += 3) {
    const a = (d / 360) * TAU
    const r1 = R + (d % 15 === 0 ? 2.2 : 1.2) * u
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (R + 0.5 * u), cy + Math.sin(a) * (R + 0.5 * u))
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    ctx.stroke()
  }

  // Fit the layout inside the circle
  const { nodes, links, layout } = data.graph
  if (nodes.length === 0) return
  const maxMs = Math.max(...nodes.map((n) => n.ms), 1)
  const maxCount = Math.max(...links.map((l) => l.count), 1)
  const pts = nodes.map((n) => layout.get(n.id)!)
  const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length
  const my = pts.reduce((s, q) => s + q.y, 0) / pts.length
  const reach = Math.max(...pts.map((q) => Math.hypot(q.x - mx, q.y - my)), 1)
  const k = (R * 0.8) / reach
  const pos = (id: string) => {
    const q = layout.get(id)!
    return { x: cx + (q.x - mx) * k, y: cy + (q.y - my) * k }
  }
  const starR = (ms: number) => (starSize(ms, maxMs) / 18.5) * 1.7 * u

  ctx.lineCap = 'round'
  for (const l of links) {
    const a = pos(l.source)
    const b = pos(l.target)
    const w = l.count / maxCount
    ctx.strokeStyle = `rgba(244, 241, 234, ${0.14 + w * 0.5})`
    ctx.lineWidth = (0.1 + w * 0.32) * u
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  for (const n of nodes) {
    const q = pos(n.id)
    const r = starR(n.ms)
    const color = data.colors.get(n.id) ?? '#d9d4ff'
    const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 3.4)
    glow.addColorStop(0, withAlpha(color, 0.55))
    glow.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(q.x, q.y, r * 3.4, 0, TAU)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(q.x, q.y, r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.beginPath()
    ctx.arc(q.x, q.y, r * 0.38, 0, TAU)
    ctx.fill()
  }

  // Name the brightest stars, skipping any label that would collide
  ctx.font = `600 ${1.3 * u}px ${MONO}`
  spacing(ctx, '0.12em')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const stars = nodes.map((n) => ({ x: pos(n.id).x, y: pos(n.id).y, r: starR(n.ms) }))
  for (const n of nodes.slice(0, 16)) {
    const q = pos(n.id)
    const r = starR(n.ms)
    const text = n.id.toUpperCase()
    const w = ctx.measureText(text).width
    const box = { x0: q.x - w / 2 - 0.4 * u, x1: q.x + w / 2 + 0.4 * u, y0: q.y + r + 0.8 * u, y1: q.y + r + 2.6 * u }
    const inside = Math.hypot(q.x - cx, box.y1 - cy) < R - u && box.x0 > cx - R && box.x1 < cx + R
    const clash =
      placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) ||
      stars.some((s) => s.x > box.x0 && s.x < box.x1 && s.y + s.r > box.y0 && s.y - s.r < box.y1)
    if (!inside || clash) continue
    placed.push(box)
    ctx.fillStyle = 'rgba(244, 241, 234, 0.88)'
    ctx.fillText(text, q.x, box.y0 + 0.2 * u)
  }
  spacing(ctx, '0px')
  ctx.textBaseline = 'alphabetic'
}

function pulseArt(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  x0: number,
  y0: number,
  w: number,
  h: number,
  u: number,
  p: Paper,
  accent: string,
  tall: boolean,
) {
  const artists = data.pulse.artists.slice(0, tall ? 24 : 18)
  if (artists.length === 0) return
  const lift = 3.4
  const step = h / (artists.length - 1 + lift)
  const amp = step * lift
  const top = data.tracklist[0]?.name

  // Ridges are drawn on a black plate (the album cover), so their fills hide what's behind them cleanly
  const plate = '#0b0a0f'
  ctx.fillStyle = plate
  roundRect(ctx, x0 - 2.5 * u, y0 - 2.5 * u, w + 5 * u, h + 5 * u, 0.8 * u)
  ctx.fill()
  if (p.bg === plate) {
    ctx.strokeStyle = p.rule
    ctx.lineWidth = Math.max(1, 0.1 * u)
    ctx.stroke()
  }
  const ink = '#f4f1ea'

  artists.forEach((artist, row) => {
    const values = data.pulse.series.get(artist) ?? []
    const peak = Math.max(...values, 1)
    const base = y0 + amp + row * step
    const n = values.length
    const pts = values.map((v, i) => [x0 + (n > 1 ? (i / (n - 1)) * w : w / 2), base - (v / peak) * amp] as [number, number])

    ctx.beginPath()
    area<[number, number]>()
      .x((d) => d[0])
      .y0(base)
      .y1((d) => d[1])
      .curve(curveBasis)
      .context(ctx)(pts)
    ctx.fillStyle = plate
    ctx.fill()

    ctx.beginPath()
    line<[number, number]>().curve(curveBasis).context(ctx)(pts)
    const isTop = artist === top
    ctx.strokeStyle = isTop ? accent : ink
    ctx.lineWidth = (isTop ? 0.4 : 0.26) * u
    ctx.lineJoin = 'round'
    ctx.stroke()
  })
}

/** A round "listener type" sticker, slapped on at an angle like a price tag on a sleeve */
function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, listener: string, color: string) {
  const words = listener.replace(/^the\s+/i, '').toUpperCase().split(/\s+/)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.2)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = r * 0.25
  ctx.shadowOffsetY = r * 0.06
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(11, 10, 15, 0.35)'
  ctx.lineWidth = r * 0.025
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.86, 0, TAU)
  ctx.stroke()

  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${r * 0.12}px ${MONO}`
  spacing(ctx, '0.18em')
  ctx.fillText('LISTENER TYPE', 0, -r * 0.5)
  spacing(ctx, '0px')
  ctx.font = `italic ${r * 0.26}px ${SERIF}`
  ctx.fillText('the', 0, -r * 0.27)
  const lineH = r * 0.3
  const startY = -((words.length - 1) * lineH) / 2 + r * 0.1
  words.forEach((word, i) => {
    fitText(ctx, word, 0, startY + i * lineH, r * 1.45, r * 0.3, `800 {px}px ${DISPLAY}`)
  })
  ctx.restore()
}

// ---------- Footer ----------

function footer(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  at: { listHeadY: number; listTop: number; statsY: number; captionY: number },
  rows: number,
  rowH: number,
  W: number,
  pad: number,
  u: number,
  p: Paper,
  design: PosterDesign,
) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = p.muted
  ctx.font = `600 ${1.45 * u}px ${MONO}`
  spacing(ctx, '0.22em')
  ctx.fillText('TRACKLIST · TOP ARTISTS', pad, at.listHeadY - 0.9 * u)
  ctx.textAlign = 'right'
  ctx.fillText('HOURS', W - pad, at.listHeadY - 0.9 * u)
  spacing(ctx, '0px')
  ctx.fillStyle = p.rule
  ctx.fillRect(pad, at.listHeadY, W - 2 * pad, Math.max(1, 0.12 * u))

  const gap = 5 * u
  const colW = (W - 2 * pad - gap) / 2
  data.tracklist.slice(0, rows * 2).forEach((item, i) => {
    const col = Math.floor(i / rows)
    const row = i % rows
    const x = pad + col * (colW + gap)
    const baseline = at.listTop + row * rowH + rowH * 0.68

    ctx.textAlign = 'left'
    ctx.fillStyle = p.muted
    ctx.font = `500 ${1.55 * u}px ${MONO}`
    ctx.fillText(`${col === 0 ? 'A' : 'B'}${row + 1}`, x, baseline)

    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(x + 5 * u, baseline - 0.72 * u, 0.75 * u, 0, TAU)
    ctx.fill()

    ctx.textAlign = 'right'
    ctx.fillStyle = p.muted
    ctx.font = `500 ${1.65 * u}px ${MONO}`
    const hours = formatNumber(item.ms / 3_600_000)
    ctx.fillText(hours, x + colW, baseline)
    const hoursW = ctx.measureText(hours).width

    ctx.textAlign = 'left'
    ctx.fillStyle = p.ink
    ctx.font = `650 ${2.4 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, item.name, colW - 6.8 * u - hoursW - 2 * u), x + 6.8 * u, baseline)

    ctx.fillStyle = p.rule
    ctx.fillRect(x, at.listTop + (row + 1) * rowH - 0.2 * u, colW, Math.max(1, 0.08 * u))
  })

  ctx.textAlign = 'left'
  ctx.fillStyle = p.ink
  spacing(ctx, '0.12em')
  const stats = `${formatNumber(data.stats.hours)} HOURS  ·  ${formatNumber(data.stats.streams)} STREAMS  ·  ${formatNumber(data.stats.artists)} ARTISTS  ·  PEAK ${data.stats.peak.toUpperCase()}`
  measureFit(ctx, stats, W - 2 * pad, 1.7 * u, `600 {px}px ${MONO}`)
  ctx.fillText(stats, pad, at.statsY)
  spacing(ctx, '0px')

  ctx.fillStyle = p.muted
  ctx.font = `400 ${1.3 * u}px ${MONO}`
  ctx.fillText(CAPTIONS[design], pad, at.captionY)
  ctx.textAlign = 'right'
  ctx.font = `700 ${1.3 * u}px ${MONO}`
  spacing(ctx, '0.2em')
  ctx.fillText('ON RECORD ●', W - pad, at.captionY)
  spacing(ctx, '0px')
}

// ---------- Texture and helpers ----------

let noiseTile: HTMLCanvasElement | null = null

/** Fine film grain, so the image feels printed rather than rendered */
function grain(ctx: CanvasRenderingContext2D, W: number, H: number, p: Paper) {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas')
    noiseTile.width = 220
    noiseTile.height = 220
    const nctx = noiseTile.getContext('2d')!
    const img = nctx.createImageData(220, 220)
    const rand = mulberry32(5)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand()
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = v > 0.5 ? Math.round((v - 0.5) * 70) : 0
    }
    nctx.putImageData(img, 0, 0)
  }
  // Tint the white tile to the paper's grain color
  const tinted = document.createElement('canvas')
  tinted.width = noiseTile.width
  tinted.height = noiseTile.height
  const tctx = tinted.getContext('2d')!
  tctx.drawImage(noiseTile, 0, 0)
  tctx.globalCompositeOperation = 'source-in'
  tctx.fillStyle = `rgb(${p.grain})`
  tctx.fillRect(0, 0, tinted.width, tinted.height)

  const pattern = ctx.createPattern(tinted, 'repeat')
  if (!pattern) return
  pattern.setTransform(new DOMMatrix().scale(Math.max(1, W / 1400)))
  ctx.globalAlpha = 0.5
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1
}

/** Sets a font at the largest size up to `max` whose text fits `width`; returns that size */
function measureFit(ctx: CanvasRenderingContext2D, text: string, width: number, max: number, font: string): number {
  ctx.font = font.replace('{px}', String(max))
  const measured = ctx.measureText(text).width
  if (measured <= width) return max
  const px = (max * width) / measured
  ctx.font = font.replace('{px}', String(px))
  return px
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Canvas letter-spacing, where the browser supports it */
function spacing(ctx: CanvasRenderingContext2D, value: string) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = value
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** A darker take on a chart color, for legible type on cream */
function darken(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.72))
  return `rgb(${r}, ${g}, ${b})`
}
