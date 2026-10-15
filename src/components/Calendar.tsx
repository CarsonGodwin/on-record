import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { DayTotal } from '../data/insights'
import type { Play } from '../types'
import { dayNumber, fromDayNumber } from '../data/stats'
import { formatDuration, formatLongDate, formatMonthShort, formatNumber } from '../lib/format'
import { useWidth } from '../lib/hooks'
import { HEAT, heatStep, quantileThresholds } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { DayPanel } from './DayPanel'
import { FloatTip } from './ui'

/*
 * "Every Day": one square per day. Wide screens get a GitHub-style strip per
 * year; phones get twelve little month calendars, which read without sideways scrolling.
 * Clicking a day opens its details under that year.
 */

const CELL = 14
const GAP = 3
const STEP = CELL + GAP
const LEFT = 30
const TOP = 18

interface Props {
  days: Map<number, DayTotal>
  years: number[]
  /** For the day details; sorted by endTime */
  plays: Play[]
  firstHeard: Map<string, number>
  colors: Map<string, string>
}

interface Hover {
  day: number
  x: number
  y: number
}

export function Calendar({ days, years, plays, firstHeard, colors }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, 900)
  const thresholds = useMemo(() => quantileThresholds([...days.values()].map((d) => d.ms)), [days])
  const biggest = useMemo(() => {
    let best: [number, number] | null = null
    for (const [day, d] of days) if (!best || d.ms > best[1]) best = [day, d.ms]
    return best?.[0] ?? null
  }, [days])
  const [hover, setHover] = useState<Hover | null>(null)
  const clearHover = useCallback(() => setHover(null), [])
  const hovered = hover ? days.get(hover.day) : undefined

  // A day picked under one year filter may not exist under another
  const [picked, setPicked] = useState<number | null>(null)
  const selected = picked !== null && days.has(picked) ? picked : null
  const listened = useMemo(() => [...days.keys()].sort((a, b) => a - b), [days])
  const at = selected === null ? -1 : listened.indexOf(selected)

  /** Props for one day's square: color, highlight and the hover/click handlers */
  const cell = (day: number) => {
    const v = days.get(day)
    const classes = ['calendar__day', day === biggest && 'is-max', !v && 'is-empty', day === selected && 'is-selected']
    return {
      fill: v ? heatStep(v.ms, thresholds) : undefined,
      className: classes.filter(Boolean).join(' '),
      // Hover previews; a click (or tap) opens the full details, so touch skips the tooltip
      onPointerEnter: (e: PointerEvent) => isHover(e) && setHover({ day, x: e.clientX, y: e.clientY }),
      onClick: v
        ? () => {
            setPicked(day === selected ? null : day)
            setHover(null)
          }
        : undefined,
    }
  }

  return (
    <div className="calendar" ref={ref}>
      {years.map((year) => {
        const first = dayNumber(new Date(year, 0, 1))
        const last = dayNumber(new Date(year, 11, 31))
        let yearMs = 0
        let active = 0
        for (let d = first; d <= last; d++) {
          const v = days.get(d)
          if (v) {
            yearMs += v.ms
            active++
          }
        }

        return (
          <div key={year} className="calendar__year">
            <div className="calendar__head">
              <span className="calendar__label">{year}</span>
              <span className="muted">
                {formatNumber(yearMs / 3_600_000)} hrs · {active} days with music
              </span>
            </div>
            {width < 640 ? (
              <MonthGrid year={year} cell={cell} onLeave={leaveUnlessTouch(clearHover)} />
            ) : (
              <YearStrip year={year} cell={cell} onLeave={leaveUnlessTouch(clearHover)} />
            )}
            {selected !== null && selected >= first && selected <= last && (
              <DayPanel
                day={selected}
                plays={plays}
                firstHeard={firstHeard}
                colors={colors}
                prev={at > 0 ? listened[at - 1] : null}
                next={at >= 0 && at < listened.length - 1 ? listened[at + 1] : null}
                onSelect={setPicked}
                onClose={() => setPicked(null)}
              />
            )}
          </div>
        )
      })}

      <div className="scale-legend">
        <span aria-hidden="true">Less</span>
        {HEAT.map((c) => (
          <i key={c} style={{ background: c }} aria-hidden="true" />
        ))}
        <span aria-hidden="true">More</span>
        {biggest !== null && (
          <button type="button" className="scale-legend__note scale-legend__button" onClick={() => setPicked(biggest)}>
            <i className="is-max-swatch" /> Your biggest day
          </button>
        )}
      </div>

      {hover && (
        <FloatTip x={hover.x} y={hover.y} onDismiss={clearHover} className="float-tip--fixed">
          <span className="float-tip__title">{formatLongDate(fromDayNumber(hover.day))}</span>
          <span className="float-tip__big">{hovered ? formatDuration(hovered.ms) : '—'}</span>
          <span className="float-tip__line">
            {hovered ? `${formatNumber(hovered.plays)} plays · mostly ${hovered.top}` : 'No listening'}
          </span>
        </FloatTip>
      )}
    </div>
  )
}

type CellProps = (day: number) => {
  fill: string | undefined
  className: string
  onPointerEnter: (e: PointerEvent) => void
  onClick: (() => void) | undefined
}

function YearStrip({ year, cell, onLeave }: { year: number; cell: CellProps; onLeave: (e: PointerEvent) => void }) {
  const jan1 = new Date(year, 0, 1)
  const first = dayNumber(jan1)
  const last = dayNumber(new Date(year, 11, 31))
  const gridStart = first - ((jan1.getDay() + 6) % 7)
  const weeks = Math.floor((last - gridStart) / 7) + 1

  return (
    <svg
      viewBox={`0 0 ${LEFT + weeks * STEP} ${TOP + 7 * STEP}`}
      className="calendar__svg"
      role="img"
      aria-label={`Daily listening in ${year}`}
      onPointerLeave={onLeave}
    >
      {Array.from({ length: 12 }, (_, m) => {
        const col = Math.floor((dayNumber(new Date(year, m, 1)) - gridStart) / 7)
        return (
          <text key={m} x={LEFT + col * STEP} y={11} className="axis-label">
            {formatMonthShort(m)}
          </text>
        )
      })}
      {['Mon', 'Wed', 'Fri'].map((label, i) => (
        <text key={label} x={0} y={TOP + i * 2 * STEP + CELL - 3} className="axis-label">
          {label}
        </text>
      ))}
      {Array.from({ length: last - first + 1 }, (_, k) => {
        const day = first + k
        return (
          <rect
            key={day}
            x={LEFT + Math.floor((day - gridStart) / 7) * STEP}
            y={TOP + ((day - gridStart) % 7) * STEP}
            width={CELL}
            height={CELL}
            rx={3}
            {...cell(day)}
          />
        )
      })}
    </svg>
  )
}

function MonthGrid({ year, cell, onLeave }: { year: number; cell: CellProps; onLeave: (e: PointerEvent) => void }) {
  return (
    <div className="months" onPointerLeave={onLeave}>
      {Array.from({ length: 12 }, (_, m) => {
        const start = new Date(year, m, 1)
        const first = dayNumber(start)
        const length = new Date(year, m + 1, 0).getDate()
        const offset = (start.getDay() + 6) % 7
        const rows = Math.ceil((offset + length) / 7)
        return (
          <div key={m} className="month">
            <span className="month__label">{formatMonthShort(m)}</span>
            <svg viewBox={`0 0 ${7 * STEP - GAP} ${rows * STEP - GAP}`} role="img" aria-label={`Daily listening in ${formatMonthShort(m)} ${year}`}>
              {Array.from({ length }, (_, k) => {
                const slot = offset + k
                return (
                  <rect
                    key={k}
                    x={(slot % 7) * STEP}
                    y={Math.floor(slot / 7) * STEP}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    {...cell(first + k)}
                  />
                )
              })}
            </svg>
          </div>
        )
      })}
    </div>
  )
}
