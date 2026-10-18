import { area, curveBasis, line, stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { Bins, Daypart, DayTotal, Era, GraphLink, GraphNode, HourSlot, Profile, RaceData, Records, SongStat } from '../data/insights'
import { artistSeries } from '../data/insights'
import { dayNumber, fromDayNumber, type FunStats, type Ranked, type Summary } from '../data/stats'
import {
  formatDate,
  formatDuration,
  formatHour,
  formatHours,
  formatMonthRange,
  formatMonthShort,
  formatMonthYear,
  formatMonthYearShort,
  formatNumber,
  formatPercent,
} from '../lib/format'
import { prefersReducedMotion } from '../lib/hooks'
import { SERIES, colorFor, heatStep, quantileThresholds } from '../lib/palette'
import { starSize, trimGraph, type Layout } from '../viz/constellation'
import { renderPoster, type PosterData } from '../viz/poster'
import { createPress, drawDisc } from '../viz/pressing'
import { recordGeometry, type RecordModel } from '../viz/record'
import { Cover } from './Cover'
import { Radar } from './LinerNotes'

/*
 * One slide per track of the record, for The Long Play. Each is a pocket
 * version of its chapter: the same data and encodings, sized for a phone
 * held upright, with the one thing worth knowing written underneath.
 */

/** Everything the slides draw from, all already worked out by the dashboard */
export interface PlaybackData {
  year: number | null
  /** "2023–2026" or "2025" */
  period: string
  summary: Summary
  model: RecordModel
  slotColors: string[]
  colors: Map<string, string>
  /** Top artists in view, the colored ones first */
  legend: string[]
  bins: Bins
  totals: Map<string, number>[]
  eras: Era[]
  race: RaceData
  hours: HourSlot[]
  parts: Daypart[]
  days: Map<number, DayTotal>
  songs: SongStat[]
  graph: { nodes: GraphNode[]; links: GraphLink[]; layout: Layout }
  /** Colored top artists, in the order you found them */
  pulse: string[]
  firstHeard: Map<string, number>
  topArtists: Ranked[]
  topSong: Ranked | undefined
  fun: FunStats
  rec: Records
  profile: Profile
  poster: PosterData
}

export interface SlideProps {
  data: PlaybackData
  /** The story is on hold: anything that plays out over time waits */
  paused: boolean
}

const PAPER = '#f4f1ea'

/** The words under every chart: what you're looking at, then what it says */
function Words({ lede, children }: { lede: ReactNode; children?: ReactNode }) {
  return (
    <div className="lp__words">
      {children && <p className="lp__takeaway">{children}</p>}
      <p className="lp__lede">{lede}</p>
    </div>
  )
}

function NotEnough() {
  return <p className="lp__empty">Not enough music in this period to draw this one.</p>
}

/** The size of an element's content box, kept up to date */
function useBox(ref: RefObject<HTMLElement | null>): { w: number; h: number } | null {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return box
}

/**
 * Plays 0 → 1 over `duration` ms, holding while paused. Reduced motion jumps
 * straight to the end.
 */
function usePlayhead(duration: number, paused: boolean): number {
  const reduced = prefersReducedMotion()
  const [t, setT] = useState(reduced ? 1 : 0)
  const elapsed = useRef(0)
  useEffect(() => {
    if (paused || reduced) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      elapsed.current += Math.max(0, now - last)
      last = now
      const next = Math.min(1, elapsed.current / duration)
      setT(next)
      if (next < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, paused, reduced])
  return t
}

function eraName(artist: string): string {
  return /^the\s/i.test(artist) ? `${artist} era` : `The ${artist} era`
}

// ---------- The sleeve ----------

export function Sleeve({ data, tracks, sides }: SlideProps & { tracks: { id: string; num: string; title: string }[]; sides: Record<string, string> }) {
  return (
    <div className="lp__sleeve">
      <BlankRecord data={data} />
      <div className="lp__sleeve-copy">
        <p className="lp__takeaway">
          Your <em>{data.period}</em>, played back one track at a time.
        </p>
        <div className="lp__tracklist">
          {Object.entries(sides).map(([side, title]) => {
            const onSide = tracks.filter((t) => t.num.startsWith(side))
            // A podcast-only period plays a shorter record, without the sides it can't draw
            if (onSide.length === 0) return null
            return (
              <div key={side}>
                <p className="lp__tracklist-side">
                  Side {side} <span>{title}</span>
                </p>
                <ol>
                  {onSide.map((t) => (
                    <li key={t.id}>
                      <span>{t.num}</span>
                      {t.title}
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The record before anything's pressed into it, needle up */
function BlankRecord({ data }: { data: PlaybackData }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useBox(boxRef)
  const S = box ? Math.floor(Math.min(box.w, box.h)) : 0
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!S || !canvas) return
    const ctx = sizeCanvas(canvas, S)
    const draw = () => drawDisc(ctx, S, data.model.days, data.period, PAPER)
    draw()
    document.fonts?.ready.then(draw)
  }, [S, data.model, data.period])

  return (
    <div className="lp__platter" ref={boxRef}>
      <div className="lp__disc" style={{ width: S, height: S }}>
        <div className="lp__spin">
          <canvas ref={canvasRef} />
        </div>
        <div className="lp__sheen" style={{ inset: S * (0.5 - 0.432) }} />
        {S > 0 && <Tonearm size={S} radius={null} />}
      </div>
    </div>
  )
}

function sizeCanvas(canvas: HTMLCanvasElement, size: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = canvas.height = Math.round(size * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

// ---------- A1 The Record ----------

const PRESS_MS = 3800

export function RecordSlide({ data, paused }: SlideProps) {
  const { model, fun, summary } = data
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useBox(boxRef)
  const S = box ? Math.floor(Math.min(box.w, box.h)) : 0
  const baseRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef<HTMLCanvasElement>(null)
  const press = useRef<ReturnType<typeof createPress> | null>(null)
  const t = usePlayhead(PRESS_MS, paused)
  // Ease out, so the needle settles into the last grooves
  const ring = Math.round((1 - Math.pow(1 - t, 3)) * (model.days - 1))

  useEffect(() => {
    const base = baseRef.current
    const layer = dataRef.current
    if (!S || !base || !layer) return
    const baseCtx = sizeCanvas(base, S)
    const draw = () => drawDisc(baseCtx, S, model.days, data.period, PAPER)
    draw()
    document.fonts?.ready.then(draw)
    press.current = createPress(sizeCanvas(layer, S), null, model, S, data.slotColors)
  }, [S, model, data.period, data.slotColors])

  useEffect(() => {
    press.current?.pressTo(ring)
  }, [ring, S])

  const g = recordGeometry(S || 1, model.days)
  const done = t >= 1
  return (
    <>
      <div className="lp__platter" ref={boxRef}>
        <div className="lp__disc" style={{ width: S, height: S }}>
          <div className="lp__spin">
            <canvas ref={baseRef} />
            <canvas ref={dataRef} />
          </div>
          <div className="lp__sheen" style={{ inset: S * (0.5 - 0.432) }} />
          {S > 0 && <Tonearm size={S} radius={g.inner + (ring + 0.5) * g.ring} />}
        </div>
      </div>
      <p className="lp__readout" aria-hidden="true">
        {done ? `${formatNumber(model.days)} grooves` : formatMonthYear(fromDayNumber(model.firstDay + ring))}
      </p>
      <Words lede="One groove per day, pressed from the label out. Each arc is a song, placed by the time of day it played.">
        {formatNumber(summary.activeDays)} days with music.
        {fun.biggestDay && (
          <>
            {' '}
            The biggest was <em>{formatDate(fun.biggestDay.date)}</em>: {formatDuration(fun.biggestDay.ms)}.
          </>
        )}
      </Words>
    </>
  )
}

/**
 * The record chapter's tonearm: it pivots near the top-right corner, and
 * solving the triangle (pivot, center, stylus) lands the stylus on a groove.
 * With no groove it hangs straight down, off the record.
 */
function Tonearm({ size: S, radius }: { size: number; radius: number | null }) {
  const px = 0.97 * S
  const py = 0.04 * S
  const L = 0.52 * S
  const dx = px - S / 2
  const dy = py - S / 2
  const M = Math.hypot(dx, dy)
  const k = ((radius ?? 0) ** 2 - M * M - L * L) / (2 * L)
  const theta = Math.acos(Math.max(-1, Math.min(1, k / M))) - Math.atan2(dx, dy)
  const deg = radius === null ? 0 : (theta * 180) / Math.PI
  return (
    <svg className="lp__arm" viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
      <g className="tonearm">
        <circle cx={px} cy={py} r={0.05 * S} className="tonearm__base" />
        <g className="tonearm__arm" style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${px}px ${py}px` }}>
          <rect x={px - 0.028 * S} y={py - 0.12 * S} width={0.056 * S} height={0.06 * S} rx={0.01 * S} className="tonearm__weight" />
          <line x1={px} y1={py - 0.07 * S} x2={px} y2={py + L - 0.04 * S} className="tonearm__rod" strokeWidth={Math.max(2, 0.011 * S)} />
          <rect x={px - 0.02 * S} y={py + L - 0.06 * S} width={0.04 * S} height={0.07 * S} rx={0.008 * S} className="tonearm__head" />
          <circle cx={px} cy={py + L} r={Math.max(2, 0.006 * S)} className="tonearm__stylus" />
        </g>
        <circle cx={px} cy={py} r={0.018 * S} className="tonearm__cap" />
      </g>
    </svg>
  )
}

// ---------- A2 Eras ----------

export function ErasSlide({ data }: SlideProps) {
  const { bins, totals, eras, colors } = data
  const artists = useMemo(() => data.legend.slice(0, 8), [data.legend])
  const W = 360
  const H = 200
  const n = bins.starts.length

  const layers = useMemo(() => {
    const series = artistSeries(totals, artists, bins.size === 'month' ? 1 : 2)
    const rows = bins.starts.map((_, i) => Object.fromEntries(artists.map((a) => [a, series.get(a)![i]])))
    return stack<Record<string, number>>().keys(artists).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows)
  }, [bins, totals, artists])

  if (artists.length === 0 || n < 2) return <NotEnough />

  let lo = Infinity
  let hi = -Infinity
  for (const layer of layers) {
    for (const d of layer) {
      lo = Math.min(lo, d[0])
      hi = Math.max(hi, d[1])
    }
  }
  const span = hi - lo || 1
  const top = 4
  const innerH = H - top - 22
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => top + innerH - ((v - lo) / span) * innerH
  const path = area<[number, number]>()
    .x((_, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveBasis)

  // Name the three thickest streams where they're thickest
  const labels = layers
    .map((layer) => {
      let best = 0
      layer.forEach((d, i) => {
        if (d[1] - d[0] > layer[best][1] - layer[best][0]) best = i
      })
      const d = layer[best]
      const half = layer.key.length * 3.4 + 4
      return { key: layer.key, x: Math.max(half, Math.min(W - half, x(best))), y: y((d[0] + d[1]) / 2), thick: ((d[1] - d[0]) / span) * innerH }
    })
    .filter((l) => l.thick > 17)
    .sort((a, b) => b.thick - a.thick)
    .slice(0, 3)

  const ticks = bins.starts.flatMap((t, i) => {
    const d = new Date(t)
    if (bins.size === 'month') return d.getMonth() === 0 && i > 0 ? [{ i, label: String(d.getFullYear()) }] : []
    const prev = new Date(bins.starts[i - 1] ?? t)
    return i > 0 && prev.getMonth() !== d.getMonth() && d.getMonth() % 3 === 0 ? [{ i, label: formatMonthShort(d.getMonth()) }] : []
  })

  const shown = [...eras]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .sort((a, b) => a.start - b.start)
  const range = (era: Era) => formatMonthRange(bins.starts[era.start], bins.starts[era.end])
  const longest = eras.reduce<Era | null>((a, b) => (!a || b.end - b.start > a.end - a.start ? b : a), null)
  const latest = eras.reduce<Era | null>((a, b) => (!a || b.start > a.start ? b : a), null)

  return (
    <>
      <div className="lp__chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="lp__svg lp__wipe" role="img" aria-label={`Streamgraph of your top ${artists.length} artists over time`}>
          {layers.map((layer) => (
            <path key={layer.key} d={path(layer as unknown as [number, number][]) ?? ''} fill={colorFor(colors, layer.key)} className="lp__stream" />
          ))}
          {labels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" className="lp__stream-label">
              {l.key}
            </text>
          ))}
          {ticks.map((t) => (
            <text key={t.i} x={x(t.i)} y={H - 4} textAnchor="middle" className="lp__axis">
              {t.label}
            </text>
          ))}
        </svg>
        {shown.length > 0 && (
          <ul className="lp__eras">
            {shown.map((era) => (
              <li key={`${era.artist}-${era.start}`} style={{ '--c': colorFor(colors, era.artist) } as CSSProperties}>
                <b>{eraName(era.artist)}</b>
                <span>
                  {range(era)}, {formatPercent(era.share)} of your music
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Words lede="Your top artists over time. Thicker means more hours.">
        {!longest || !latest ? (
          'No one artist stayed on top for long, so there are no eras. Just a mix.'
        ) : (
          <>
            {eras.length === 1 ? 'One era' : `${eras.length} eras`}. The longest was <em>{longest.artist}</em>
            {latest === longest ? '.' : <>, and the latest is <em>{latest.artist}</em>.</>}
          </>
        )}
      </Words>
    </>
  )
}

// ---------- A3 The Race ----------

const RACE_ROWS = 6
const RACE_MS = 6500

export function RaceSlide({ data, paused }: SlideProps) {
  const { race, bins, colors } = data
  const frames = race.frames
  const n = race.names.length
  const t = usePlayhead(RACE_MS, paused) * Math.max(frames - 1, 0)

  // How often first place changed hands over the whole race
  const { changes, winner } = useMemo(() => {
    let leader = -1
    let changes = 0
    for (let f = 0; f < frames; f++) {
      let best = -1
      for (let i = 0; i < n; i++) if (race.values[f * n + i] > (best < 0 ? 0 : race.values[f * n + best])) best = i
      if (best >= 0 && leader >= 0 && best !== leader) changes++
      if (best >= 0) leader = best
    }
    return { changes, winner: leader }
  }, [race, frames, n])

  if (n < 2 || frames < 2 || winner < 0) return <NotEnough />

  const f0 = Math.min(Math.floor(t), frames - 1)
  const f1 = Math.min(frames - 1, f0 + 1)
  const frac = t - f0
  const values = race.names.map((name, i) => {
    const a = race.values[f0 * n + i]
    const b = race.values[f1 * n + i]
    return { name, ms: a + (b - a) * frac }
  })
  const ranked = [...values].sort((a, b) => b.ms - a.ms)
  const rank = new Map(ranked.map((v, i) => [v.name, i]))
  const max = ranked[0].ms || 1
  const finalMs = race.values[(frames - 1) * n + winner]

  return (
    <>
      <div className="lp__chart">
        <p className="lp__race-date" aria-hidden="true">
          {bins.size === 'month' ? formatMonthYearShort(bins.starts[f0]) : formatDate(bins.starts[f0])}
        </p>
        <div className="lp__race" style={{ '--rows': RACE_ROWS } as CSSProperties} aria-hidden="true">
          {values.map(({ name, ms }) => {
            const r = rank.get(name)!
            if (r >= RACE_ROWS + 1 || ms <= 0) return null
            return (
              <div
                key={name}
                className="lp__race-row"
                style={{ transform: `translateY(${r * 100}%)`, opacity: r < RACE_ROWS ? 1 : 0, '--c': colorFor(colors, name) } as CSSProperties}
              >
                <span className="lp__race-name">{name}</span>
                <span className="lp__race-bar" style={{ width: `${Math.max(1.5, (ms / max) * 100)}%` }} />
                <span className="lp__race-ms">{formatHours(ms)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <Words lede={`Total hours per artist, replayed ${bins.size} by ${bins.size}.`}>
        <em>{race.names[winner]}</em> finished first with {formatHours(finalMs)}.{' '}
        {changes === 0 ? 'They led from start to finish.' : changes === 1 ? 'The lead changed hands once.' : `The lead changed hands ${changes} times.`}
      </Words>
    </>
  )
}

// ---------- B1 Around the Clock ----------

/** A ring segment between two radii and two angles (radians clockwise from the top), around (c, c) */
function sector(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const at = (r: number, a: number) => `${c + r * Math.sin(a)},${c - r * Math.cos(a)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${at(r0, a0)} L${at(r1, a0)} A${r1},${r1} 0 ${large} 1 ${at(r1, a1)} L${at(r0, a1)} A${r0},${r0} 0 ${large} 0 ${at(r0, a0)} Z`
}

export function ClockSlide({ data }: SlideProps) {
  const { hours, parts } = data
  const C = 150
  const INNER = 46
  const OUTER = 128
  const max = Math.max(...hours.map((h) => h.ms), 1)
  const total = hours.reduce((s, h) => s + h.ms, 0) || 1
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])
  const night = hours.filter((h) => h.hour >= 21 || h.hour < 5).reduce((s, h) => s + h.ms, 0) / total
  const step = (Math.PI * 2) / 24
  const afterHours = parts[0]?.artist

  return (
    <>
      <div className="lp__chart">
        <svg viewBox="0 0 300 300" className="lp__svg lp__clock" role="img" aria-label={`Listening by hour of day. Peak: ${formatHour(peak.hour)}.`}>
          {[0.5, 1].map((f) => (
            <circle key={f} cx={C} cy={C} r={INNER + (OUTER - INNER) * f} className="lp__ring" />
          ))}
          {hours.map((h) => (
            <path
              key={h.hour}
              d={sector(C, INNER, INNER + Math.max(2, (h.ms / max) * (OUTER - INNER)), h.hour * step + 0.03, (h.hour + 1) * step - 0.03)}
              className={h.hour === peak.hour ? 'lp__wedge is-peak' : 'lp__wedge'}
              style={{ '--i': h.hour } as CSSProperties}
            />
          ))}
          {[0, 6, 12, 18].map((h) => {
            const a = h * step
            return (
              <text key={h} x={C + (OUTER + 14) * Math.sin(a)} y={C - (OUTER + 14) * Math.cos(a)} textAnchor="middle" dominantBaseline="middle" className="lp__axis">
                {formatHour(h).replace(' ', '').toLowerCase()}
              </text>
            )
          })}
          <text x={C} y={C - 6} textAnchor="middle" className="lp__clock-peak">
            {formatHour(peak.hour)}
          </text>
          <text x={C} y={C + 16} textAnchor="middle" className="lp__axis">
            peak hour
          </text>
        </svg>
        <dl className="lp__parts">
          {parts.map((p) => (
            <div key={p.label}>
              <dt>{p.label}</dt>
              <dd>{p.artist ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Words lede="Listening by hour of the day. Midnight is at the top.">
        {formatPercent(night)} of it happens between 9 PM and 5 AM.
        {afterHours && (
          <>
            {' '}
            After hours, you reach for <em>{afterHours}</em>.
          </>
        )}
      </Words>
    </>
  )
}

// ---------- B2 Every Day ----------

export function DaysSlide({ data }: SlideProps) {
  const { days, model, summary, fun } = data
  const firstYear = fromDayNumber(model.firstDay).getFullYear()
  const lastYear = fromDayNumber(model.firstDay + model.days - 1).getFullYear()
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i)
  const thresholds = useMemo(() => quantileThresholds([...days.values()].map((d) => d.ms)), [days])

  const W = 360
  const cell = W / 54
  const blockH = cell * 7 + 18
  const H = years.length * blockH

  return (
    <>
      <div className="lp__chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="lp__svg lp__wipe" role="img" aria-label="Calendar heatmap, one square per day">
          {years.map((year, row) => {
            const jan1 = new Date(year, 0, 1)
            const first = dayNumber(jan1)
            const last = dayNumber(new Date(year, 11, 31))
            const monday = first - ((jan1.getDay() + 6) % 7)
            const top = row * blockH + 16
            const cells: ReactNode[] = []
            for (let d = first; d <= last; d++) {
              const v = days.get(d)
              cells.push(
                <rect
                  key={d}
                  x={Math.floor((d - monday) / 7) * cell}
                  y={top + ((d - monday) % 7) * cell}
                  width={cell - 1.2}
                  height={cell - 1.2}
                  rx={1}
                  fill={v ? heatStep(v.ms, thresholds) : 'rgba(244, 241, 234, 0.05)'}
                />,
              )
            }
            return (
              <g key={year}>
                <text x={0} y={top - 5} className="lp__axis lp__axis--start">
                  {year}
                </text>
                {cells}
              </g>
            )
          })}
        </svg>
      </div>
      <Words lede="A square for every day. The brighter it glows, the longer you listened.">
        Music on {formatNumber(summary.activeDays)} of {formatNumber(model.days)} days.
        {fun.longestStreak && fun.longestStreak.days > 1 && <> Your longest run: {formatNumber(fun.longestStreak.days)} days in a row.</>}
      </Words>
    </>
  )
}

// ---------- B3 Love / Hate ----------

export function LoveHateSlide({ data }: SlideProps) {
  const { songs, summary } = data
  const W = 360
  const H = 210
  const M = { top: 8, right: 8, bottom: 20, left: 34 }

  const picks = useMemo(() => {
    if (songs.length === 0) return []
    const minPlays = Math.min(...songs.map((s) => s.plays))
    const maxPlays = Math.max(...songs.map((s) => s.plays))
    const midPlays = Math.sqrt(minPlays * maxPlays)
    const rate = (s: SongStat) => s.skips / s.plays
    // The best-scoring song, or none if nothing scores at all, so no song gets a tag it didn't earn
    const best = (score: (s: SongStat) => number) => {
      const top = songs.reduce((b, s) => (score(s) > score(b) ? s : b), songs[0])
      return score(top) > 0 ? top : null
    }
    const all = [
      { song: best((s) => s.plays * (1 - rate(s)) ** 3), tag: 'The keeper', color: SERIES[3] },
      { song: best((s) => (s.plays >= midPlays ? s.plays * rate(s) ** 2 : 0)), tag: 'Can’t quit it, can’t finish it', color: SERIES[0] },
      { song: best((s) => (s.plays >= 6 ? rate(s) : 0)), tag: 'Instant skip', color: SERIES[2] },
    ].filter((p): p is { song: SongStat; tag: string; color: string } => p.song !== null)
    return all.filter((p, i) => all.findIndex((q) => q.song.key === p.song.key) === i)
  }, [songs])

  if (songs.length < 5) return <NotEnough />

  const minPlays = Math.min(...songs.map((s) => s.plays))
  const maxPlays = Math.max(...songs.map((s) => s.plays))
  const maxMs = Math.max(...songs.map((s) => s.ms), 1)
  const innerW = W - M.left - M.right
  const innerH = H - M.top - M.bottom
  const logMin = Math.log(minPlays * 0.9)
  const logMax = Math.log(maxPlays * 1.1)
  const x = (plays: number) => M.left + ((Math.log(plays) - logMin) / (logMax - logMin || 1)) * innerW
  const y = (rate: number) => M.top + (1 - rate) * innerH
  const picked = new Map(picks.map((p) => [p.song.key, p.color]))

  return (
    <>
      <div className="lp__chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="lp__svg" role="img" aria-label="Your most played songs by plays and skip rate">
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="lp__grid" />
              <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="lp__axis">
                {formatPercent(t)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={W - M.right} y1={y(summary.skipRate)} y2={y(summary.skipRate)} className="lp__grid lp__grid--mid" />
          <text x={W - M.right} y={H - 4} textAnchor="end" className="lp__axis">
            more plays →
          </text>
          {songs.map((s, i) =>
            picked.has(s.key) ? null : (
              <circle key={s.key} cx={x(s.plays)} cy={y(s.skips / s.plays)} r={1.6 + Math.sqrt(s.ms / maxMs) * 6} className="lp__dot" style={{ '--i': i % 40 } as CSSProperties} />
            ),
          )}
          {picks.map((p, i) => (
            <g key={p.song.key}>
              <circle cx={x(p.song.plays)} cy={y(p.song.skips / p.song.plays)} r={8} fill={p.color} stroke="#0b0a0f" strokeWidth={2} />
              <text x={x(p.song.plays)} y={y(p.song.skips / p.song.plays) + 0.5} textAnchor="middle" dominantBaseline="middle" className="lp__pick-num">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
        <ol className="lp__picks">
          {picks.map((p) => (
            <li key={p.song.key} style={{ '--c': p.color } as CSSProperties}>
              <Cover name={`${p.song.title}|${p.song.artist}`} size={40} />
              <div>
                <span>{p.tag}</span>
                <b>{p.song.title}</b>
                <small>
                  {p.song.artist}, skipped {formatPercent(p.song.skips / p.song.plays)}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Words lede="Your most-played songs: further right, more plays. Higher up, more skips. The line is your average." >
        You skip {formatPercent(summary.skipRate)} of the songs you start.
      </Words>
    </>
  )
}

// ---------- C1 Constellation ----------

export function ConstellationSlide({ data }: SlideProps) {
  const { colors } = data
  const { nodes, links } = trimGraph(data.graph.nodes, data.graph.links, 14)
  if (nodes.length < 3) return <NotEnough />

  const W = 360
  const H = 340
  const pad = 32
  const pts = nodes.map((n) => data.graph.layout.get(n.id) ?? { x: 0, y: 0 })
  const x0 = Math.min(...pts.map((p) => p.x))
  const x1 = Math.max(...pts.map((p) => p.x))
  const y0 = Math.min(...pts.map((p) => p.y))
  const y1 = Math.max(...pts.map((p) => p.y))
  const k = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1))
  const pos = new Map(nodes.map((n, i) => [n.id, { x: W / 2 + (pts[i].x - (x0 + x1) / 2) * k, y: H / 2 + (pts[i].y - (y0 + y1) / 2) * k }]))
  const maxMs = nodes[0].ms
  const maxCount = Math.max(...links.map((l) => l.count), 1)
  const strongest = links.reduce<GraphLink | null>((a, b) => (!a || b.count > a.count ? b : a), null)
  const radius = (n: GraphNode) => Math.max(3, starSize(n.ms, maxMs) * 0.7)

  // Names for the biggest stars, below each one, or above it, or not at all if both would collide
  const placed: { x: number; y: number; w: number }[] = []
  const labels = new Map<string, number>()
  for (const node of nodes.slice(0, 8)) {
    const p = pos.get(node.id)!
    const w = node.id.length * 6.6
    for (const y of [p.y + radius(node) + 13, p.y - radius(node) - 5]) {
      const hits = placed.some((b) => Math.abs(b.x - p.x) < (b.w + w) / 2 + 4 && Math.abs(b.y - y) < 14)
      if (!hits) {
        placed.push({ x: p.x, y, w })
        labels.set(node.id, y)
        break
      }
    }
  }

  return (
    <>
      <div className="lp__chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="lp__svg lp__sky" role="img" aria-label="Your top artists, joined when you play one straight after the other">
          {links.map((l) => {
            const a = pos.get(l.source)!
            const b = pos.get(l.target)!
            const on = l === strongest
            return (
              <line
                key={`${l.source}|${l.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={on ? 'lp__link is-on' : 'lp__link'}
                strokeWidth={on ? 2.4 : 0.6 + (l.count / maxCount) * 1.8}
              />
            )
          })}
          {nodes.map((n, i) => {
            const p = pos.get(n.id)!
            const y = labels.get(n.id)
            return (
              <g key={n.id} className="lp__star" style={{ '--i': i } as CSSProperties}>
                <circle cx={p.x} cy={p.y} r={radius(n)} fill={colorFor(colors, n.id)} />
                {y !== undefined && (
                  <text x={p.x} y={y} textAnchor="middle" className="lp__star-label">
                    {n.id}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <Words lede="Your top artists as stars, joined when you play one straight after the other. Clusters are your scenes.">
        {strongest ? (
          <>
            <em>{strongest.source}</em> and <em>{strongest.target}</em> are your most-worn path: {formatNumber(strongest.count)} times back to back.
          </>
        ) : (
          'No two artists stick together yet.'
        )}
      </Words>
    </>
  )
}

// ---------- C2 Pulse ----------

export function PulseSlide({ data }: SlideProps) {
  const { bins, totals, colors, firstHeard } = data
  const artists = data.pulse
  const series = useMemo(() => artistSeries(totals, artists, bins.size === 'month' ? 1 : 2), [totals, artists, bins])
  if (artists.length < 2) return <NotEnough />

  const W = 360
  const step = 19
  const amp = 58
  const head = amp + 4
  const H = head + step * (artists.length - 1) + 8
  const n = bins.starts.length
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const first = artists[0]
  const newest = artists[artists.length - 1]
  const found = (a: string) => (firstHeard.has(a) ? formatMonthYearShort(firstHeard.get(a)!) : null)

  return (
    <>
      <div className="lp__chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="lp__svg" role="img" aria-label="Ridgeline of your top artists over time, in the order you found them">
          {artists.map((artist, row) => {
            const values = series.get(artist)!
            const peak = Math.max(...values, 1)
            const base = head + row * step
            const points = values.map((v, i) => [x(i), base - (v / peak) * amp] as [number, number])
            return (
              <g key={artist} className="lp__ridge" style={{ '--c': colorFor(colors, artist), '--i': row } as CSSProperties}>
                <path d={area<[number, number]>().x((d) => d[0]).y0(base).y1((d) => d[1]).curve(curveBasis)(points) ?? ''} className="lp__ridge-fill" />
                <path d={line().curve(curveBasis)(points) ?? ''} className="lp__ridge-line" />
              </g>
            )
          })}
          {/* Each name sits where its line starts, drawn last so no ridge covers it */}
          {artists.map((artist, row) => {
            const values = series.get(artist)!
            const start = Math.max(0, values.findIndex((v) => v > Math.max(...values) * 0.04))
            return (
              <text
                key={artist}
                x={Math.min(x(start), W - artist.length * 6)}
                y={head + row * step - 3}
                className="lp__ridge-label"
                style={{ '--c': colorFor(colors, artist), '--i': row } as CSSProperties}
              >
                {artist}
              </text>
            )
          })}
        </svg>
      </div>
      <Words lede="Your top artists over time, one line each, top to bottom in the order you found them. Yes, it’s that album cover.">
        It starts with <em>{first}</em>
        {found(first) && <>, {found(first)}</>}, and runs down to <em>{newest}</em>
        {found(newest) && <>, found {found(newest)}</>}.
      </Words>
    </>
  )
}

// ---------- C3 The Charts ----------

export function ChartsSlide({ data }: SlideProps) {
  const top = data.topArtists.slice(0, 5)
  if (top.length === 0) return <NotEnough />
  const max = top[0].ms || 1
  const song = data.topSong

  return (
    <>
      <div className="lp__chart">
        <ol className="lp__chartlist">
          {top.map((a, i) => (
            <li key={a.key} style={{ '--i': i, '--c': colorFor(data.colors, a.label) } as CSSProperties}>
              <span className="lp__rank">{i + 1}</span>
              <Cover name={a.label} size={48} />
              <div>
                <b>{a.label}</b>
                <span>{formatDuration(a.ms)}</span>
                <i style={{ width: `${(a.ms / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
        {song && (
          <div className="lp__topsong">
            <Cover name={`${song.label}|${song.sublabel}`} size={48} />
            <div>
              <span>Top song</span>
              <b>{song.label}</b>
              <small>
                {song.sublabel}, {formatNumber(song.plays)} plays
              </small>
            </div>
          </div>
        )}
      </div>
      <Words lede="The rankings, by hours. Every cover is drawn from the name, since nothing is fetched from anywhere.">
        <em>{top[0].label}</em> is your number one, with {formatDuration(top[0].ms)}.
      </Words>
    </>
  )
}

// ---------- D1 Liner Notes ----------

export function NotesSlide({ data }: SlideProps) {
  const { profile, fun, rec } = data
  const notes: [string, string, string][] = []
  if (fun.longestStreak) notes.push(['Longest streak', `${formatNumber(fun.longestStreak.days)} days`, `from ${formatDate(fun.longestStreak.start)}`])
  if (rec.marathon) notes.push(['The marathon', formatDuration(rec.marathon.ms), formatDate(rec.marathon.start)])
  if (fun.onRepeat) notes.push(['On repeat', `${fun.onRepeat.count}× in a day`, fun.onRepeat.title])

  return (
    <>
      <div className="lp__chart lp__chart--notes">
        <div className="holo lp__holo">
          <div className="holo__inner">
            <span className="holo__kicker">Listener type</span>
            <h3 className="holo__title">{profile.title}</h3>
            <Radar profile={profile} />
          </div>
        </div>
        <dl className="lp__notes">
          {notes.map(([label, value, detail]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <b>{value}</b>
                <span>{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Words lede="Records, habits, and what kind of listener all of this adds up to." />
    </>
  )
}

// ---------- D2 The Poster ----------

export function PosterSlide({ data, onPoster, onReplay, onClose }: SlideProps & { onPoster: () => void; onReplay: () => void; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useBox(boxRef)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(false)
  // A post-sized (4:5) preview, as big as fits
  const w = box ? Math.floor(Math.min(box.w, box.h * 0.8)) : 0
  const h = Math.round(w * 1.25)

  useEffect(() => {
    let live = true
    Promise.all([
      document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
      document.fonts.load('600 40px "JetBrains Mono Variable"'),
      document.fonts.load('italic 40px "Instrument Serif"'),
    ]).finally(() => live && setFontsReady(true))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!w || !canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) renderPoster(ctx, canvas.width, canvas.height, data.poster, { design: 'record', paper: 'midnight', title: 'On Record' })
  }, [w, h, data.poster, fontsReady])

  return (
    <>
      <div className="lp__chart lp__chart--poster" ref={boxRef}>
        <canvas ref={canvasRef} className="lp__poster" style={{ width: w, height: h }} aria-label="A preview of your poster" role="img" />
      </div>
      <Words lede="Take it home. Pick a design, a size and a paper, then download it or send it straight from your phone." />
      <div className="lp__actions">
        <button type="button" className="button button--big" onClick={onPoster}>
          Make the poster
        </button>
        <button type="button" className="button button--ghost" onClick={onReplay}>
          Play it again
        </button>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Take a deeper dive
        </button>
      </div>
    </>
  )
}
