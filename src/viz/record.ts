import { dayNumber, fromDayNumber, startDate } from '../data/stats'
import { formatHour, formatMonthShort } from '../lib/format'
import { TOP_ARTISTS } from '../lib/palette'
import type { Play } from '../types'

/*
 * The vinyl record, shared by the on-screen chart and the poster. Each groove
 * is one day (the first day at the label, the last at the rim) and each arc
 * is something playing, placed by time of day: midnight at the top, clockwise.
 */

export const MINUTES = 1440
export const TAU = Math.PI * 2
export const GROOVE = 'rgba(244, 241, 234, 0.3)'
export const PODCAST = '#8d86a0'
export const SLOT_OTHER = TOP_ARTISTS
export const SLOT_PODCAST = TOP_ARTISTS + 1
/** Draw order: the background first, the top artist last so it sits on top */
export const DRAW_ORDER = [SLOT_OTHER, SLOT_PODCAST, ...Array.from({ length: TOP_ARTISTS }, (_, i) => TOP_ARTISTS - 1 - i)]

export const DISPLAY = '"Bricolage Grotesque Variable", system-ui, sans-serif'
export const MONO = '"JetBrains Mono Variable", ui-monospace, monospace'
export const SERIF = '"Instrument Serif", Georgia, serif'

/** Above this many plays the glow is left off by default: blurring a path that size can exhaust a phone's GPU and lose the canvas */
export const GLOW_MAX = 60_000
/** Arcs per stroke. Phones' GPU canvases can give up on one path with hundreds of thousands of arcs, so it's drawn in pieces */
export const ARCS_PER_STROKE = 4_000
/** How see-through the slots out of focus are */
export const DIMMED = 0.08

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

let scratch: Context2D | null = null

/** A cleared canvas the size of the one `ctx` draws on, kept between draws. Null where there's none to be had */
function scratchLayer(ctx: CanvasRenderingContext2D): Context2D | null {
  scratch ??=
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1).getContext('2d')
      : typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null
  if (!scratch) return null
  const { width, height } = ctx.canvas
  if (scratch.canvas.width !== width || scratch.canvas.height !== height) {
    // Resizing clears it
    scratch.canvas.width = width
    scratch.canvas.height = height
  } else {
    scratch.setTransform(1, 0, 0, 1, 0, 0)
    scratch.clearRect(0, 0, width, height)
  }
  return scratch
}

/** Whether a slot has more than `n` arcs */
function slotOver(model: RecordModel, slot: number, n: number): boolean {
  let count = 0
  for (let k = 0; k < model.count; k++) if (model.slot[k] === slot && ++count > n) return true
  return false
}

/** Every play split at midnight into per-day arcs, in flat arrays so 100k+ plays stay quick */
export interface RecordModel {
  firstDay: number
  days: number
  count: number
  ring: Int32Array
  /** Minutes after midnight */
  from: Float32Array
  to: Float32Array
  slot: Uint8Array
  play: Int32Array
  /** Listening per day, in minutes */
  dayMinutes: Float64Array
}

export function buildRecord(plays: Play[], legend: string[], year: number | null): RecordModel {
  const firstDay = dayNumber(year === null ? startDate(plays[0]) : new Date(year, 0, 1))
  const lastDay = dayNumber(year === null ? new Date(plays[plays.length - 1].endTime) : new Date(year, 11, 31))
  const days = lastDay - firstDay + 1
  const slotOf = new Map(legend.map((a, i) => [a, i]))
  const cap = plays.length * 2
  const m: RecordModel = {
    firstDay,
    days,
    count: 0,
    ring: new Int32Array(cap),
    from: new Float32Array(cap),
    to: new Float32Array(cap),
    slot: new Uint8Array(cap),
    play: new Int32Array(cap),
    dayMinutes: new Float64Array(days),
  }

  plays.forEach((p, i) => {
    const slot = p.kind === 'track' ? (slotOf.get(p.artist) ?? SLOT_OTHER) : SLOT_PODCAST
    let t = p.endTime - p.msPlayed
    // At most two pieces: nothing plays for more than a day
    for (let piece = 0; piece < 2 && t < p.endTime && m.count < cap; piece++) {
      const d = new Date(t)
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
      const end = Math.min(p.endTime, midnight)
      const ring = dayNumber(d) - firstDay
      if (ring >= 0 && ring < days) {
        const from = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
        const to = Math.min(MINUTES, from + (end - t) / 60_000)
        m.ring[m.count] = ring
        m.from[m.count] = from
        m.to[m.count] = to
        m.slot[m.count] = slot
        m.play[m.count] = i
        m.dayMinutes[ring] += to - from
        m.count++
      }
      t = end
    }
  })
  return m
}

/** Shared geometry, as fractions of the drawing size */
export function recordGeometry(size: number, days: number) {
  const disc = size * 0.432 // leaves room for the 6am / 6pm labels inside the canvas edge
  const inner = disc * 0.36
  const outer = disc * 0.965
  return { center: size / 2, disc, inner, outer, ring: (outer - inner) / days, label: inner * 0.9 }
}

export interface Guide {
  ring: number
  label: string
}

/** Rings to mark: month starts for a year or so of history, year starts for longer */
export function recordGuides(model: RecordModel): Guide[] {
  const guides: Guide[] = []
  const byYear = model.days > 450
  for (let ring = 1; ring < model.days; ring++) {
    const d = fromDayNumber(model.firstDay + ring)
    if (d.getDate() !== 1) continue
    if (byYear && d.getMonth() === 0) guides.push({ ring, label: String(d.getFullYear()) })
    if (!byYear) guides.push({ ring, label: formatMonthShort(d.getMonth()) })
  }
  return guides
}

/** The middle of your quietest two hours: guide labels go there so they cover the least data */
export function quietestMinute(model: RecordModel): number {
  const bins = new Float64Array(48)
  for (let k = 0; k < model.count; k++) {
    for (let b = Math.floor(model.from[k] / 30); b <= Math.min(47, Math.floor(model.to[k] / 30)); b++) bins[b]++
  }
  let best = 0
  let bestSum = Infinity
  for (let b = 0; b < 48; b++) {
    const sum = bins[b] + bins[(b + 1) % 48] + bins[(b + 2) % 48] + bins[(b + 3) % 48]
    if (sum < bestSum) {
      bestSum = sum
      best = b
    }
  }
  return ((best + 2) % 48) * 30
}

export interface DrawOptions {
  size: number
  colors: string[]
  focus: number | null
  title: string
  subtitle: string
  labelColor: string
  /** Bake the light reflection into the image (the poster); on screen it's a separate layer */
  sheen: boolean
  /** Color for the hour marks outside the disc, which sit on the page */
  ink: string
  guides: Guide[]
  /** Where to put the guide labels, in minutes after midnight */
  guideMinute: number
  /** Leave the guide tags off, for a caller that draws over the record and then adds them with `drawGuideLabels` */
  noGuideLabels?: boolean
  /** Lines drawn over the record that the guide tags should step off: a groove, half the line's width, and the stretch of the day it covers (all of it when left out) */
  guideAvoid?: { ring: number; halfWidth: number; from?: number; to?: number }[]
  /** Boxes drawn over the record afterwards, which no guide tag should sit under */
  guideBlocked?: { x0: number; y0: number; x1: number; y1: number }[]
  /** On-screen magnification already applied to the context: hairlines and small text are divided by it so they stay screen-sized */
  zoom?: number
  /** The part of the drawing that's on screen, in drawing coordinates: grooves outside it are skipped, which keeps deep zooms quick */
  visible?: { x0: number; y0: number; x1: number; y1: number }
  /** Let the top artists glow. Defaults to on for records of up to GLOW_MAX plays */
  glow?: boolean
}

export interface Visible {
  rMin: number
  rMax: number
  /** On-screen times of day, in minutes; `to` can run past midnight */
  from: number
  to: number
}

/** The radii and times of day that reach the visible rectangle, padded by `pad` for line widths and glow */
export function visibleWindow(c: number, v: DrawOptions['visible'], pad: number): Visible {
  const all = { rMin: 0, rMax: Infinity, from: 0, to: MINUTES }
  if (!v) return all
  const x0 = v.x0 - pad - c
  const y0 = v.y0 - pad - c
  const x1 = v.x1 + pad - c
  const y1 = v.y1 + pad - c
  const nx = Math.max(x0, 0, -x1)
  const ny = Math.max(y0, 0, -y1)
  const rMin = Math.hypot(nx, ny)
  const rMax = Math.hypot(Math.max(-x0, x1), Math.max(-y0, y1))
  // With the center on screen every time of day is too
  if (rMin === 0) return { ...all, rMax }
  // Otherwise the rectangle covers less than half a turn: measure its corners from its middle
  const toMinutes = (x: number, y: number) => ((Math.atan2(y, x) + Math.PI / 2) / TAU) * MINUTES
  const mid = toMinutes((x0 + x1) / 2, (y0 + y1) / 2)
  let lo = 0
  let hi = 0
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const d = ((((toMinutes(x, y) - mid) % MINUTES) + MINUTES * 1.5) % MINUTES) - MINUTES / 2
    lo = Math.min(lo, d)
    hi = Math.max(hi, d)
  }
  const from = (((mid + lo) % MINUTES) + MINUTES) % MINUTES
  return { rMin, rMax, from, to: from + hi - lo }
}

/** Draws the record into a size × size square at the current origin. Doesn't clear first. */
export function drawRecord(ctx: CanvasRenderingContext2D, model: RecordModel, o: DrawOptions) {
  const g = recordGeometry(o.size, model.days)
  const c = g.center
  const z = o.zoom ?? 1
  const hair = Math.max(1, o.size / 1400) / z
  const view = visibleWindow(c, o.visible, (o.size * 0.02) / z)
  const onScreen = (r: number) => r >= view.rMin && r <= view.rMax

  // The disc
  const body = ctx.createRadialGradient(c, c, 0, c, c, g.disc)
  body.addColorStop(0, '#1d1b24')
  body.addColorStop(0.7, '#100f15')
  body.addColorStop(1, '#060508')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(c, c, g.disc, 0, TAU)
  ctx.fill()

  // Fine grooves for texture
  ctx.lineWidth = hair
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
  for (let r = g.inner; r < g.disc; r += o.size * 0.0055) {
    if (!onScreen(r)) continue
    ctx.beginPath()
    ctx.arc(c, c, r, 0, TAU)
    ctx.stroke()
  }

  // Month or year boundaries
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
  for (const guide of o.guides) {
    if (!onScreen(g.inner + guide.ring * g.ring)) continue
    ctx.beginPath()
    ctx.arc(c, c, g.inner + guide.ring * g.ring, 0, TAU)
    ctx.stroke()
  }

  // The data, one stroke per color
  ctx.lineCap = 'butt'
  const lineWidth = Math.max(g.ring * 0.95, o.size / 1100 / z)
  ctx.lineWidth = lineWidth
  const glow = o.glow ?? model.count <= GLOW_MAX
  /** Strokes a slot's arcs onto `target`, `perStroke` of them at a time */
  const strokeSlot = (target: Context2D, slot: number, perStroke: number) => {
    target.beginPath()
    let arcs = 0
    for (let k = 0; k < model.count; k++) {
      if (model.slot[k] !== slot) continue
      const r = g.inner + (model.ring[k] + 0.5) * g.ring
      if (!onScreen(r)) continue
      const from = model.from[k]
      const to = model.to[k]
      // Off to the side of the screen, unless the window wraps past midnight onto it
      if (!((from < view.to && to > view.from) || from < view.to - MINUTES)) continue
      const a0 = (model.from[k] / MINUTES) * TAU - Math.PI / 2
      const a1 = Math.max((model.to[k] / MINUTES) * TAU - Math.PI / 2, a0 + 0.002)
      target.moveTo(c + r * Math.cos(a0), c + r * Math.sin(a0))
      target.arc(c, c, r, a0, a1)
      if (++arcs === perStroke) {
        target.stroke()
        target.beginPath()
        arcs = 0
      }
    }
    target.stroke()
  }
  for (const slot of DRAW_ORDER) {
    const dimmed = o.focus !== null && o.focus !== slot
    // Top artists glow a little, like ink under blacklight
    const glows = glow && slot < SLOT_OTHER
    // Separate see-through strokes would double up where they overlap, showing as seams. So a big
    // see-through slot is drawn solid, in pieces, on a scratch layer, then laid down see-through in one go
    const layer = dimmed && !glows && slotOver(model, slot, ARCS_PER_STROKE) ? scratchLayer(ctx) : null
    if (layer) {
      layer.setTransform(ctx.getTransform())
      layer.lineCap = 'butt'
      layer.lineWidth = lineWidth
      layer.strokeStyle = o.colors[slot]
      strokeSlot(layer, slot, ARCS_PER_STROKE)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = DIMMED
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.drawImage(layer.canvas, 0, 0)
      ctx.restore()
      continue
    }
    ctx.globalAlpha = dimmed ? DIMMED : 1
    ctx.strokeStyle = o.colors[slot]
    ctx.shadowColor = glows ? o.colors[slot] : 'transparent'
    ctx.shadowBlur = glows ? o.size * 0.007 : 0
    // A glow's pieces would seam the same way, so a glowing slot stays whole, as does a small see-through one
    strokeSlot(ctx, slot, glows || dimmed ? Infinity : ARCS_PER_STROKE)
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  if (o.sheen) {
    ctx.fillStyle = sheenGradient(ctx, c)
    ctx.beginPath()
    ctx.arc(c, c, g.disc, 0, TAU)
    ctx.fill()
  }

  // Rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = Math.max(1, o.size / 700) / z
  ctx.beginPath()
  ctx.arc(c, c, g.disc, 0, TAU)
  ctx.stroke()

  if (!o.noGuideLabels) drawGuideLabels(ctx, model.days, o)

  // Label
  const lr = g.label
  const label = ctx.createRadialGradient(c - lr * 0.4, c - lr * 0.5, lr * 0.1, c, c, lr)
  label.addColorStop(0, mix(o.labelColor, '#ffffff', 0.35))
  label.addColorStop(1, o.labelColor)
  ctx.fillStyle = label
  ctx.beginPath()
  ctx.arc(c, c, lr, 0, TAU)
  ctx.fill()

  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${lr * 0.1}px ${MONO}`
  ctx.fillText('SIDE A  ·  33⅓ RPM', c, c - lr * 0.66)
  fitText(ctx, o.title, c, c - lr * 0.3, lr * 1.45, lr * 0.44, `800 {px}px ${DISPLAY}`)
  ctx.font = `500 ${lr * 0.11}px ${MONO}`
  ctx.fillText(o.subtitle, c, c + lr * 0.36)
  ctx.font = `italic ${lr * 0.17}px ${SERIF}`
  ctx.fillText('on record', c, c + lr * 0.6)
  ctx.beginPath()
  ctx.arc(c, c, lr * 0.065, 0, TAU)
  ctx.fill()

  // Hour marks around the outside
  ctx.fillStyle = o.ink
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * TAU - Math.PI / 2
    const r = g.disc + o.size * 0.014
    ctx.beginPath()
    ctx.arc(c + r * Math.cos(a), c + r * Math.sin(a), o.size * (h % 6 === 0 ? 0.004 : 0.0022), 0, TAU)
    ctx.fill()
  }
  ctx.font = `500 ${(o.size * 0.018) / Math.sqrt(z)}px ${MONO}`
  for (const h of [0, 6, 12, 18]) {
    const a = (h / 24) * TAU - Math.PI / 2
    const r = g.disc + o.size * 0.034
    ctx.fillText(formatHour(h).replace(' ', '').toLowerCase(), c + r * Math.cos(a), c + r * Math.sin(a))
  }
}

/** Little tags on the guide rings, thinned out when they'd crowd each other */
export function drawGuideLabels(ctx: CanvasRenderingContext2D, days: number, o: DrawOptions) {
  if (o.guides.length === 0) return
  const g = recordGeometry(o.size, days)
  const font = Math.max(9, o.size * 0.017) / (o.zoom ?? 1)
  const a = (o.guideMinute / MINUTES) * TAU - Math.PI / 2
  ctx.font = `600 ${font}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Each tag's box has to clear the center label, the rim, every tag already placed and any highlighted lines
  const gap = font * 0.3
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
  const minute = ((o.guideMinute % MINUTES) + MINUTES) % MINUTES
  const lines = (o.guideAvoid ?? []).filter((l) => l.from === undefined || l.to === undefined || (minute >= l.from - 30 && minute <= l.to + 30))
  for (const guide of o.guides) {
    const hw = (ctx.measureText(guide.label).width + font * 0.8) / 2
    const hh = font * 0.7
    // A tag sitting on a highlighted line slides along the radius until it's just clear of it
    const reach = hw * Math.abs(Math.cos(a)) + hh * Math.abs(Math.sin(a))
    let r = g.inner + guide.ring * g.ring
    for (let pass = 0; pass < 2; pass++) {
      for (const l of lines) {
        const lr = g.inner + (l.ring + 0.5) * g.ring
        const clear = reach + l.halfWidth + gap
        if (Math.abs(r - lr) < clear) r = lr + (r >= lr ? clear : -clear)
      }
    }
    const cx = g.center + r * Math.cos(a)
    const cy = g.center + r * Math.sin(a)
    const box = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
    // Nearest and farthest points of the box from the center of the record
    const nx = Math.max(box.x0 - g.center, 0, g.center - box.x1)
    const ny = Math.max(box.y0 - g.center, 0, g.center - box.y1)
    const fx = Math.max(Math.abs(box.x0 - g.center), Math.abs(box.x1 - g.center))
    const fy = Math.max(Math.abs(box.y0 - g.center), Math.abs(box.y1 - g.center))
    if (Math.hypot(nx, ny) < g.label + gap || Math.hypot(fx, fy) > g.disc - gap) continue
    const blocked = [...placed, ...(o.guideBlocked ?? [])]
    if (blocked.some((b) => box.x0 < b.x1 + gap && box.x1 > b.x0 - gap && box.y0 < b.y1 + gap && box.y1 > b.y0 - gap)) continue
    placed.push(box)
    ctx.fillStyle = 'rgba(11, 10, 15, 0.85)'
    roundRect(ctx, box.x0, box.y0, hw * 2, hh * 2, hh)
    ctx.fill()
    ctx.fillStyle = 'rgba(244, 241, 234, 0.85)'
    ctx.fillText(guide.label, cx, cy + font * 0.05)
  }
}

export function sheenGradient(ctx: CanvasRenderingContext2D, c: number): CanvasGradient | string {
  if (typeof ctx.createConicGradient !== 'function') return 'transparent'
  const g = ctx.createConicGradient(-Math.PI / 3, c, c)
  const stops: [number, number][] = [[0, 0], [0.08, 0.1], [0.18, 0], [0.5, 0], [0.58, 0.1], [0.68, 0], [1, 0]]
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255, 255, 255, ${alpha})`)
  return g
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draws text at the largest size up to `max` that fits in `width`. `font` has a {px} placeholder. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, max: number, font: string): number {
  let px = max
  ctx.font = font.replace('{px}', String(px))
  const measured = ctx.measureText(text).width
  if (measured > width) {
    px = (max * width) / measured
    ctx.font = font.replace('{px}', String(px))
  }
  ctx.fillText(text, x, y)
  return px
}

/** Mixes two #rrggbb colors */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`
}
