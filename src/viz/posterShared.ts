import { fromDayNumber } from '../data/stats'
import { formatMonthShort } from '../lib/format'
import { MINUTES, SLOT_OTHER, TAU, type RecordModel } from './record'

/*
 * Pieces shared by the Deep dive poster and the Race video: listening binned by calendar month,
 * and a few canvas text helpers.
 */

export interface Month {
  ring0: number
  ring1: number
  label: string
  /** Usual time of day (circular mean of when you listened), minutes after midnight; null for a silent month */
  minute: number | null
  /** Music minutes per top-10 slot */
  slots: number[]
  /** All listening, in minutes */
  total: number
  /** Year and month of its first day */
  year: number
  month: number
}

/** Calendar months (or quarters) as ring ranges, with their listening time and leaders */
export function monthly(model: RecordModel, by: 'month' | 'quarter' | 'year', yearLabels: boolean): Month[] {
  const out: Month[] = []
  const key = (ring: number) => {
    const d = fromDayNumber(model.firstDay + ring)
    if (by === 'year') return d.getFullYear()
    return by === 'quarter' ? d.getFullYear() * 4 + Math.floor(d.getMonth() / 3) : d.getFullYear() * 12 + d.getMonth()
  }
  for (let ring = 0; ring < model.days; ring++) {
    const k = key(ring)
    if (out.length === 0 || key(out[out.length - 1].ring0) !== k) {
      const d = fromDayNumber(model.firstDay + ring)
      out.push({
        ring0: ring,
        ring1: ring + 1,
        label: by === 'year' ? String(d.getFullYear()) : yearLabels ? `${formatMonthShort(d.getMonth())} ’${String(d.getFullYear()).slice(2)}` : formatMonthShort(d.getMonth()),
        minute: null,
        slots: Array(SLOT_OTHER).fill(0),
        total: 0,
        year: d.getFullYear(),
        month: d.getMonth(),
      })
    } else {
      out[out.length - 1].ring1 = ring + 1
    }
  }
  const index = new Int32Array(model.days)
  out.forEach((m, i) => index.fill(i, m.ring0, m.ring1))
  const sums = out.map(() => ({ x: 0, y: 0, w: 0 }))
  for (let k = 0; k < model.count; k++) {
    const i = index[model.ring[k]]
    const len = model.to[k] - model.from[k]
    const a = (((model.from[k] + model.to[k]) / 2) / MINUTES) * TAU
    sums[i].x += Math.cos(a) * len
    sums[i].y += Math.sin(a) * len
    sums[i].w += len
    out[i].total += len
    if (model.slot[k] < SLOT_OTHER) out[i].slots[model.slot[k]] += len
  }
  // Each month's time is averaged with its neighbours, so the line shows the drift rather than the noise
  out.forEach((m, i) => {
    let x = 0
    let y = 0
    for (let k = i - 1; k <= i + 1; k++) {
      if (!sums[k]) continue
      const w = k === i ? 2 : 1
      x += sums[k].x * w
      y += sums[k].y * w
    }
    if (sums[i].w > 30) m.minute = ((((Math.atan2(y, x) / TAU) * MINUTES) % MINUTES) + MINUTES) % MINUTES
  })
  return out
}

/** How finely to trace the clock drift: by month for a year, by quarter for a few years, by year beyond that */
export function driftScale(model: RecordModel, multiYear: boolean): 'month' | 'quarter' | 'year' {
  if (!multiYear) return 'month'
  return model.days > 6 * 365 ? 'year' : 'quarter'
}

/** "8 pm", "10:30 pm", to the nearest half hour */
export function clock(minute: number): string {
  const m = Math.round(minute / 30) * 30
  const h = Math.floor(m / 60) % 24
  const half = m % 60 === 30
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${half ? ':30' : ''} ${h < 12 ? 'am' : 'pm'}`
}

/** Strokes a smooth canvas curve through the points, via midpoints */
export function curveThrough(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last[0], last[1])
}

/** Wraps text to a width; returns the last baseline */
export function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineH: number): number {
  const words = text.split(' ')
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y)
      y += lineH
      line = word
    } else line = next
  }
  ctx.fillText(line, x, y)
  return y
}

export function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, u: number, f: string) {
  ctx.font = f
  const w = ctx.measureText(text).width + 2.4 * u
  const h = 4.4 * u
  ctx.fillStyle = 'rgba(11, 10, 15, 0.9)'
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = '#f4f1ea'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 0.15 * u)
}

export function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, max: number, f: (px: number) => string) {
  ctx.font = f(max)
  const w = ctx.measureText(text).width
  if (w > width) ctx.font = f((max * width) / w)
  ctx.fillText(text, x, y)
}

export function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}
