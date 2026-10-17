import { area, curveBasis, line } from 'd3-shape'
import type { GraphLink, GraphNode, Records } from '../data/insights'
import { dayNumber, type FunStats, type WearOut } from '../data/stats'
import { formatDate, formatDuration, formatNumber } from '../lib/format'
import { mulberry32 } from '../lib/random'
import { starSize, type Layout } from './constellation'
import { renderDeepPoster } from './posterDeep'
import { renderStoryPoster } from './posterStory'
import {
  DISPLAY,
  MINUTES,
  MONO,
  SERIF,
  TAU,
  drawRecord,
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

export type PosterDesign = 'record' | 'deep' | 'story' | 'sleeve' | 'annotated' | 'macro' | 'constellation' | 'pulse'
export type PosterSize = 'post' | 'story' | 'print'
export type PosterPaper = 'midnight' | 'cream'

/** Print stays under iOS Safari's ~16.7 megapixel canvas limit */
export const POSTER_SIZES: Record<PosterSize, { label: string; ratio: string; width: number; height: number; note: string }> = {
  post: { label: 'Post', ratio: '4:5', width: 2160, height: 2700, note: 'Instagram feed' },
  story: { label: 'Story', ratio: '9:16', width: 2160, height: 3840, note: 'Stories and phone wallpapers' },
  print: { label: 'Print', ratio: '2:3', width: 3000, height: 4500, note: '10 × 15 in at 300 dpi' },
}

/** Designs drawn for particular sizes; the rest fit any */
export const POSTER_DESIGN_SIZES: Partial<Record<PosterDesign, PosterSize[]>> = {
  deep: ['post'],
  story: ['story'],
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
  /** How the skip rate climbs or falls the more times a song has been played */
  wearOut: WearOut
  listener: string
  /** Standout days and runs, for the designs that point them out on the record */
  moments: PosterMoment[]
}

export interface PosterMoment {
  kind: 'day' | 'streak' | 'session' | 'first'
  /** "LONGEST DAY" */
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
}

/** Picks out the moments worth calling out, as grooves and times on the record */
export function posterMoments(model: RecordModel, fun: FunStats, rec: Records): PosterMoment[] {
  const ringOf = (d: Date) => dayNumber(d) - model.firstDay
  const minuteOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
  const out: PosterMoment[] = []
  if (fun.biggestDay) {
    out.push({ kind: 'day', label: 'LONGEST DAY', value: formatDuration(fun.biggestDay.ms), detail: formatDate(fun.biggestDay.date), ring: ringOf(fun.biggestDay.date) })
  }
  if (fun.longestStreak && fun.longestStreak.days > 1) {
    const { start, end, days } = fun.longestStreak
    out.push({ kind: 'streak', label: 'LONGEST STREAK', value: `${formatNumber(days)} days`, detail: `${formatDate(start)} – ${formatDate(end)}`, ring: ringOf(start), ringEnd: ringOf(end) })
  }
  if (rec.marathon) {
    const start = new Date(rec.marathon.start)
    const from = minuteOf(start)
    out.push({
      kind: 'session',
      label: 'LONGEST SESSION',
      value: formatDuration(rec.marathon.ms),
      detail: formatDate(start),
      ring: ringOf(start),
      from,
      to: Math.min(MINUTES, from + (rec.marathon.end - rec.marathon.start) / 60_000),
    })
  }
  if (rec.firstPlay) {
    const d = new Date(rec.firstPlay.date)
    out.push({ kind: 'first', label: 'FIRST SPIN', value: rec.firstPlay.title, detail: rec.firstPlay.artist, ring: ringOf(d), from: minuteOf(d) })
  }
  return out.filter((m) => m.ring >= 0 && m.ring < model.days)
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
  deep: '',
  story: '',
  sleeve: 'One groove per day, from the label out. Midnight at the top, clockwise.',
  annotated: 'Fig. 1. One groove per day, label to rim. Midnight at the top, clockwise.',
  macro: 'One groove per day. Midnight at the top, clockwise.',
  constellation: 'Stars are artists, sized by hours. Lines join artists played back to back.',
  pulse: 'One line per artist, in the order you found them, each scaled to its own peak.',
}

export interface PosterOptions {
  design: PosterDesign
  paper: PosterPaper
  title: string
}

export function renderPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: PosterData, o: PosterOptions) {
  // These two lay themselves out for one size each (see POSTER_DESIGN_SIZES)
  if (o.design === 'deep') return renderDeepPoster(ctx, W, H, data, o.paper)
  if (o.design === 'story') return renderStoryPoster(ctx, W, H, data, o.paper)

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

  // The macro crop is full bleed, with its words on the record's label
  if (o.design === 'macro') {
    macroPoster(ctx, data, W, H, u, pad, p, accent)
    grain(ctx, W, H, p)
    ctx.restore()
    return
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
  // The sleeve carries the title on its cover, so its artwork runs down to the tracklist
  const framed = o.design !== 'sleeve'
  const artTop = pad + 6 * u
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
    const r = s * 0.455
    sticker(ctx, x + s / 2 + r * 0.78, y + s / 2 - r * 0.86, 8 * u, data.listener, accent)
  } else if (o.design === 'sleeve') {
    sleeveArt(ctx, data, o, box, u, p, accent)
  } else if (o.design === 'annotated') {
    annotatedArt(ctx, data, box, u, p, accent)
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
  if (framed) {
    ctx.textAlign = 'left'
    ctx.fillStyle = p.ink
    spacing(ctx, '-0.02em')
    ctx.font = `800 ${titleSize}px ${DISPLAY}`
    ctx.fillText(o.title, pad - 0.3 * u, titleY)
    spacing(ctx, '0px')
    ctx.font = `italic ${4.6 * u}px ${SERIF}`
    ctx.fillStyle = o.paper === 'cream' ? darken(accent) : accent
    ctx.fillText(data.subtitle, pad, subtitleY)
  }

  footer(ctx, data, { listHeadY, listTop, statsY, captionY }, rows, rowH, W, pad, u, p, o.design)
  grain(ctx, W, H, p)
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
    subtitle: `${formatNumber(data.stats.hours)} HRS  ·  ${formatNumber(data.stats.artists)} ARTISTS`,
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
  const day = data.moments.find((m) => m.kind === 'day')
  if (day) highlightDay(ctx, model, x, y, s, day.ring, accent, u)

  // The sleeve, casting a soft shadow onto the record
  const light = o.paper === 'midnight'
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

  // Cover type. The sticker takes one top corner (or the bottom one when the record comes out the top), so the kicker sits in the other
  const cp = S * 0.075
  const inner = S - 2 * cp
  const stickerR = Math.min(8 * u, S * 0.15)
  const stickerAt: [number, number] =
    dir === 'left' ? [sx + stickerR * 0.25, sy + stickerR * 0.25] : dir === 'up' ? [sx + S - stickerR * 0.25, sy + S - stickerR * 0.25] : [sx + S - stickerR * 0.25, sy + stickerR * 0.25]
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = coverInk
  ctx.font = `600 ${S * 0.026}px ${MONO}`
  spacing(ctx, '0.2em')
  ctx.textAlign = dir === 'left' ? 'right' : 'left'
  ctx.fillText(`SIDE A  ·  33⅓ RPM  ·  ${data.recordTitle}`, dir === 'left' ? sx + S - cp : sx + cp, sy + cp + S * 0.026)
  spacing(ctx, '0px')
  ctx.fillStyle = withAlpha(coverInk, 0.25)
  ctx.fillRect(sx + cp, sy + cp + S * 0.05, inner, Math.max(1, 0.1 * u))
  ctx.textAlign = 'left'
  ctx.fillStyle = light ? darken(accent) : accent
  fitText(ctx, data.subtitle, sx + cp, sy + cp + S * 0.16, inner, S * 0.075, `italic {px}px ${SERIF}`)

  // Bottom up: the highlighted day's key (the stats are in the footer already), then the title
  const keyY = sy + S - cp
  let titleBase = keyY
  if (day) {
    const dotR = S * 0.012
    const keyW = dir === 'up' ? inner - stickerR * 1.2 : inner
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = accent
    ctx.lineWidth = dotR * 0.6
    ctx.beginPath()
    ctx.arc(sx + cp + dotR, keyY - dotR * 0.9, dotR, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = coverInk
    ctx.font = `600 ${S * 0.024}px ${MONO}`
    spacing(ctx, '0.16em')
    ctx.fillText(ellipsize(ctx, `${day.label}  ·  ${day.detail.toUpperCase()}  ·  ${day.value.toUpperCase()}`, keyW - dotR * 3), sx + cp + dotR * 3, keyY)
    spacing(ctx, '0px')
    titleBase = keyY - S * 0.075
  }

  // The title, broken onto two lines when that lets it run bigger
  const lines = splitTitle(o.title)
  spacing(ctx, '-0.02em')
  ctx.font = `800 100px ${DISPLAY}`
  const px = Math.min(S * 0.2, ...lines.map((l) => (100 * inner) / Math.max(1, ctx.measureText(l).width)))
  ctx.font = `800 ${px}px ${DISPLAY}`
  ctx.fillStyle = coverInk
  lines.forEach((line, i) => ctx.fillText(line, sx + cp - px * 0.03, titleBase - (lines.length - 1 - i) * px * 0.92))
  spacing(ctx, '0px')

  sticker(ctx, stickerAt[0], stickerAt[1], stickerR, data.listener, accent)
}

/** The record as a numbered figure, with callouts for your standout days in the margins */
function annotatedArt(ctx: CanvasRenderingContext2D, data: PosterData, box: Box, u: number, p: Paper, accent: string) {
  const model = data.record
  const s = Math.min(box.h * 1.04, box.w * 0.62)
  const x = box.x + (box.w - s) / 2
  const y = box.y + (box.h - s) / 2
  placeRecord(ctx, data, x, y, s, u, p, accent)
  const g = recordGeometry(s, model.days)
  const cx = x + g.center
  const cy = y + g.center
  // Streaks run across many grooves, so they're bracketed along a quiet radius, just past the month labels
  const streakMinute = (quietestMinute(model) + 75) % MINUTES

  const marks = data.moments.slice(0, 4).map((m, i) => {
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
  const blockH = 8.2 * u
  const gap = 10 * u
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
    const mid = top + 2.9 * u
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
    ctx.font = `600 ${1.15 * u}px ${MONO}`
    spacing(ctx, '0.08em')
    ctx.fillText(ellipsize(ctx, `${mark.n}  ${mark.m.label}`, colW), tx, top + 1.3 * u)
    spacing(ctx, '0px')
    ctx.fillStyle = p.ink
    ctx.font = `650 ${2.3 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, mark.m.value, colW), tx, top + 4.2 * u)
    ctx.fillStyle = p.muted
    ctx.font = `500 ${1.15 * u}px ${MONO}`
    // A date range that won't fit breaks after the dash
    const detail = mark.m.detail
    const lines = ctx.measureText(detail).width > colW && detail.includes(' – ') ? detail.replace(' – ', ' –\n').split('\n') : [detail]
    lines.forEach((line, i) => ctx.fillText(ellipsize(ctx, line, colW), tx, top + (6.2 + i * 1.6) * u))
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = p.muted
  ctx.font = `italic ${2.6 * u}px ${SERIF}`
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
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(k, k)
  ctx.translate(-W / 2, -W / 2)
  drawRecord(ctx, model, {
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
  })
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
  const tags: { x0: number; x1: number; y0: number; y1: number }[] = []
  for (const m of [day, session]) {
    if (!m) continue
    const inQuarter = (min: number) => Math.floor(min / 360) === best
    const preferred = m.from !== undefined && m.to !== undefined ? (m.from + m.to) / 2 : busiestMinute(model, m.ring)
    const pt = groovePoint(model, origin.x, origin.y, size, m.ring, inQuarter(preferred) ? preferred : best * 360 + 180)
    const fromCenter = Math.hypot(pt.x - cx, pt.y - cy)
    if (pt.x < pad || pt.x > W - pad || pt.y < pad + 4 * u || pt.y > H - pad - 4 * u || fromCenter < lr + 4 * u) continue

    const text = `${m.label}  ·  ${m.detail.toUpperCase()}  ·  ${m.value.toUpperCase()}`
    ctx.font = `600 ${1.35 * u}px ${MONO}`
    spacing(ctx, '0.14em')
    const tw = Math.min(ctx.measureText(text).width, W - 2 * pad - 2.4 * u)
    const th = 3 * u
    const above = pt.y > H / 2
    const ty = above ? pt.y - 6 * u - th : pt.y + 6 * u
    const tx = Math.min(Math.max(pt.x - tw / 2 - 1.2 * u, pad), W - pad - tw - 2.4 * u)
    const box = { x0: tx, x1: tx + tw + 2.4 * u, y0: ty, y1: ty + th }
    if (tags.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 + u && box.y1 > b.y0 - u)) {
      spacing(ctx, '0px')
      continue
    }
    tags.push(box)

    if (m.kind === 'session' && m.from !== undefined && m.to !== undefined) {
      const r = g.inner + (m.ring + 0.5) * g.ring
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(g.ring * 1.6, 0.25 * u)
      ctx.beginPath()
      ctx.arc(cx, cy, r, (m.from / MINUTES) * TAU - Math.PI / 2, Math.max((m.to / MINUTES) * TAU - Math.PI / 2, (m.from / MINUTES) * TAU - Math.PI / 2 + 0.01))
      ctx.stroke()
    }
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
    ctx.arc(pt.x, pt.y, 0.6 * u, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(11, 10, 15, 0.88)'
    roundRect(ctx, box.x0, box.y0, box.x1 - box.x0, th, th / 2)
    ctx.fill()
    ctx.fillStyle = '#f4f1ea'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(ellipsize(ctx, text, tw), tx + 1.2 * u, ty + th / 2 + 0.1 * u)
    spacing(ctx, '0px')
  }

  // Type on the label, tucked into the corner
  const right = cx > 0
  const bottom = cy > 0
  const tx = right ? W - pad : pad
  const tw = lr * 0.56
  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = right ? 'right' : 'left'
  ctx.textBaseline = 'alphabetic'
  spacing(ctx, '-0.02em')
  const ts = measureFit(ctx, data.recordTitle, tw, 12 * u, `800 {px}px ${DISPLAY}`)
  spacing(ctx, '0px')
  const stack = [1.5 * u, ts * 0.78 + 2 * u, 5 * u, 3.2 * u]
  const total = stack.reduce((a, b) => a + b, 0)
  let at = bottom ? H - pad - total : pad
  at += stack[0]
  ctx.font = `600 ${1.5 * u}px ${MONO}`
  spacing(ctx, '0.22em')
  ctx.fillText('A LISTENING RECORD', tx, at)
  spacing(ctx, '-0.02em')
  at += stack[1]
  ctx.font = `800 ${ts}px ${DISPLAY}`
  ctx.fillText(data.recordTitle, tx - (right ? -0.3 : 0.3) * u, at)
  spacing(ctx, '0px')
  at += stack[2]
  fitText(ctx, data.subtitle, tx, at, tw, 4 * u, `italic {px}px ${SERIF}`)
  at += stack[3]
  ctx.font = `600 ${1.35 * u}px ${MONO}`
  spacing(ctx, '0.14em')
  ctx.fillText(ellipsize(ctx, `${formatNumber(data.stats.hours)} HRS  ·  ${formatNumber(data.stats.artists)} ARTISTS`, tw), tx, at)
  spacing(ctx, '0px')

  // A key to the colors in the far corner, mostly over bare paper past the rim
  const fx = right ? pad : W - pad
  const fy = bottom ? pad : H - pad
  const items = data.tracklist.slice(0, 4)
  const rowH = 2.9 * u
  const cw = 30 * u
  const ch = 4.4 * u + items.length * rowH + 1.2 * u
  const kx = right ? fx : fx - cw
  const ky = bottom ? fy : fy - ch
  ctx.fillStyle = 'rgba(11, 10, 15, 0.86)'
  roundRect(ctx, kx, ky, cw, ch, 1.2 * u)
  ctx.fill()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `700 ${1.3 * u}px ${MONO}`
  spacing(ctx, '0.2em')
  ctx.fillText('ON RECORD ●', kx + 1.6 * u, ky + 2.8 * u)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(244, 241, 234, 0.6)'
  ctx.fillText(data.period, kx + cw - 1.6 * u, ky + 2.8 * u)
  spacing(ctx, '0px')
  items.forEach((item, i) => {
    const base = ky + 4.4 * u + (i + 0.75) * rowH
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(kx + 2.2 * u, base - 0.55 * u, 0.6 * u, 0, TAU)
    ctx.fill()
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(244, 241, 234, 0.6)'
    ctx.font = `500 ${1.3 * u}px ${MONO}`
    const hours = formatNumber(item.ms / 3_600_000)
    ctx.fillText(hours, kx + cw - 1.6 * u, base)
    const hw = ctx.measureText(hours).width
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f4f1ea'
    ctx.font = `650 ${1.8 * u}px ${DISPLAY}`
    ctx.fillText(ellipsize(ctx, item.name, cw - 5.4 * u - hw), kx + 3.6 * u, base)
  })
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
