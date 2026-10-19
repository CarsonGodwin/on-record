import { useEffect, useRef, useState } from 'react'
import type { Daypart, HourSlot } from '../data/insights'
import { formatDuration, formatHour, formatPercent } from '../lib/format'
import { useMediaQuery } from '../lib/hooks'
import { HEAT, SERIES } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { Cover } from './Cover'

/*
 * "Around the Clock": a 24-hour radial chart of when you listen, who you play
 * at each part of the day, and a dot-matrix of weekday by hour. Phones get it
 * all in one card: the dial ringed in sky colors, the day's artists along a
 * sideways timeline, and the dots underneath.
 */

const C = 230
const INNER = 72
const OUTER = 190
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const PHONE = '(max-width: 640px)'

/** One sky color per part of the day: after hours, mornings, afternoons, evenings */
const SKY = ['#4657d6', '#f2913d', '#ffd23f', '#b04ad6']
/** Which part of the day an hour falls in (matches the dayparts in insights) */
const partOf = (hour: number) => (hour < 5 ? 0 : hour < 12 ? 1 : hour < 17 ? 2 : 3)

/** Runs `clear` when a press lands anywhere except on an element matching `keep` */
function useClickAway(active: boolean, keep: string, clear: () => void) {
  // Callers pass inline callbacks; reading the latest through a ref keeps the listener from re-subscribing every render
  const clearRef = useRef(clear)
  useEffect(() => {
    clearRef.current = clear
  })
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(keep)) clearRef.current()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [active, keep])
}

/** Point at radius r, angle a (radians clockwise from the top) */
function at(r: number, a: number): [number, number] {
  return [C + r * Math.sin(a), C - r * Math.cos(a)]
}

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = at(r0, a0)
  const [x1, y1] = at(r1, a0)
  const [x2, y2] = at(r1, a1)
  const [x3, y3] = at(r0, a1)
  return `M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${large} 0 ${x0},${y0} Z`
}

interface Props {
  hours: HourSlot[]
  parts: Daypart[]
  grid: number[][]
}

export function Clock({ hours, parts, grid }: Props) {
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
  const step = (Math.PI * 2) / 24
  const phone = useMediaQuery(PHONE)
  const labelR = phone ? OUTER + 40 : OUTER + 20

  const caption = shown.top ? (
    <>
      Around {formatHour(shown.hour)}, you play <strong>{shown.top}</strong> most.
    </>
  ) : (
    'Nothing at this hour.'
  )

  const dial = (
    <svg viewBox={phone ? '-24 -24 508 508' : '0 0 460 460'} role="img" aria-label={`Listening by hour of day. Peak: ${formatHour(peak.hour)}.`}>
      <defs>
        <radialGradient id="clock-fill" cx={C} cy={C} r={OUTER} gradientUnits="userSpaceOnUse">
          <stop offset={INNER / OUTER} stopColor={SERIES[0]} stopOpacity="0.35" />
          <stop offset="1" stopColor={SERIES[0]} stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Night and day halves */}
      <path d={sector(INNER - 8, OUTER + 6, -Math.PI / 2, Math.PI / 2)} className="clock__night" />
      <path d={sector(INNER - 8, OUTER + 6, Math.PI / 2, (Math.PI * 3) / 2)} className="clock__day" />

      {/* The sky around the rim, an arc per hour in its part of the day's color */}
      {phone &&
        hours.map((h) => (
          <path
            key={h.hour}
            d={sector(OUTER + 12, OUTER + 22, h.hour * step + 0.012, (h.hour + 1) * step - 0.012)}
            fill={SKY[partOf(h.hour)]}
            className="clock__sky"
          />
        ))}

      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={C} cy={C} r={INNER + (OUTER - INNER) * f} className="clock__ring" />
      ))}

      {hours.map((h) => {
        const r1 = INNER + Math.max(2, (h.ms / max) * (OUTER - INNER))
        const isOn = (active ?? peak.hour) === h.hour
        return (
          <g key={h.hour}>
            <path
              d={sector(INNER, r1, h.hour * step + 0.025, (h.hour + 1) * step - 0.025)}
              fill="url(#clock-fill)"
              className={isOn ? 'clock__wedge is-on' : 'clock__wedge'}
            />
            {/* Generous invisible hit area, the full wedge out to the rim */}
            <path
              d={sector(INNER, OUTER + 10, h.hour * step, (h.hour + 1) * step)}
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
        const [x, y] = at(labelR, h * step)
        return (
          <text key={h} x={x} y={y} className="clock__hour" textAnchor="middle" dominantBaseline="middle">
            {formatHour(h).replace(' ', '').toLowerCase()}
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
  )

  if (phone) {
    return (
      <div className="clock clock--card">
        <div className="clock__dial">{dial}</div>
        <p className="clock__caption" aria-live="polite">
          {caption}
        </p>
        <DayNight night={night} />
        <DaypartLine parts={parts} />
        <DotMatrix grid={grid} compact />
      </div>
    )
  }

  return (
    <div className="clock">
      <div className="clock__dial">
        {dial}
        <p className="clock__caption">
          {caption}{' '}
          <span className="muted">{formatPercent(night)} of your listening happens between 6 PM and 6 AM.</span>
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

/** Day versus night as one split bar */
function DayNight({ night }: { night: number }) {
  const day = 1 - night
  return (
    <div className="daynight" role="img" aria-label={`${formatPercent(day)} of your listening by day, ${formatPercent(night)} by night`}>
      <div className="daynight__labels" aria-hidden="true">
        <span className="daynight__day">
          ☀ <strong>{formatPercent(day)}</strong> by day
        </span>
        <span className="daynight__night">
          by night <strong>{formatPercent(night)}</strong> ☾
        </span>
      </div>
      <div className="daynight__bar" aria-hidden="true">
        <i className="daynight__fill--day" style={{ flexGrow: day }} />
        <i className="daynight__fill--night" style={{ flexGrow: night }} />
      </div>
      <span className="daynight__note muted" aria-hidden="true">
        Day is 6 AM – 6 PM
      </span>
    </div>
  )
}

/**
 * Who you play at each part of the day, along one 24-hour line. Parts in the
 * first half of the day sit on the left, the rest on the right; the earlier
 * of each pair sits above the line.
 */
function DaypartLine({ parts }: { parts: Daypart[] }) {
  const card = (i: number) => {
    const p = parts[i]
    if (!p) return <span />
    return (
      <div className="dpline__part" style={{ ['--sky' as string]: SKY[i] }}>
        <span className="dpline__label">
          {p.label} <span className="muted">· {p.hours}</span>
        </span>
        <span className="dpline__who">
          {p.artist ? <Cover name={p.artist} size={30} /> : <span className="cover cover--empty" />}
          <span className="dpline__text">
            <strong className="dpline__artist">{p.artist ?? 'Nobody yet'}</strong>
            {p.artist && <span className="dpline__time">{formatDuration(p.ms)}</span>}
          </span>
        </span>
      </div>
    )
  }
  return (
    <div className="dpline">
      <div className="dpline__row">
        {card(0)}
        {card(2)}
      </div>
      <div className="dpline__track" aria-hidden="true">
        {parts.map((p, i) => (
          <i key={p.label} style={{ flexGrow: p.to - p.from, background: SKY[i] }} />
        ))}
      </div>
      <div className="dpline__axis" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {formatHour(h % 24).replace(' ', '').toLowerCase()}
          </span>
        ))}
      </div>
      <div className="dpline__row">
        {card(1)}
        {card(3)}
      </div>
    </div>
  )
}

function DotMatrix({ grid, compact = false }: { grid: number[][]; compact?: boolean }) {
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
        <span className="dots__hint muted">
          {compact ? 'Every hour of the week. Bigger dots, more listening. Tap one.' : 'Every hour of the week. Bigger, brighter dots mean more listening. Click one to keep it selected.'}
        </span>
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
            {formatHour(h).replace(' ', '').toLowerCase()}
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
