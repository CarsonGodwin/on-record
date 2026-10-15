import { useState } from 'react'
import type { Daypart, HourSlot } from '../data/insights'
import { formatDuration, formatHour, formatPercent } from '../lib/format'
import { HEAT, SERIES } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { Cover } from './Cover'

/*
 * "Around the Clock": a 24-hour radial chart of when you listen, who you play
 * at each part of the day, and a dot-matrix of weekday by hour.
 */

const C = 230
const INNER = 72
const OUTER = 190
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

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
  const [active, setActive] = useState<number | null>(null)
  const shown = hours[active ?? peak.hour]
  const night = hours.filter((h) => h.hour >= 18 || h.hour < 6).reduce((s, h) => s + h.ms, 0) / total
  const step = (Math.PI * 2) / 24

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
                  onPointerEnter={(e) => isHover(e) && setActive(h.hour)}
                  onPointerDown={() => setActive(h.hour)}
                  onPointerLeave={leaveUnlessTouch(() => setActive(null))}
                  onFocus={() => setActive(h.hour)}
                  onBlur={() => setActive(null)}
                />
              </g>
            )
          })}

          {Array.from({ length: 8 }, (_, k) => {
            const h = k * 3
            const [x, y] = at(OUTER + 20, h * step)
            return (
              <text key={h} x={x} y={y} className="clock__hour" textAnchor="middle" dominantBaseline="middle">
                {formatHour(h).replace(' ', '').toLowerCase()}
              </text>
            )
          })}
          <text x={C} y={C - INNER + 22} className="clock__glyph" textAnchor="middle">
            ☾
          </text>
          <text x={C} y={C + INNER - 12} className="clock__glyph" textAnchor="middle">
            ☀
          </text>

          <g className="clock__center" aria-live="polite">
            <text x={C} y={C - 20} textAnchor="middle" className="clock__center-label">
              {active === null ? 'Peak hour' : 'At'}
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
          {shown.top ? (
            <>
              Around {formatHour(shown.hour)}, you play <strong>{shown.top}</strong> most.
            </>
          ) : (
            'Nothing at this hour.'
          )}{' '}
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

function DotMatrix({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 1)
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const cell = 18
  const left = 40
  return (
    <div className="dots">
      <p className="dots__readout" aria-live="polite">
        {hover ? (
          <>
            <strong>{formatDuration(grid[hover.d][hover.h])}</strong>{' '}
            <span className="muted">
              on {DAY_NAMES[hover.d]} at {formatHour(hover.h)}
            </span>
          </>
        ) : (
          <span className="muted">Every hour of the week. Bigger, brighter dots mean more listening. Tap one for details.</span>
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
                  className={hover?.d === d && hover.h === h ? 'dots__dot is-on' : 'dots__dot'}
                  onPointerEnter={(e) => isHover(e) && setHover({ d, h })}
                  onPointerDown={() => setHover({ d, h })}
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
