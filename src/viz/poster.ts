import { area, curveBasis, line } from 'd3-shape'
import type { GraphLink, GraphNode, Records } from '../data/insights'
import { dayNumber, type FunStats, type WearOut } from '../data/stats'
import { formatDate, formatDuration, formatNumber } from '../lib/format'
import { mulberry32 } from '../lib/random'
import { starSize, type Layout } from './constellation'
import { renderDeepPoster } from './posterDeep'
import {
  DISPLAY,
  MINUTES,
  MONO,
  SERIF,
  TAU,
  drawRecord,
  drawGuideLabels,
  fitText,
  mix,
  quietestMinute,
  recordGeometry,
  recordGuides,
  roundRect,
  type RecordModel,
} from './record'

/*
 * The shareable poster. Everything is measured in units of 1% of the width,
 * so the small preview and the full-size download are the same picture.
 */

export type PosterDesign = 'record' | 'deep' | 'sleeve' | 'annotated' | 'macro' | 'constellation' | 'pulse'
export type PosterSize = 'post' | 'story' | 'print'
/** The studio's two backgrounds, both flat color: 'midnight' is the black one */
export type PosterPaper = 'midnight' | 'cream'

export const isDarkPaper = (paper: PosterPaper) => paper === 'midnight'

/** Print stays under iOS Safari's ~16.7 megapixel canvas limit */
export const POSTER_SIZES: Record<PosterSize, { label: string; ratio: string; width: number; height: number; note: string }> = {
  post: { label: 'Post', ratio: '4:5', width: 2160, height: 2700, note: 'Instagram feed' },
  story: { label: 'Story', ratio: '9:16', width: 2160, height: 3840, note: 'Stories and phone wallpapers' },
  print: { label: 'Print', ratio: '2:3', width: 3000, height: 4500, note: '10 × 15 in at 300 dpi' },
}

/** Designs drawn for particular sizes; the rest fit any */
export const POSTER_DESIGN_SIZES: Partial<Record<PosterDesign, PosterSize[]>> = {
  deep: ['post'],
}

export interface PosterData {
  /** "2024" or "2023–2025" */
  period: string
  /** "every day of 2024" */
  subtitle: string
  record: RecordModel
  recordColors: string[]
  /** What the record's label says: "2024" or "All time" */
  recordTitle: string
  /** Top artists, with their chart colors */
  tracklist: { name: string; color: string; ms: number }[]
  graph: { nodes: GraphNode[]; links: GraphLink[]; layout: Layout }
  colors: Map<string, string>
  pulse: { artists: string[]; series: Map<string, number[]> }
  stats: { hours: number; streams: number; artists: number; songs: number; peak: string }
  /** How the skip rate climbs or falls the more times a song has been played */
  wearOut: WearOut
  /** Standout days and runs, for the designs that point them out on the record */
  moments: PosterMoment[]
  /** Where the data came from, for the credit line: "Spotify Extended Streaming History" */
  source: string
}

export interface PosterMoment {
  kind: 'day' | 'streak' | 'session' | 'first' | 'week'
  /** "Longest day" */
  label: string
  /** "9.2 hrs" */
  value: string
  /** "Mar 14, 2024" */
  detail: string
  /** The groove it happened on; a streak runs on to `ringEnd` */
  ring: number
  ringEnd?: number
  /** Minutes after midnight; a session runs on to `to`. Left out for a whole day */
  from?: number
  to?: number
  /** Each play it's made of, as a groove and minutes after midnight */
  plays?: { ring: number; minute: number }[]
}

/** Picks out the moments worth calling out, as grooves and times on the record */
export function posterMoments(model: RecordModel, fun: FunStats, rec: Records): PosterMoment[] {
  const ringOf = (d: Date) => dayNumber(d) - model.firstDay
  const minuteOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
  const out: PosterMoment[] = []
  if (fun.biggestDay) {
    out.push({ kind: 'day', label: 'Longest day', value: formatDuration(fun.biggestDay.ms), detail: formatDate(fun.biggestDay.date), ring: ringOf(fun.biggestDay.date) })
  }
  if (fun.longestStreak && fun.longestStreak.days > 1) {
    const { start, end, days } = fun.longestStreak
    out.push({ kind: 'streak', label: 'Longest streak', value: `${formatNumber(days)} days`, detail: `${formatDate(start)} – ${formatDate(end)}`, ring: ringOf(start), ringEnd: ringOf(end) })
  }
  if (rec.marathon) {
    const start = new Date(rec.marathon.start)
    const from = minuteOf(start)
    out.push({
      kind: 'session',
      label: 'Longest session',
      value: formatDuration(rec.marathon.ms),
      detail: formatDate(start),
      ring: ringOf(start),
      from,
      to: Math.min(MINUTES, from + (rec.marathon.end - rec.marathon.start) / 60_000),
    })
  }
  if (rec.firstPlay) {
    const d = new Date(rec.firstPlay.date)
    out.push({ kind: 'first', label: 'First spin', value: rec.firstPlay.title, detail: rec.firstPlay.artist, ring: ringOf(d), from: minuteOf(d) })
  }
  if (fun.topWeek && fun.topWeek.count > 1) {
    const { title, artist, start, end, count, plays } = fun.topWeek
    out.push({
      kind: 'week',
      label: 'Most played in a week',
      value: title,
      detail: `${artist}, ${formatNumber(count)} plays the week of ${formatDate(start)}`,
      ring: ringOf(start),
      ringEnd: ringOf(end),
      plays: plays.map((d) => ({ ring: ringOf(d), minute: minuteOf(d) })),
    })
  }
  return out.filter((m) => m.ring >= 0 && m.ring < model.days)
}

interface Paper {
  bg: string
  ink: string
  muted: string
  rule: string
  dark: boolean
}

const PAPERS: Record<PosterPaper, Paper> = {
  // The same black as the deep dive's, so every design's dark poster matches
  midnight: { bg: '#0e0d12', ink: '#f4f1ea', muted: 'rgba(244, 241, 234, 0.62)', rule: 'rgba(244, 241, 234, 0.2)', dark: true },
  cream: { bg: '#efe8da', ink: '#17141d', muted: 'rgba(23, 20, 29, 0.64)', rule: 'rgba(23, 20, 29, 0.22)', dark: false },
}

const CAPTIONS: Record<PosterDesign, string> = {
  record: 'One groove per day, label to rim. Midnight at the top, clockwise.',
  deep: '',
  sleeve: 'One groove per day, label to rim. Midnight at the top, clockwise.',
  annotated: 'Fig. 1. One groove per day, label to rim. Midnight at the top, clockwise.',
  macro: 'One groove per day. Midnight at the top, clockwise.',
  constellation: 'Stars are artists, sized by hours. Lines join artists played back to back.',
  pulse: 'One line per artist, in order of discovery, scaled to its own peak.',
}

export interface PosterOptions {
  design: PosterDesign
  paper: PosterPaper
  title: string
  /** Deep dive only: overrides the color it takes from your #1 artist */
  accent?: string
}

export function renderPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: PosterData, o: PosterOptions) {
  // These two lay themselves out for one size each (see POSTER_DESIGN_SIZES)
  if (o.design === 'deep') return renderDeepPoster(ctx, W, H, data, o.paper, o.accent)

  const p = PAPERS[o.paper]
  const u = W / 100
  const pad = 6.5 * u
  const accent = data.tracklist[0]?.color ?? '#ff277c'
  const ratio = H / W
  // Taller formats have room for more of the tracklist
  const rows = ratio > 1.6 ? 4 : ratio > 1.4 ? 3 : 2
  const rowH = 4.3 * u

  ctx.save()
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, W, H)

  // The macro crop is full bleed, with its words on the record's label
  if (o.design === 'macro') {
    macroPoster(ctx, data, W, H, u, pad, p, accent)
    ctx.restore()
    return
  }

  // Header
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = p.ink
  ctx.font = `650 ${2.6 * u}px ${DISPLAY}`
  ctx.textAlign = 'left'
  ctx.fillText('A listening record', pad, pad + 2.4 * u)
  ctx.textAlign = 'right'
  ctx.fillText(data.period, W - pad, pad + 2.4 * u)
  ctx.fillStyle = p.rule
  ctx.fillRect(pad, pad + 3.6 * u, W - 2 * pad, Math.max(1, 0.12 * u))

  // Lay out the bottom block from the bottom up: caption, stats, tracklist, then title
  const captionY = H - pad
  const statsY = captionY - 4.2 * u
  const listBottom = statsY - 4 * u
  const listTop = listBottom - rows * rowH
  const listHeadY = listTop - 1.1 * u
  const subtitleY = listHeadY - 5.2 * u
  const titleMax = 11 * u
  ctx.textAlign = 'left'
  spacing(ctx, '-0.02em')
  const titleSize = measureFit(ctx, o.title, W - 2 * pad, titleMax, `800 {px}px ${DISPLAY}`)
  spacing(ctx, '0px')
  const titleY = subtitleY - 5.4 * u
  // The sleeve carries the title on its cover, so its artwork runs down to the tracklist
  const framed = o.design !== 'sleeve'
  const artTop = pad + 6.6 * u
  const artBottom = framed ? titleY - titleSize * 0.8 - 4 * u : listHeadY - 5 * u
  const artH = artBottom - artTop
  const artW = W - 2 * pad
  const box = { x: pad, y: artTop, w: artW, h: artH }

  if (o.design === 'record') {
    // The hour labels sit in the outer margin of the square, so it can run a little past the art box
    const s = Math.min(artW * 1.06, artH * 1.06)
    const x = (W - s) / 2
    const y = artTop + (artH - s) / 2
    placeRecord(ctx, data, x, y, s, u, p, accent)
  } else if (o.design === 'sleeve') {
    sleeveArt(ctx, data, o, box, u, p, accent)
  } else if (o.design === 'annotated') {
    annotatedArt(ctx, data, box, u, p, accent)
  } else if (o.design === 'constellation') {
    const R = Math.min(artW, artH) / 2 - 2.4 * u
    const cx = W / 2
    const cy = artTop + artH / 2
    starChart(ctx, data, cx, cy, R, u, p)
  } else {
    pulseArt(ctx, data, pad, artTop + 1.5 * u, artW, artH - 3 * u, u, p, accent, rows >= 3)
  }

  // Title and subtitle
  if (framed) {
    ctx.textAlign = 'left'
    ctx.fillStyle = p.ink
    spacing(ctx, '-0.02em')
    ctx.font = `800 ${titleSize}px ${DISPLAY}`
    ctx.fillText(o.title, pad - 0.3 * u, titleY)
    spacing(ctx, '0px')
    ctx.font = `${4.6 * u}px ${SERIF}`
    ctx.fillStyle = p.dark ? accent : darken(accent)
    ctx.fillText(data.subtitle, pad, subtitleY)
  }

  footer(ctx, data, { listHeadY, listTop, statsY, captionY }, rows, rowH, W, pad, u, p, o.design)
  ctx.restore()
}

// ---------- The record, three ways ----------

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The record with its drop shadow, drawn into an s × s square at (x, y) */
function placeRecord(ctx: CanvasRenderingContext2D, data: PosterData, x: number, y: number, s: number, u: number, p: Paper, accent: string) {
  const disc = recordGeometry(s, data.record.days).disc
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 4 * u
  ctx.shadowOffsetY = 1.4 * u
  ctx.fillStyle = '#0b0a0f'
  ctx.beginPath()
  ctx.arc(x + s / 2, y + s / 2, disc * 1.05, 0, TAU)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.translate(x, y)
  drawRecord(ctx, data.record, {
    size: s,
    colors: data.recordColors,
    focus: null,
    title: data.recordTitle,
    subtitle: `${formatNumber(data.stats.hours)} hours, ${formatNumber(data.stats.artists)} artists`,
    labelColor: accent,
    sheen: true,
    ink: p.muted,
    guides: recordGuides(data.record),
    guideMinute: quietestMinute(data.record),
  })
  ctx.restore()
}

/** The record half out of its sleeve, with the title on the cover */
function sleeveArt(ctx: CanvasRenderingContext2D, data: PosterData, o: PosterOptions, box: Box, u: number, p: Paper, accent: string) {
  const model = data.record
  const q = clockQuarters(model)
  const unit = recordGeometry(1, model.days).disc

  // The sleeve hides half the record, so it slides out on the side where most of your listening is:
  // sideways in wide boxes (evenings on the left, mornings on the right), up or down in tall ones
  const tall = box.h > box.w * 1.1
  const dir = tall ? (q[3] + q[0] >= q[1] + q[2] ? 'up' : 'down') : q[2] + q[3] >= q[0] + q[1] ? 'left' : 'right'
  let S: number, discR: number, sx: number, sy: number, cx: number, cy: number
  if (!tall) {
    S = Math.min(box.w * 0.62, box.h * 0.86)
    discR = Math.min(S * 0.68, box.h / 2)
    sy = box.y + (box.h - S) / 2
    sx = dir === 'left' ? box.x + box.w - S : box.x
    cx = dir === 'left' ? sx - discR * 0.4 : sx + S + discR * 0.4
    cy = sy + S / 2
  } else {
    S = Math.min(box.w * 0.86, box.h * 0.6)
    discR = S * 0.47
    const out = discR * 0.3
    const top = box.y + (box.h - (S + out + discR)) / 2
    sx = box.x + (box.w - S) / 2
    cx = sx + S / 2
    if (dir === 'up') {
      cy = top + discR
      sy = cy + out
    } else {
      sy = top
      cy = sy + S + out
    }
  }
  const s = discR / unit
  const x = cx - s / 2
  const y = cy - s / 2
  placeRecord(ctx, data, x, y, s, u, p, accent)

  // The sleeve, casting a soft shadow onto the record
  const light = p.dark
  const cover = light ? '#f4f1ea' : '#17141d'
  const coverInk = light ? '#17141d' : '#f4f1ea'
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 3 * u
  ctx.shadowOffsetX = dir === 'left' ? -0.8 * u : dir === 'right' ? 0.8 * u : 0
  ctx.shadowOffsetY = dir === 'up' ? -0.8 * u : dir === 'down' ? 0.8 * u : 0
  ctx.fillStyle = cover
  ctx.fillRect(sx, sy, S, S)
  ctx.restore()
  ctx.fillStyle = accent
  ctx.fillRect(sx, sy, S, S * 0.018)

  // Cover type
  const cp = S * 0.075
  const inner = S - 2 * cp
  // Side A on the left and the year on the right, like the spine of a sleeve
  const head = Math.max(S * 0.042, 2.6 * u)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = coverInk
  ctx.font = `700 ${head}px ${DISPLAY}`
  ctx.textAlign = 'left'
  ctx.fillText('Side A', sx + cp, sy + cp + head * 0.8)
  ctx.textAlign = 'right'
  ctx.fillText(data.recordTitle, sx + S - cp, sy + cp + head * 0.8)
  ctx.fillStyle = withAlpha(coverInk, 0.25)
  ctx.fillRect(sx + cp, sy + cp + head * 1.3, inner, Math.max(1, 0.1 * u))
  ctx.textAlign = 'left'
  ctx.fillStyle = light ? darken(accent) : accent
  fitText(ctx, data.subtitle, sx + cp, sy + cp + head * 1.3 + S * 0.1, inner, S * 0.075, `{px}px ${SERIF}`)

  const titleBase = sy + S - cp

  // The title, broken onto two lines when that lets it run bigger
  const lines = splitTitle(o.title)
  spacing(ctx, '-0.02em')
  ctx.font = `800 100px ${DISPLAY}`
  const px = Math.min(S * 0.2, ...lines.map((l) => (100 * inner) / Math.max(1, ctx.measureText(l).width)))
  ctx.font = `800 ${px}px ${DISPLAY}`
  ctx.fillStyle = coverInk
  lines.forEach((line, i) => ctx.fillText(line, sx + cp - px * 0.03, titleBase - (lines.length - 1 - i) * px * 0.92))
  spacing(ctx, '0px')
}

/** The record as a numbered figure, with callouts for your standout days in the margins */
function annotatedArt(ctx: CanvasRenderingContext2D, data: PosterData, box: Box, u: number, p: Paper, accent: string) {
  const model = data.record
  // The margins beside it have to hold "3. Longest session" at callout size, so the record leaves them 18u each
  const s = Math.min(box.h * 1.04, box.w * 0.58)
  const x = box.x + (box.w - s) / 2
  const y = box.y + (box.h - s) / 2
  placeRecord(ctx, data, x, y, s, u, p, accent)
  const g = recordGeometry(s, model.days)
  const cx = x + g.center
  const cy = y + g.center
  // Streaks run across many grooves, so they're bracketed along a quiet radius, just past the month labels
  const streakMinute = (quietestMinute(model) + 75) % MINUTES

  // The week's top song is only pointed out on the deep dive
  const marks = data.moments.filter((m) => m.kind !== 'week').slice(0, 4).map((m, i) => {
    let ring = m.ring
    let minute = m.from ?? busiestMinute(model, m.ring)
    if (m.kind === 'streak') {
      ring = (m.ring + (m.ringEnd ?? m.ring)) / 2
      minute = streakMinute
    } else if (m.kind === 'session' && m.from !== undefined && m.to !== undefined) {
      minute = (m.from + m.to) / 2
    }
    return { m, n: i + 1, ...groovePoint(model, x, y, s, ring, minute) }
  })

  // What each callout points at
  ctx.save()
  ctx.lineCap = 'butt'
  for (const { m } of marks) {
    if (m.kind === 'day') highlightDay(ctx, model, x, y, s, m.ring, accent, u)
    if (m.kind === 'session' && m.from !== undefined && m.to !== undefined) {
      const r = g.inner + (m.ring + 0.5) * g.ring
      const a0 = (m.from / MINUTES) * TAU - Math.PI / 2
      const a1 = Math.max((m.to / MINUTES) * TAU - Math.PI / 2, a0 + 0.02)
      ctx.strokeStyle = withAlpha(accent, 0.5)
      ctx.lineWidth = Math.max(g.ring * 3, 0.45 * u)
      ctx.beginPath()
      ctx.arc(cx, cy, r, a0, a1)
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(g.ring * 1.6, 0.22 * u)
      ctx.beginPath()
      ctx.arc(cx, cy, r, a0, a1)
      ctx.stroke()
    }
    if (m.kind === 'streak') {
      const a = (streakMinute / MINUTES) * TAU - Math.PI / 2
      const r0 = g.inner + m.ring * g.ring
      const r1 = g.inner + ((m.ringEnd ?? m.ring) + 1) * g.ring
      const [ca, sa] = [Math.cos(a), Math.sin(a)]
      const tick = 0.8 * u
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.22 * u
      ctx.beginPath()
      ctx.moveTo(cx + r0 * ca, cy + r0 * sa)
      ctx.lineTo(cx + r1 * ca, cy + r1 * sa)
      for (const r of [r0, r1]) {
        ctx.moveTo(cx + r * ca - sa * tick, cy + r * sa + ca * tick)
        ctx.lineTo(cx + r * ca + sa * tick, cy + r * sa - ca * tick)
      }
      ctx.stroke()
    }
  }
  ctx.restore()

  // Split the callouts between the margins by where they sit, then stack each side top to bottom
  const colW = (box.w - s) / 2 - 0.4 * u
  // A callout is a label, a value and up to two detail lines; the last descender sits 11.6u below its top
  const blockH = 12 * u
  const gap = 13.6 * u
  const byX = [...marks].sort((a, b) => a.x - b.x)
  const half = Math.ceil(byX.length / 2)
  const sides = [
    { left: true, items: byX.slice(0, half) },
    { left: false, items: byX.slice(half) },
  ]
  const placed: { mark: (typeof marks)[number]; left: boolean; top: number }[] = []
  for (const side of sides) {
    const items = side.items.sort((a, b) => a.y - b.y)
    const tops = items.map((it) => Math.min(Math.max(it.y - blockH * 0.4, box.y), box.y + box.h - blockH))
    for (let i = 1; i < tops.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + gap)
    const over = tops.length ? tops[tops.length - 1] - (box.y + box.h - blockH) : 0
    if (over > 0) for (let i = 0; i < tops.length; i++) tops[i] -= over
    items.forEach((mark, i) => placed.push({ mark, left: side.left, top: tops[i] }))
  }

  // Leaders: paper-colored ink in the margins, light on the black of the disc
  const leader = (mark: (typeof marks)[number], left: boolean, top: number) => {
    const mid = top + 3.2 * u
    const edge = left ? x - 0.1 * u : x + s + 0.1 * u
    const elbow = left ? x + s * 0.04 : x + s * 0.96
    ctx.beginPath()
    ctx.moveTo(mark.x, mark.y)
    ctx.lineTo(elbow, mid)
    ctx.lineTo(edge, mid)
    ctx.stroke()
  }
  ctx.save()
  ctx.lineWidth = Math.max(1, 0.12 * u)
  ctx.strokeStyle = p.muted
  for (const { mark, left, top } of placed) leader(mark, left, top)
  ctx.beginPath()
  ctx.arc(cx, cy, g.disc, 0, TAU)
  ctx.clip()
  ctx.strokeStyle = 'rgba(244, 241, 234, 0.75)'
  for (const { mark, left, top } of placed) leader(mark, left, top)
  ctx.restore()

  // Numbered markers on the record
  for (const mark of marks) {
    const r = 1.25 * u
    ctx.fillStyle = '#f4f1ea'
    ctx.strokeStyle = accent
    ctx.lineWidth = 0.2 * u
    ctx.beginPath()
    ctx.arc(mark.x, mark.y, r, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#0b0a0f'
    ctx.font = `700 ${1.3 * u}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(mark.n), mark.x, mark.y + 0.08 * u)
  }

  // The callouts
  ctx.textBaseline = 'alphabetic'
  for (const { mark, left, top } of placed) {
    const tx = left ? x - 0.6 * u : x + s + 0.6 * u
    ctx.textAlign = left ? 'right' : 'left'
    ctx.fillStyle = p.muted
    ctx.font = `600 ${2 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, `${mark.n}. ${mark.m.label}`, colW), tx, top + 2 * u)
    ctx.fillStyle = p.ink
    ctx.font = `650 ${2.5 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, mark.m.value, colW), tx, top + 5.4 * u)
    ctx.fillStyle = p.muted
    ctx.font = `500 ${2 * u}px ${DISPLAY}`
    // A date range that won't fit breaks after the dash
    const detail = mark.m.detail
    const lines = ctx.measureText(detail).width > colW && detail.includes(' – ') ? detail.replace(' – ', ' –\n').split('\n') : [detail]
    lines.forEach((line, i) => ctx.fillText(ellipsize(ctx, line, colW), tx, top + (8.7 + i * 2.5) * u))
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = p.muted
  ctx.font = `${2.6 * u}px ${SERIF}`
  ctx.fillText('Fig. 1', x + s * 0.02, y + s - 0.4 * u)
}

/**
 * Zoomed right in: the record is centered on one corner so a quarter of it fills the poster,
 * turned to show your busiest six hours, with the words on the label
 */
function macroPoster(ctx: CanvasRenderingContext2D, data: PosterData, W: number, H: number, u: number, pad: number, p: Paper, accent: string) {
  const model = data.record
  const q = clockQuarters(model)
  const best = q.indexOf(Math.max(...q))
  // Midnight–6am is the top-right quarter of the disc, so it shows when the center sits bottom-left, and so on round
  const [cx, cy] = ([[0, H], [0, 0], [W, 0], [W, H]] as const)[best]
  const unit = recordGeometry(1, model.days)
  const size = (Math.hypot(W, H) * 0.84) / unit.disc
  const g = recordGeometry(size, model.days)

  // Drawn at poster width and scaled up, so hairlines and small type keep their poster size
  const k = size / W
  const recordSpace = () => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.translate(-W / 2, -W / 2)
  }
  const recordOptions = {
    size: W,
    colors: data.recordColors,
    focus: null,
    title: '',
    subtitle: '',
    labelColor: accent,
    sheen: true,
    ink: p.muted,
    guides: recordGuides(model),
    // Month tags run just inside the edge of the visible quarter
    guideMinute: best * 360 + 315,
    zoom: k,
    // They go on after the highlighted day and session, so those lines run under the tags
    noGuideLabels: true,
  }
  recordSpace()
  drawRecord(ctx, model, recordOptions)
  ctx.restore()

  // Repaint the label so only our type is on it
  const lr = g.label
  const label = ctx.createRadialGradient(cx - lr * 0.4, cy - lr * 0.5, lr * 0.1, cx, cy, lr)
  label.addColorStop(0, mix(accent, '#ffffff', 0.35))
  label.addColorStop(1, accent)
  ctx.fillStyle = label
  ctx.beginPath()
  ctx.arc(cx, cy, lr, 0, TAU)
  ctx.fill()

  // Standout moments, tagged where they fall in view
  const origin = { x: cx - size / 2, y: cy - size / 2 }
  const day = data.moments.find((m) => m.kind === 'day')
  const session = data.moments.find((m) => m.kind === 'session')
  if (day) highlightDay(ctx, model, origin.x, origin.y, size, day.ring, accent, u)
  type Rect = { x0: number; x1: number; y0: number; y1: number }
  const hits = (a: Rect, b: Rect, gap: number) => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap
  const inQuarter = (min: number) => Math.floor(min / 360) === best
  const right = cx > 0
  const bottom = cy > 0
  // A key to the colors in the far corner, mostly over bare paper past the rim, and with no footer
  // here, the key to the record itself
  const fx = right ? pad : W - pad
  const fy = bottom ? pad : H - pad
  const items = data.tracklist.slice(0, 4)
  const rowH = 3.4 * u
  const cw = 36 * u
  const inset = 1.8 * u
  const noteFont = `500 ${2.2 * u}px ${DISPLAY}`
  ctx.font = noteFont
  const note = wrapLines(ctx, CAPTIONS.macro, cw - 2 * inset)
  // From the rule to the last line's descender: 1.9u down to the first baseline, then 2.9u a line
  const noteH = 1.9 * u + (note.length - 1) * 2.9 * u
  const ch = 4.8 * u + items.length * rowH + 1.6 * u + noteH + 1.7 * u
  const kx = right ? fx : fx - cw
  const ky = bottom ? fy : fy - ch
  const key = { x0: kx, x1: kx + cw, y0: ky, y1: ky + ch }
  const dotR = 0.6 * u
  const th = 3.4 * u
  const pinFont = `600 ${1.8 * u}px ${DISPLAY}`
  ctx.font = pinFont
  const pins = [day, session].flatMap((m) => {
    if (!m) return []
    const preferred = m.from !== undefined && m.to !== undefined ? (m.from + m.to) / 2 : busiestMinute(model, m.ring)
    const pt = groovePoint(model, origin.x, origin.y, size, m.ring, inQuarter(preferred) ? preferred : best * 360 + 180)
    const fromCenter = Math.hypot(pt.x - cx, pt.y - cy)
    if (pt.x < pad || pt.x > W - pad || pt.y < pad + 4 * u || pt.y > H - pad - 4 * u || fromCenter < lr + 4 * u) return []
    const text = `${m.label}: ${m.value} on ${m.detail}`
    const tw = Math.min(ctx.measureText(text).width, W - 2 * pad - 2.4 * u)
    const dot = { x0: pt.x - dotR, x1: pt.x + dotR, y0: pt.y - dotR, y1: pt.y + dotR }
    if (hits(dot, key, u)) return []
    return [{ m, pt, text, tw, dot }]
  })

  // Every dot is fixed, so each tag and its leader keep clear of the key, the dots and the tags placed
  // before it, stepping farther out or flipping sides until they fit
  const taken: Rect[] = [key, ...pins.map((t) => t.dot)]
  const tags = pins.flatMap((t) => {
    const { pt, tw } = t
    const tx = Math.min(Math.max(pt.x - tw / 2 - 1.2 * u, pad), W - pad - tw - 2.4 * u)
    const prefersAbove = pt.y > H / 2
    for (const above of [prefersAbove, !prefersAbove]) {
      for (const gap of [6, 10, 14, 18]) {
        const ty = above ? pt.y - gap * u - th : pt.y + gap * u
        if (ty < pad || ty + th > H - pad) continue
        const box = { x0: tx, x1: tx + tw + 2.4 * u, y0: ty, y1: ty + th }
        const leader = above
          ? { x0: pt.x - 0.2 * u, x1: pt.x + 0.2 * u, y0: box.y1, y1: pt.y - dotR }
          : { x0: pt.x - 0.2 * u, x1: pt.x + 0.2 * u, y0: pt.y + dotR, y1: box.y0 }
        const others = taken.filter((r) => r !== t.dot)
        if (others.some((r) => hits(box, r, u)) || others.some((r) => hits(leader, r, 0.4 * u))) continue
        taken.push(box, leader)
        return [{ ...t, box, above }]
      }
    }
    return []
  })

  // The session's stretch of groove, then the month tags over both lines, then the pins and their tags
  for (const { m } of tags) {
    if (m.kind !== 'session' || m.from === undefined || m.to === undefined) continue
    const r = g.inner + (m.ring + 0.5) * g.ring
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(g.ring * 1.6, 0.25 * u)
    ctx.beginPath()
    ctx.arc(cx, cy, r, (m.from / MINUTES) * TAU - Math.PI / 2, Math.max((m.to / MINUTES) * TAU - Math.PI / 2, (m.from / MINUTES) * TAU - Math.PI / 2 + 0.01))
    ctx.stroke()
  }
  // In record space, where the poster is scaled up by k
  const guideAvoid = [
    ...(day ? [{ ring: day.ring, halfWidth: Math.max(g.ring * 2.4, 0.3 * u) / 2 / k }] : []),
    ...tags.flatMap(({ m }) => (m.kind === 'session' ? [{ ring: m.ring, halfWidth: Math.max(g.ring * 1.6, 0.25 * u) / 2 / k, from: m.from, to: m.to }] : [])),
  ]
  recordSpace()
  const toRecord = (r: Rect) => ({ x0: (r.x0 - cx) / k + W / 2, y0: (r.y0 - cy) / k + W / 2, x1: (r.x1 - cx) / k + W / 2, y1: (r.y1 - cy) / k + W / 2 })
  drawGuideLabels(ctx, model.days, { ...recordOptions, guideAvoid, guideBlocked: taken.filter((r) => !pins.some((t) => t.dot === r && !tags.some((d) => d.dot === r))).map(toRecord) })
  ctx.restore()
  for (const { pt, box, above } of tags) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1, 0.14 * u)
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
    ctx.lineTo(pt.x, above ? box.y1 : box.y0)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = accent
    ctx.lineWidth = 0.2 * u
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, dotR, 0, TAU)
    ctx.fill()
    ctx.stroke()
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = pinFont
  for (const { text, tw, box } of tags) {
    ctx.fillStyle = 'rgba(11, 10, 15, 0.88)'
    roundRect(ctx, box.x0, box.y0, box.x1 - box.x0, th, th / 2)
    ctx.fill()
    ctx.fillStyle = '#f4f1ea'
    ctx.fillText(ellipsize(ctx, text, tw), box.x0 + 1.2 * u, box.y0 + th / 2 + 0.1 * u)
  }

  // Type on the label, tucked into the corner
  const tx = right ? W - pad : pad
  const tw = lr * 0.56
  const title = data.recordTitle
  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = right ? 'right' : 'left'
  ctx.textBaseline = 'alphabetic'
  spacing(ctx, '-0.02em')
  const ts = measureFit(ctx, title, tw, 12 * u, `800 {px}px ${DISPLAY}`)
  spacing(ctx, '0px')
  const stack = [2.2 * u, ts * 0.78 + 2 * u, 5 * u, 3.6 * u]
  const total = stack.reduce((a, b) => a + b, 0)
  let at = bottom ? H - pad - total : pad
  at += stack[0]
  ctx.font = `650 ${2.4 * u}px ${DISPLAY}`
  ctx.fillText('A listening record', tx, at)
  spacing(ctx, '-0.02em')
  at += stack[1]
  ctx.font = `800 ${ts}px ${DISPLAY}`
  ctx.fillText(title, tx - (right ? -0.3 : 0.3) * u, at)
  spacing(ctx, '0px')
  at += stack[2]
  fitText(ctx, data.subtitle, tx, at, tw, 4 * u, `{px}px ${SERIF}`)
  at += stack[3]
  const totals = `${formatNumber(data.stats.hours)} hours, ${formatNumber(data.stats.artists)} artists`
  measureFit(ctx, totals, tw, 2.4 * u, `600 {px}px ${DISPLAY}`)
  ctx.fillText(totals, tx, at)

  // The key, placed before the tags so they keep clear of it
  ctx.fillStyle = 'rgba(11, 10, 15, 0.86)'
  roundRect(ctx, kx, ky, cw, ch, 1.2 * u)
  ctx.fill()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `700 ${2 * u}px ${DISPLAY}`
  ctx.fillText('My listening record', kx + inset, ky + 3.2 * u)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(244, 241, 234, 0.62)'
  ctx.font = `600 ${2 * u}px ${DISPLAY}`
  ctx.fillText(data.period, kx + cw - inset, ky + 3.2 * u)
  items.forEach((item, i) => {
    const base = ky + 4.8 * u + (i + 0.75) * rowH
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(kx + inset + 0.6 * u, base - 0.7 * u, 0.7 * u, 0, TAU)
    ctx.fill()
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(244, 241, 234, 0.62)'
    ctx.font = `500 ${1.7 * u}px ${MONO}`
    const hours = `${formatNumber(item.ms / 3_600_000)} hrs`
    ctx.fillText(hours, kx + cw - inset, base)
    const hw = ctx.measureText(hours).width
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f4f1ea'
    ctx.font = `650 ${2.2 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, item.name, cw - 2 * inset - 2.4 * u - hw - u), kx + inset + 2.4 * u, base)
  })
  ctx.font = noteFont
  const noteTop = ky + 4.8 * u + items.length * rowH + 1.6 * u
  ctx.fillStyle = 'rgba(244, 241, 234, 0.2)'
  ctx.fillRect(kx + inset, noteTop - 1.2 * u, cw - 2 * inset, Math.max(1, 0.1 * u))
  ctx.fillStyle = 'rgba(244, 241, 234, 0.62)'
  note.forEach((line, i) => ctx.fillText(line, kx + inset, noteTop + 1.9 * u + i * 2.9 * u))
}

/** Where a groove meets a time of day, for a record drawn into an s × s square at (x, y) */
function groovePoint(model: RecordModel, x: number, y: number, s: number, ring: number, minute: number) {
  const g = recordGeometry(s, model.days)
  const r = g.inner + (ring + 0.5) * g.ring
  const a = (minute / MINUTES) * TAU - Math.PI / 2
  return { x: x + g.center + r * Math.cos(a), y: y + g.center + r * Math.sin(a) }
}

/** The middle of the longest single play on one day, so a pointer to that day lands on something */
function busiestMinute(model: RecordModel, ring: number): number {
  let best = -1
  let mid = MINUTES / 2
  for (let k = 0; k < model.count; k++) {
    if (model.ring[k] !== ring) continue
    const len = model.to[k] - model.from[k]
    if (len > best) {
      best = len
      mid = (model.from[k] + model.to[k]) / 2
    }
  }
  return mid
}

/** Listening per quarter of the clock: midnight–6am, 6am–noon, noon–6pm, 6pm–midnight */
function clockQuarters(model: RecordModel): number[] {
  const q = [0, 0, 0, 0]
  for (let k = 0; k < model.count; k++) {
    q[Math.min(3, Math.floor((model.from[k] + model.to[k]) / 2 / 360))] += model.to[k] - model.from[k]
  }
  return q
}

/** Retraces one day's groove in white over a faint accent band, so it stands out from the rest */
function highlightDay(ctx: CanvasRenderingContext2D, model: RecordModel, x: number, y: number, s: number, ring: number, accent: string, u: number) {
  const g = recordGeometry(s, model.days)
  const r = g.inner + (ring + 0.5) * g.ring
  const cx = x + g.center
  const cy = y + g.center
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.strokeStyle = withAlpha(accent, 0.5)
  ctx.lineWidth = Math.max(g.ring * 2.4, 0.3 * u)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(g.ring * 1.6, 0.2 * u)
  ctx.beginPath()
  for (let k = 0; k < model.count; k++) {
    if (model.ring[k] !== ring) continue
    const a0 = (model.from[k] / MINUTES) * TAU - Math.PI / 2
    const a1 = Math.max((model.to[k] / MINUTES) * TAU - Math.PI / 2, a0 + 0.004)
    ctx.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0))
    ctx.arc(cx, cy, r, a0, a1)
  }
  ctx.stroke()
  ctx.restore()
}

/** Splits a title across two lines at the word break that keeps the lines most even */
function splitTitle(title: string): string[] {
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return [title]
  let best = 1
  let bestLen = Infinity
  for (let i = 1; i < words.length; i++) {
    const len = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length)
    if (len < bestLen) {
      bestLen = len
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

// ---------- Artwork ----------

const SKY = '#100d26'

function starChart(ctx: CanvasRenderingContext2D, data: PosterData, cx: number, cy: number, R: number, u: number, p: Paper) {
  const rand = mulberry32(11)

  // The sky: always night, even on cream paper, like a printed star map, and as flat as one
  ctx.fillStyle = SKY
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
  ctx.font = `600 ${1.8 * u}px ${DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const stars = nodes.map((n) => ({ x: pos(n.id).x, y: pos(n.id).y, r: starR(n.ms) }))
  for (const n of nodes.slice(0, 16)) {
    const q = pos(n.id)
    const r = starR(n.ms)
    const text = n.id
    const w = ctx.measureText(text).width
    const box = { x0: q.x - w / 2 - 0.4 * u, x1: q.x + w / 2 + 0.4 * u, y0: q.y + r + 0.8 * u, y1: q.y + r + 3.1 * u }
    const inside = Math.hypot(q.x - cx, box.y1 - cy) < R - u && box.x0 > cx - R && box.x1 < cx + R
    const clash =
      placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) ||
      stars.some((s) => s.x + s.r > box.x0 && s.x - s.r < box.x1 && s.y + s.r > box.y0 && s.y - s.r < box.y1)
    if (!inside || clash) continue
    placed.push(box)
    // Cut out of the link lines in the sky's color, so the name reads where they cross it
    ctx.strokeStyle = SKY
    ctx.lineWidth = 0.5 * u
    ctx.lineJoin = 'round'
    ctx.strokeText(text, q.x, box.y0 + 0.2 * u)
    ctx.fillStyle = 'rgba(244, 241, 234, 0.92)'
    ctx.fillText(text, q.x, box.y0 + 0.2 * u)
  }
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
  ctx.font = `650 ${1.9 * u}px ${DISPLAY}`
  ctx.fillText('Top artists', pad, at.listHeadY - 0.9 * u)
  ctx.textAlign = 'right'
  ctx.fillText('Hours', W - pad, at.listHeadY - 0.9 * u)
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
    ctx.font = `500 ${1.7 * u}px ${MONO}`
    ctx.fillText(`${col === 0 ? 'A' : 'B'}${row + 1}`, x, baseline)

    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(x + 5 * u, baseline - 0.72 * u, 0.75 * u, 0, TAU)
    ctx.fill()

    ctx.textAlign = 'right'
    ctx.fillStyle = p.muted
    ctx.font = `500 ${1.9 * u}px ${MONO}`
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
  const { hours, artists, peak } = data.stats
  const stats = `${formatNumber(hours)} hours, ${formatNumber(artists)} artists, busiest around ${peak}.`
  measureFit(ctx, stats, W - 2 * pad, 2.8 * u, `600 {px}px ${DISPLAY}`)
  ctx.fillText(stats, pad, at.statsY)

  // The key to the picture gets the whole width; the header already says what the poster is
  ctx.fillStyle = p.muted
  measureFit(ctx, CAPTIONS[design], W - 2 * pad, 2.6 * u, `500 {px}px ${DISPLAY}`)
  ctx.fillText(CAPTIONS[design], pad, at.captionY)
}

// ---------- Helpers ----------

/** Breaks text into lines no wider than `width` in the current font */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
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
