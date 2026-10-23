import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { DAY_START, WINDOWS, dayNight, daypartLeans, formatTimes, leanSentence, strongestLean, type DaypartLean } from '../data/dayparts'
import type { Daypart, HourSlot } from '../data/insights'
import { formatDuration, formatHour, formatPercent } from '../lib/format'
import { useMediaQuery, useSize } from '../lib/hooks'
import { HEAT, SERIES } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { InCards } from '../lib/stage'
import type { Play } from '../types'
import { Cover } from './Cover'

/*
 * "Around the Clock": a 24-hour radial chart of when you listen, who you play
 * at each part of the day, and a dot-matrix of weekday by hour. On a phone it
 * is one card: the dial split into day and night, who you turn into at each
 * part of the day along a timeline, and the week's dots on the same timescale.
 */

const C = 230
const INNER = 72
const OUTER = 190
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const PHONE = '(max-width: 640px)'
const STEP = (Math.PI * 2) / 24

/** Runs `clear` when a press lands anywhere except on an element matching `keep` */
function useClickAway(active: boolean, keep: string, clear: () => void) {
  // Callers pass inline callbacks; reading the latest through a ref keeps the listener from re-subscribing every render
  const clearRef = useRef(clear)
  useEffect(() => {
    clearRef.current = clear
  })
  useEffect(() => {
    if (!active) return
    const onDown = (e: globalThis.PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(keep)) clearRef.current()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [active, keep])
}

/** Point at radius r, angle a (radians clockwise from the top), around (cx, cy) */
function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
}

/** A ring segment between radii r0 and r1, from angle a0 to a1 */
function sector(r0: number, r1: number, a0: number, a1: number, cx = C, cy = C): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, r0, a0)
  const [x1, y1] = polar(cx, cy, r1, a0)
  const [x2, y2] = polar(cx, cy, r1, a1)
  const [x3, y3] = polar(cx, cy, r0, a1)
  return `M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${large} 0 ${x0},${y0} Z`
}

/** A straight line out from the centre, from radius r0 to r1 */
function hand(cx: number, cy: number, r0: number, r1: number, a: number) {
  const [x1, y1] = polar(cx, cy, r0, a)
  const [x2, y2] = polar(cx, cy, r1, a)
  return { x1, y1, x2, y2 }
}

/** "6am", "12pm": the short form the dial and timeline print */
const shortHour = (hour: number) => formatHour(hour % 24).replace(' ', '').toLowerCase()

interface Props {
  hours: HourSlot[]
  parts: Daypart[]
  grid: number[][]
  /** The filtered plays, for who stands out at each part of the day */
  plays: Play[]
}

export function Clock({ hours, parts, grid, plays }: Props) {
  const cards = useContext(InCards)
  const phone = useMediaQuery(PHONE)
  if (cards || phone) return <ClockCard hours={hours} grid={grid} plays={plays} />
  return <ClockPage hours={hours} parts={parts} grid={grid} />
}

/* ---------- The desktop page ---------- */

function ClockPage({ hours, parts, grid }: Omit<Props, 'plays'>) {
  const max = Math.max(...hours.map((h) => h.ms), 1)
  const total = hours.reduce((s, h) => s + h.ms, 0) || 1
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])
  const [hover, setHover] = useState<number | null>(null)
  // A clicked hour stays selected until it is clicked again
  const [picked, setPicked] = useState<number | null>(null)
  const active = picked ?? hover
  const shown = hours[active ?? peak.hour]
  const toggle = (hour: number) => setPicked(picked === hour ? null : hour)

  useClickAway(picked !== null, '.clock__hit', () => setPicked(null))
  const night = hours.filter((h) => h.hour >= 18 || h.hour < 6).reduce((s, h) => s + h.ms, 0) / total

  const caption = shown.top ? (
    <>
      Around {formatHour(shown.hour)}, you play <strong>{shown.top}</strong> most.
    </>
  ) : (
    'Nothing at this hour.'
  )

  return (
    <div className="clock">
      <div className="clock__dial">
        <svg viewBox="0 0 460 460" role="img" aria-label={`Listening by hour of day. Peak: ${formatHour(peak.hour)}.`}>
          <defs>
            <radialGradient id="clock-fill" cx={C} cy={C} r={OUTER} gradientUnits="userSpaceOnUse">
              <stop offset={INNER / OUTER} stopColor={SERIES[0]} stopOpacity="0.35" />
              <stop offset="1" stopColor={SERIES[0]} stopOpacity="1" />
            </radialGradient>
          </defs>

          {/* Night and day halves */}
          <path d={sector(INNER - 8, OUTER + 6, -Math.PI / 2, Math.PI / 2)} className="clock__night" />
          <path d={sector(INNER - 8, OUTER + 6, Math.PI / 2, (Math.PI * 3) / 2)} className="clock__day" />

          {[0.25, 0.5, 0.75, 1].map((f) => (
            <circle key={f} cx={C} cy={C} r={INNER + (OUTER - INNER) * f} className="clock__ring" />
          ))}

          {hours.map((h) => {
            const r1 = INNER + Math.max(2, (h.ms / max) * (OUTER - INNER))
            const isOn = (active ?? peak.hour) === h.hour
            return (
              <g key={h.hour}>
                <path
                  d={sector(INNER, r1, h.hour * STEP + 0.025, (h.hour + 1) * STEP - 0.025)}
                  fill="url(#clock-fill)"
                  className={isOn ? 'clock__wedge is-on' : 'clock__wedge'}
                />
                {/* Generous invisible hit area, the full wedge out to the rim */}
                <path
                  d={sector(INNER, OUTER + 10, h.hour * STEP, (h.hour + 1) * STEP)}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatHour(h.hour)}: ${formatDuration(h.ms)}`}
                  aria-pressed={picked === h.hour}
                  className="clock__hit"
                  onPointerEnter={(e) => isHover(e) && setHover(h.hour)}
                  onPointerLeave={leaveUnlessTouch(() => setHover(null))}
                  onClick={() => toggle(h.hour)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(h.hour)
                    }
                  }}
                  onFocus={() => setHover(h.hour)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}

          {Array.from({ length: 8 }, (_, k) => {
            const h = k * 3
            const [x, y] = polar(C, C, OUTER + 20, h * STEP)
            return (
              <text key={h} x={x} y={y} className="clock__hour" textAnchor="middle" dominantBaseline="middle">
                {shortHour(h)}
              </text>
            )
          })}
          <text x={C} y={C - INNER + 22} className="clock__glyph clock__glyph--moon" textAnchor="middle">
            ☾
          </text>
          <text x={C} y={C + INNER - 12} className="clock__glyph clock__glyph--sun" textAnchor="middle">
            ☀
          </text>

          <g className="clock__center" aria-live="polite">
            <text x={C} y={C - 20} textAnchor="middle" className="clock__center-label">
              {active === null ? 'Peak hour' : picked !== null ? 'Selected' : 'At'}
            </text>
            <text x={C} y={C + 12} textAnchor="middle" className="clock__center-value">
              {formatHour(shown.hour)}
            </text>
            <text x={C} y={C + 34} textAnchor="middle" className="clock__center-label">
              {formatDuration(shown.ms)}
            </text>
          </g>
        </svg>
        <p className="clock__caption">
          {caption} <span className="muted">{formatPercent(night)} of your listening happens between 6 PM and 6 AM.</span>
        </p>
      </div>

      <div className="clock__side">
        <ul className="dayparts">
          {parts.map((p) => (
            <li key={p.label} className="daypart">
              {p.artist ? <Cover name={p.artist} size={56} /> : <span className="cover cover--empty" />}
              <div>
                <span className="daypart__label">
                  {p.label} <span className="muted">· {p.hours}</span>
                </span>
                <strong className="daypart__artist">{p.artist ?? 'Nobody yet'}</strong>
                {p.artist && <span className="daypart__time">{formatDuration(p.ms)}</span>}
              </div>
            </li>
          ))}
        </ul>
        <DotMatrix grid={grid} />
      </div>
    </div>
  )
}

/* ---------- The phone card ---------- */

/** What the card's one readout line is about: an hour, a dot of the week, or a part of the day */
type Focus = { kind: 'hour'; hour: number } | { kind: 'cell'; d: number; h: number } | { kind: 'part'; i: number } | null

/** Grid columns run from 6 AM, so the night is one block on the right, as on the timeline */
const columnOf = (hour: number) => (hour - DAY_START + 24) % 24
const hourOfColumn = (col: number) => (col + DAY_START) % 24

/** Space on the left of the timeline and the dots for the weekday names */
const GUTTER = 30

/** Day and night tints for the dial, the timeline and the dots: warm and deep blue, from the chart palette */
const SKY = { '--day': SERIES[2], '--night': SERIES[6], '--gutter': `${GUTTER}px` } as CSSProperties

/** Bolds the first mention of `name` in a sentence */
function emphasize(text: string, name: string | null): ReactNode {
  const at = name ? text.indexOf(name) : -1
  if (!name || at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <strong>{name}</strong>
      {text.slice(at + name.length)}
    </>
  )
}

/** The top artist at an hour is only the most played, not most of it, so the copy says "more than anyone" */
function hourLine(slot: HourSlot): { text: string; name: string | null } {
  if (!slot.ms) return { text: `Nothing at ${formatHour(slot.hour)}.`, name: null }
  return { text: `At ${formatHour(slot.hour)}: ${formatDuration(slot.ms)}, ${slot.top} more than anyone.`, name: slot.top }
}

function ClockCard({ hours, grid, plays }: { hours: HourSlot[]; grid: number[][]; plays: Play[] }) {
  const leans = useMemo(() => daypartLeans(plays), [plays])
  const lead = strongestLean(leans)
  const split = dayNight(hours.map((h) => h.ms))
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])
  const [focus, setFocus] = useState<Focus>(null)

  const hour = focus?.kind === 'hour' ? focus.hour : focus?.kind === 'cell' ? focus.h : null
  let line: { text: string; name: string | null }
  if (focus?.kind === 'hour') line = hourLine(hours[focus.hour])
  else if (focus?.kind === 'cell') {
    const ms = grid[focus.d][focus.h]
    line = { text: ms ? `${DAY_NAMES[focus.d]} at ${formatHour(focus.h)}: ${formatDuration(ms)}.` : `Nothing on ${DAY_NAMES[focus.d]} at ${formatHour(focus.h)}.`, name: null }
  } else if (focus?.kind === 'part') line = { text: leanSentence(leans[focus.i]), name: leans[focus.i].artist }
  else if (lead) line = { text: leanSentence(lead), name: lead.artist }
  else line = peak.ms ? { text: `You listen most around ${formatHour(peak.hour)}, and play ${peak.top} most then.`, name: peak.top } : { text: 'Nothing here yet.', name: null }

  return (
    <div className="clockcard" style={SKY}>
      <Dial
        hours={hours}
        split={split}
        hour={hour}
        part={focus?.kind === 'part' ? WINDOWS[focus.i] : null}
        valueText={line.text}
        onHour={(h) => setFocus(h === null ? null : { kind: 'hour', hour: h })}
      />
      {/* A long name gets a smaller line rather than a third one */}
      <p className={line.text.length > 84 ? 'clockcard__readout is-long' : 'clockcard__readout'} aria-live="polite">
        <span>{emphasize(line.text, line.name)}</span>
      </p>
      <Timeline
        leans={leans}
        part={focus?.kind === 'part' ? focus.i : null}
        hour={hour}
        onPart={(i) => setFocus(focus?.kind === 'part' && focus.i === i ? null : { kind: 'part', i })}
      />
      <DotGrid
        grid={grid}
        cell={focus?.kind === 'cell' ? focus : null}
        hour={hour}
        onCell={(cell) => setFocus(cell && { kind: 'cell', ...cell })}
      />
    </div>
  )
}

/**
 * Follows one finger (or mouse button) across an element that owns its drag:
 * `pick` maps a point to a value, and a tap on the value already chosen lets it go.
 */
function useScrub<T>(pick: (x: number, y: number) => T | null, same: (a: T, b: T) => boolean, current: T | null, onChange: (v: T | null) => void) {
  const drag = useRef<{ id: number; first: T | null; wasOn: boolean; moved: boolean } | null>(null)
  const at = (e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return pick(e.clientX - rect.left, e.clientY - rect.top)
  }
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const v = at(e)
      drag.current = { id: e.pointerId, first: v, wasOn: v !== null && current !== null && same(v, current), moved: false }
      if (v !== null) onChange(v)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const v = at(e)
      if (v === null) return
      if (d.first === null || !same(v, d.first)) d.moved = true
      onChange(v)
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      // Tapping what's already picked puts the card back to its headline
      if (d.wasOn && !d.moved) onChange(null)
    },
    onPointerCancel() {
      drag.current = null
    },
  }
}

interface DialProps {
  hours: HourSlot[]
  split: { day: number; night: number }
  hour: number | null
  /** A part of the day picked on the timeline, whose hours stay lit */
  part: { from: number; to: number } | null
  valueText: string
  onHour: (hour: number | null) => void
}

/** The 24-hour dial: night on top, day below, the horizon at 6 AM and 6 PM. Tap or drag anywhere on it to pick an hour. */
function Dial({ hours, split, hour, part, valueText, onHour }: DialProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(ref, { width: 320, height: 220 })
  const max = Math.max(...hours.map((h) => h.ms), 1)
  const cx = width / 2
  const cy = height / 2
  // Room above and below for the midnight and noon labels, and at the sides for 6 AM and 6 PM
  const R = Math.max(48, Math.min(height / 2 - 20, width / 2 - 36))
  const r0 = Math.min(52, Math.max(40, R * 0.4))
  const reach = R - 6 - r0

  const scrub = useScrub<number>(
    (x, y) => {
      const dx = x - cx
      const dy = y - cy
      if (Math.hypot(dx, dy) < 6) return null
      const a = Math.atan2(dx, -dy)
      return Math.floor((a < 0 ? a + Math.PI * 2 : a) / STEP) % 24
    },
    (a, b) => a === b,
    hour,
    onHour,
  )

  function onKeyDown(e: KeyboardEvent) {
    const from = hour ?? hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0]).hour
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onHour((from + 1) % 24)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onHour((from + 23) % 24)
    else if (e.key === 'Escape' && hour !== null) onHour(null)
    else return
    e.preventDefault()
  }

  const half = (top: boolean) => `M${cx - R},${cy} A${R},${R} 0 0 ${top ? 1 : 0} ${cx + R},${cy} Z`
  const nightArc = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`
  const dayArc = `M${cx + R},${cy} A${R},${R} 0 0 1 ${cx - R},${cy}`

  return (
    <div
      ref={ref}
      className="clockcard__dial"
      data-drag=""
      role="slider"
      tabIndex={0}
      aria-label="Hour of the day"
      aria-valuemin={0}
      aria-valuemax={23}
      aria-valuenow={hour ?? undefined}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      {...scrub}
    >
      <svg width={width} height={height} aria-hidden="true">
        <path d={half(true)} className="clockcard__night" />
        <path d={half(false)} className="clockcard__day" />
        <circle cx={cx} cy={cy} r={r0 + reach / 2} className="clockcard__ring" />
        <line x1={cx - R} x2={cx + R} y1={cy} y2={cy} className="clockcard__horizon" />

        {hours.map((h) => {
          const r1 = r0 + Math.max(2, (h.ms / max) * reach)
          const lit = hour === null ? !part || (h.hour >= part.from && h.hour < part.to) : hour === h.hour
          const cls = hour === h.hour ? 'clockcard__bar is-on' : lit ? 'clockcard__bar' : 'clockcard__bar is-dim'
          return <path key={h.hour} d={sector(r0, r1, h.hour * STEP + 0.014, (h.hour + 1) * STEP - 0.014, cx, cy)} fill={SERIES[0]} className={cls} />
        })}

        {/* Where the finger is, even on an hour too quiet to have much of a bar */}
        {hour !== null && <line {...hand(cx, cy, r0, R - 3, (hour + 0.5) * STEP)} className="clockcard__hand" />}

        <path d={nightArc} className="clockcard__rim clockcard__rim--night" />
        <path d={dayArc} className="clockcard__rim clockcard__rim--day" />
        {[0, 3, 9, 12, 15, 21].map((h) => {
          const [x0, y0] = polar(cx, cy, R + 2, h * STEP)
          const [x1, y1] = polar(cx, cy, R + (h % 12 ? 5 : 7), h * STEP)
          return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} className="clockcard__tick" />
        })}

        <text x={cx} y={cy - R - 7} textAnchor="middle" className="clockcard__hour">
          12am
        </text>
        <text x={cx} y={cy + R + 15} textAnchor="middle" className="clockcard__hour">
          12pm
        </text>
        <text x={cx + R + 7} y={cy + 4} className="clockcard__hour">
          6am
        </text>
        <text x={cx - R - 7} y={cy + 4} textAnchor="end" className="clockcard__hour">
          6pm
        </text>

        <text x={cx} y={cy - 8} textAnchor="middle" className="clockcard__half clockcard__half--night">
          night <tspan className="clockcard__pct">{formatPercent(split.night)}</tspan>
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" className="clockcard__half clockcard__half--day">
          day <tspan className="clockcard__pct">{formatPercent(split.day)}</tspan>
        </text>
      </svg>
    </div>
  )
}

/** Where each part of the day's label hangs off the timeline, so neighbours never collide */
const PLACES: { row: 'above' | 'below'; col: 1 | 2; side: 'start' | 'end' }[] = [
  { row: 'above', col: 1, side: 'start' }, // mornings, from the left edge
  { row: 'below', col: 1, side: 'end' }, // afternoons, back from the middle
  { row: 'below', col: 2, side: 'start' }, // evenings, on from the middle
  { row: 'above', col: 2, side: 'end' }, // late nights, back from the right edge
]

interface TimelineProps {
  leans: DaypartLean[]
  part: number | null
  hour: number | null
  onPart: (i: number) => void
}

/** 24 hours from 6 AM, day then night, with who stands out in each part of the day */
function Timeline({ leans, part, hour, onPart }: TimelineProps) {
  const label = (i: number) => {
    const l = leans[i]
    const { side, col } = PLACES[i]
    const extra = l.kind === 'leans' ? (l.vsRest === Infinity ? ' only' : ` ${formatTimes(l.vsRest)}`) : ''
    return (
      <button
        key={l.label}
        type="button"
        className={`cline__who cline__who--${side}`}
        style={{ gridColumn: col }}
        aria-pressed={part === i}
        onClick={() => onPart(i)}
      >
        {l.artist ? <Cover name={l.artist} size={28} /> : <span className="cover cover--empty" />}
        <span className="cline__text">
          <span className="cline__name">{l.artist ?? 'No music'}</span>
          <span className="cline__when">
            {l.label.toLowerCase()}
            {extra && <span className="cline__times">{extra}</span>}
          </span>
        </span>
      </button>
    )
  }
  const row = (which: 'above' | 'below') => (
    <div className={`cline__row cline__row--${which}`}>{WINDOWS.map((_, i) => (PLACES[i].row === which ? label(i) : null))}</div>
  )

  return (
    <div className="cline">
      {row('above')}
      <div className="cline__bar" aria-hidden="true">
        {part !== null && <i className="cline__part" style={{ left: `${(columnOf(WINDOWS[part].from) / 24) * 100}%` }} />}
        {hour !== null && <i className="cline__mark" style={{ left: `${((columnOf(hour) + 0.5) / 24) * 100}%` }} />}
        {[0, 6, 12, 18, 24].map((c) => (
          <span key={c} className="cline__tick" style={{ left: `${(c / 24) * 100}%` }}>
            {shortHour(hourOfColumn(c))}
          </span>
        ))}
      </div>
      {row('below')}
    </div>
  )
}

interface DotGridProps {
  grid: number[][]
  cell: { d: number; h: number } | null
  hour: number | null
  onCell: (cell: { d: number; h: number } | null) => void
}

/** Every hour of the week on the timeline's scale. Slide a finger across to read it. */
function DotGrid({ grid, cell, hour, onCell }: DotGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(ref, { width: 320, height: 84 })
  const max = Math.max(...grid.flat(), 1)
  const col = (width - GUTTER) / 24
  const row = height / 7
  const dot = Math.max(2, Math.min(col, row) / 2 - 0.75)

  const scrub = useScrub<{ d: number; h: number }>(
    (x, y) => {
      const c = Math.floor((x - GUTTER) / col)
      const d = Math.floor(y / row)
      return { d: Math.max(0, Math.min(6, d)), h: hourOfColumn(Math.max(0, Math.min(23, c))) }
    },
    (a, b) => a.d === b.d && a.h === b.h,
    cell,
    onCell,
  )

  function onKeyDown(e: KeyboardEvent) {
    const from = cell ?? { d: 0, h: DAY_START }
    const c = columnOf(from.h)
    if (e.key === 'ArrowRight') onCell({ d: from.d, h: hourOfColumn(Math.min(23, c + 1)) })
    else if (e.key === 'ArrowLeft') onCell({ d: from.d, h: hourOfColumn(Math.max(0, c - 1)) })
    else if (e.key === 'ArrowDown') onCell({ d: Math.min(6, from.d + 1), h: from.h })
    else if (e.key === 'ArrowUp') onCell({ d: Math.max(0, from.d - 1), h: from.h })
    else if (e.key === 'Escape' && cell) onCell(null)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      className="clockcard__dots"
      data-drag=""
      tabIndex={0}
      role="group"
      aria-label="Listening by weekday and hour. Use the arrow keys to read each hour."
      onKeyDown={onKeyDown}
      {...scrub}
    >
      <svg width={width} height={height} aria-hidden="true">
        <rect x={GUTTER} y={0} width={col * 12} height={height} className="clockcard__dots-day" />
        <rect x={GUTTER + col * 12} y={0} width={col * 12} height={height} className="clockcard__dots-night" />
        {hour !== null && <rect x={GUTTER + columnOf(hour) * col} y={0} width={col} height={height} className="clockcard__dots-col" />}
        {grid.map((r, d) => (
          <g key={d}>
            {/* Rows too tight for seven names get every other one */}
            {(row >= 11.5 || d % 2 === 0) && (
              <text x={0} y={d * row + row / 2} dominantBaseline="central" className="clockcard__day-name">
                {DAYS[d]}
              </text>
            )}
            {r.map((ms, h) => {
              const f = ms / max
              const on = cell?.d === d && cell.h === h
              return (
                <circle
                  key={h}
                  cx={GUTTER + (columnOf(h) + 0.5) * col}
                  cy={d * row + row / 2}
                  r={ms ? 1 + Math.sqrt(f) * (dot - 1) : 1}
                  fill={ms ? HEAT[Math.min(HEAT.length - 1, Math.floor(f * HEAT.length))] : 'rgba(244,241,234,0.14)'}
                  className={on ? 'clockcard__dot is-on' : undefined}
                />
              )
            })}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ---------- Desktop's dots ---------- */

function DotMatrix({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 1)
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  // A clicked dot stays selected until it is clicked again
  const [picked, setPicked] = useState<{ d: number; h: number } | null>(null)
  const shown = picked ?? hover
  useClickAway(picked !== null, '.dots__dot', () => setPicked(null))
  const cell = 18
  const left = 40
  return (
    <div className="dots">
      <p className={shown ? 'dots__readout is-hovering' : 'dots__readout'} aria-live="polite">
        {/* The hint stays in the layout while a dot's details cover it, so the box never changes height */}
        <span className="dots__hint muted">Every hour of the week. Bigger, brighter dots mean more listening. Click one to keep it selected.</span>
        {shown && (
          <span>
            <strong>{formatDuration(grid[shown.d][shown.h])}</strong>{' '}
            <span className="muted">
              on {DAY_NAMES[shown.d]} at {formatHour(shown.h)}
            </span>
          </span>
        )}
      </p>
      <svg viewBox={`0 0 ${left + 24 * cell} ${7 * cell + 20}`} role="img" aria-label="Listening by weekday and hour">
        {grid.map((row, d) => (
          <g key={d}>
            <text x={0} y={d * cell + cell / 2} dominantBaseline="middle" className="axis-label">
              {DAYS[d]}
            </text>
            {row.map((ms, h) => {
              const f = ms / max
              return (
                <circle
                  key={h}
                  cx={left + h * cell + cell / 2}
                  cy={d * cell + cell / 2}
                  r={ms ? 1.5 + Math.sqrt(f) * (cell / 2 - 2) : 1}
                  fill={ms ? HEAT[Math.min(HEAT.length - 1, Math.floor(f * HEAT.length))] : 'rgba(244,241,234,0.12)'}
                  className={shown?.d === d && shown.h === h ? 'dots__dot is-on' : 'dots__dot'}
                  onPointerEnter={(e) => isHover(e) && setHover({ d, h })}
                  onClick={() => setPicked(picked?.d === d && picked.h === h ? null : { d, h })}
                  onPointerLeave={leaveUnlessTouch(() => setHover(null))}
                />
              )
            })}
          </g>
        ))}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={left + h * cell + cell / 2} y={7 * cell + 15} textAnchor="middle" className="axis-label">
            {shortHour(h)}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function ClockTable({ hours }: { hours: HourSlot[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Hour</th>
          <th className="num">Listening time</th>
          <th>Top artist</th>
        </tr>
      </thead>
      <tbody>
        {hours.map((h) => (
          <tr key={h.hour}>
            <td>{formatHour(h.hour)}</td>
            <td className="num">{formatDuration(h.ms)}</td>
            <td>{h.top ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
