import { fromDayNumber } from '../data/stats'
import { formatMonthShort } from '../lib/format'
import type { PosterData } from './poster'
import { DISPLAY, MINUTES, SLOT_OTHER, TAU, drawRecord, quietestMinute, recordGeometry, type RecordModel } from './record'

/*
 * The Story poster (9:16), made to be read on a phone. One typeface, flat paper, nothing smaller
 * than ~3% of the width, and the content kept clear of Instagram's top bar and reply box. The record
 * carries two historical readings: your eras along a timeline radius, and a line tracing when in the
 * day you listened. Some helpers here are shared with the Deep dive poster.
 */

export type StoryPaper = 'midnight' | 'cream'

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

export interface EraRun {
  slot: number
  first: number
  last: number
}

export function renderStoryPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: PosterData, paper: StoryPaper) {
  const u = W / 100
  const pad = 7 * u
  const dark = paper === 'midnight'
  const bg = dark ? '#0b0a0f' : '#efe8da'
  const ink = dark ? '#f4f1ea' : '#17141d'
  const soft = dark ? 'rgba(244, 241, 234, 0.62)' : 'rgba(23, 20, 29, 0.62)'
  const accent = data.tracklist[0]?.color ?? '#ff277c'
  const font = (weight: number, px: number) => `${weight} ${px}px ${DISPLAY}`
  const track = (v: string) => {
    if ('letterSpacing' in ctx) ctx.letterSpacing = v
  }
  const model = data.record
  const multiYear = data.period.includes('–')
  const months = monthly(model, multiYear ? 'quarter' : 'month', multiYear)
  const driftBins = monthly(model, driftScale(model, multiYear), multiYear)
  // Over a long history, one era from each third of it: then, later, now
  const eras = multiYear ? spreadEras(months, 3) : findEraRuns(months, 3)

  ctx.save()
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // Headline and the one-line key, below Instagram's top bar
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.font = font(800, 9 * u)
  track('-0.03em')
  // A long history leads with its length: that's the thing a yearly recap can't say
  ctx.fillText(multiYear ? `${Math.round(model.days / 365.25)} years,` : `My ${data.period},`, pad, 27.5 * u)
  ctx.fillText('on record.', pad, 37 * u)
  track('0px')
  ctx.fillStyle = soft
  ctx.font = font(500, 3.8 * u)
  ctx.fillText('Every ring is a day. Every colour, an artist.', pad, 44 * u)

  // The record
  const D = 60 * u
  const R = D / 2
  const cx = W / 2
  const cy = 82 * u
  const s = R / recordGeometry(1, model.days).disc
  ctx.save()
  ctx.translate(cx - s / 2, cy - s / 2)
  drawRecord(ctx, model, {
    size: s,
    colors: data.recordColors,
    focus: null,
    title: '',
    subtitle: '',
    labelColor: accent,
    sheen: true,
    ink: 'rgba(0, 0, 0, 0)',
    guides: [],
    guideMinute: 0,
  })
  ctx.restore()
  const g = recordGeometry(s, model.days)
  const ringR = (ring: number) => g.inner + ring * g.ring

  // A plain label: just the year
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(cx, cy, g.label, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  track('-0.02em')
  fit(ctx, data.recordTitle === 'ALL TIME' ? 'All time' : data.recordTitle, cx, cy + 0.3 * u, g.label * 1.3, 5 * u, (px) => font(800, px))
  track('0px')

  // The clock, in words
  ctx.fillStyle = soft
  ctx.strokeStyle = soft
  ctx.lineWidth = 0.22 * u
  ctx.font = font(600, 3.4 * u)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillText('midnight', cx, cy - R - 2.2 * u)
  ctx.fillText('noon', cx, cy + R + 4.8 * u)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('6 am', cx + R + 2 * u, cy)
  ctx.textAlign = 'right'
  ctx.fillText('6 pm', cx - R - 2 * u, cy)
  for (let h = 0; h < 4; h++) {
    const a = (h / 4) * TAU - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (R + 0.4 * u), cy + Math.sin(a) * (R + 0.4 * u))
    ctx.lineTo(cx + Math.cos(a) * (R + 1.4 * u), cy + Math.sin(a) * (R + 1.4 * u))
    ctx.stroke()
  }

  // The timeline radius: label to rim is first day to last, painted in the colour of each era
  const qa = (quietestMinute(model) / MINUTES) * TAU - Math.PI / 2
  const [ca, sa] = [Math.cos(qa), Math.sin(qa)]
  const along = (r: number) => [cx + ca * r, cy + sa * r] as const
  ctx.lineCap = 'butt'
  ctx.strokeStyle = 'rgba(244, 241, 234, 0.35)'
  ctx.lineWidth = 0.5 * u
  ctx.beginPath()
  ctx.moveTo(...along(g.inner))
  ctx.lineTo(...along(g.outer))
  ctx.stroke()
  for (const era of eras) {
    ctx.strokeStyle = data.recordColors[era.slot]
    ctx.lineWidth = 1.6 * u
    ctx.beginPath()
    ctx.moveTo(...along(ringR(months[era.first].ring0)))
    ctx.lineTo(...along(ringR(months[era.last].ring1)))
    ctx.stroke()
  }
  const [startLabel, endLabel] = multiYear ? data.period.split('–') : ['Jan', 'Dec']
  pill(ctx, startLabel, ...along(g.inner - 1.6 * u), u, font(700, 2.9 * u))
  pill(ctx, endLabel, ...along(g.outer + 2.6 * u), u, font(700, 2.9 * u))

  // The clock drift: where in the day your listening sat, month by month, as one line from label to rim
  const pts = driftBins
    .filter((m) => m.minute !== null)
    .map((m) => {
      const a = ((m.minute as number) / MINUTES) * TAU - Math.PI / 2
      const r = ringR((m.ring0 + m.ring1) / 2)
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
    })
  if (pts.length > 1) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [w, color] of [[1.3 * u, 'rgba(11, 10, 15, 0.85)'], [0.5 * u, '#ffffff']] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = w
      curveThrough(ctx, pts)
      ctx.stroke()
    }
    const [sx, sy] = pts[0]
    const [ex, ey] = pts[pts.length - 1]
    ctx.fillStyle = '#0b0a0f'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.4 * u
    ctx.beginPath()
    ctx.arc(sx, sy, 0.9 * u, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex, ey, 1.1 * u, 0, TAU)
    ctx.fill()
  }

  // Reading 1: the drift, in words
  const lit = driftBins.filter((m) => m.minute !== null)
  let y = cy + R + 11.5 * u
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (lit.length > 1) {
    const early = circularMean(lit.slice(0, 2).map((m) => m.minute as number))
    const late = circularMean(lit.slice(-2).map((m) => m.minute as number))
    const shift = ((late - early + MINUTES * 1.5) % MINUTES) - MINUTES / 2
    const headline =
      shift > 40 ? (late > 1080 || late < 240 ? 'Your nights got later' : 'Your listening moved later') : shift < -40 ? 'You started listening earlier' : 'Your hours held steady'
    ctx.fillStyle = ink
    ctx.font = font(700, 4.6 * u)
    ctx.fillText(headline, pad, y)
    ctx.fillStyle = soft
    ctx.font = font(500, 3.6 * u)
    const firstLabel = lit[0].label
    const lastLabel = lit[lit.length - 1].label
    y = wrap(ctx, `The white line is the time of day you usually listened: ${clock(early)} in ${firstLabel}, ${clock(late)} by ${lastLabel}.`, pad, y + 5 * u, W - 2 * pad, 4.6 * u)
  }

  // Reading 2: the eras, matching the coloured timeline on the record
  y += 7.5 * u
  ctx.fillStyle = ink
  ctx.font = font(700, 4.6 * u)
  ctx.fillText(eras.length > 1 ? `${eras.length} eras` : 'One era', pad, y)
  y += 1.4 * u
  eras.forEach((era, i) => {
    const base = y + (i + 1) * 5.4 * u
    ctx.fillStyle = data.recordColors[era.slot]
    ctx.fillRect(pad, base - 2.9 * u, 1.2 * u, 3.4 * u)
    ctx.textAlign = 'right'
    ctx.fillStyle = soft
    ctx.font = font(500, 3.6 * u)
    const when = months[era.first].label === months[era.last].label ? months[era.first].label : `${months[era.first].label} – ${months[era.last].label}`
    ctx.fillText(when, W - pad, base)
    const ww = ctx.measureText(when).width
    ctx.textAlign = 'left'
    ctx.fillStyle = ink
    ctx.font = font(650, 4.2 * u)
    ctx.fillText(clip(ctx, data.tracklist[era.slot]?.name ?? '', W - 2 * pad - 3.6 * u - ww - 3 * u), pad + 3.6 * u, base)
  })

  ctx.textAlign = 'left'
  ctx.fillStyle = soft
  ctx.font = font(700, 3 * u)
  ctx.fillText('On Record', pad, H - 6 * u)
  ctx.restore()
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

/** Runs of months led by the same top artist (smoothed over neighbours), the longest few, in time order */
export function findEraRuns(months: Month[], max: number): EraRun[] {
  const leaders = months.map((_, i) => {
    const score = Array(SLOT_OTHER).fill(0)
    for (let k = i - 1; k <= i + 1; k++) months[k]?.slots.forEach((v, s) => (score[s] += v))
    const best = score.indexOf(Math.max(...score))
    return score[best] > 0 ? best : -1
  })
  const eras: EraRun[] = []
  let start = 0
  for (let i = 1; i <= leaders.length; i++) {
    if (i < leaders.length && leaders[i] === leaders[start]) continue
    if (leaders[start] >= 0 && i - start >= 2) {
      const prev = eras[eras.length - 1]
      if (prev && prev.slot === leaders[start] && start - prev.last <= 2) prev.last = i - 1
      else eras.push({ slot: leaders[start], first: start, last: i - 1 })
    }
    start = i
  }
  return eras
    .sort((a, b) => b.last - b.first - (a.last - a.first))
    .slice(0, max)
    .sort((a, b) => a.first - b.first)
}

/** How finely to trace the clock drift: by month for a year, by quarter for a few years, by year beyond that */
export function driftScale(model: RecordModel, multiYear: boolean): 'month' | 'quarter' | 'year' {
  if (!multiYear) return 'month'
  return model.days > 6 * 365 ? 'year' : 'quarter'
}

/** The longest era in each equal slice of the history, so a long history gets a beginning, middle and end */
export function spreadEras(months: Month[], parts: number): EraRun[] {
  const all = findEraRuns(months, 99)
  const picked: EraRun[] = []
  for (let p = 0; p < parts; p++) {
    const lo = Math.floor((p / parts) * months.length)
    const hi = Math.floor(((p + 1) / parts) * months.length) - 1
    const best = all
      .filter((e) => e.first <= hi && e.last >= lo && !picked.includes(e))
      .sort((a, b) => Math.min(b.last, hi) - Math.max(b.first, lo) - (Math.min(a.last, hi) - Math.max(a.first, lo)))[0]
    if (best) picked.push(best)
  }
  return picked.sort((a, b) => a.first - b.first)
}

export function circularMean(minutes: number[]): number {
  let x = 0
  let y = 0
  for (const m of minutes) {
    x += Math.cos((m / MINUTES) * TAU)
    y += Math.sin((m / MINUTES) * TAU)
  }
  return ((((Math.atan2(y, x) / TAU) * MINUTES) % MINUTES) + MINUTES) % MINUTES
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
