import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { DayTotal } from '../data/insights'
import type { Play } from '../types'
import { dayNumber, fromDayNumber } from '../data/stats'
import { formatDuration, formatLongDate, formatMonthShort, formatMonthYear, formatNumber } from '../lib/format'
import { useWidth } from '../lib/hooks'
import { HEAT, heatStep, quantileThresholds } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { DayPanel } from './DayPanel'
import { FloatTip } from './ui'

/*
 * "Every Day": one square per day. Wide screens get a GitHub-style strip per
 * year; phones get a one-month calendar widget with a month picker.
 * Clicking a day opens its details under that year (or under the widget).
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

  const legend = (
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
  )

  if (width < 640) {
    return (
      <div className="calendar" ref={ref}>
        <MonthWidget days={days} years={years} listened={listened} thresholds={thresholds} biggest={biggest} selected={selected} onPick={setPicked} />
        {selected !== null && (
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
            <YearStrip year={year} cell={cell} onLeave={leaveUnlessTouch(clearHover)} />
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

      {legend}

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

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** A month as one number, so months compare and step like days do */
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth()
const monthDate = (key: number) => new Date(Math.floor(key / 12), key % 12, 1)

interface WidgetProps {
  days: Map<number, DayTotal>
  years: number[]
  /** Days with listening, ascending */
  listened: number[]
  thresholds: number[]
  biggest: number | null
  selected: number | null
  onPick: (day: number | null) => void
}

/**
 * The phone calendar: opens on every month at a glance, so you explore down
 * into a month (stepped with the arrows or a swipe) and then a day, and tap
 * the month's title to come back up.
 */
function MonthWidget({ days, years, listened, thresholds, biggest, selected, onPick }: WidgetProps) {
  const first = listened.length ? monthKey(fromDayNumber(listened[0])) : monthKey(new Date(years[0] ?? 2000, 0, 1))
  const last = listened.length ? monthKey(fromDayNumber(listened[listened.length - 1])) : first
  const [view, setView] = useState(selected === null ? null : monthKey(fromDayNumber(selected)))
  // Starts on the overview of months, unless a day is already open
  const [picking, setPicking] = useState(selected === null)
  // Whatever picks a day (a tap, the day panel's arrows, the biggest-day button) brings its month into view
  const [shownDay, setShownDay] = useState(selected)
  if (selected !== shownDay) {
    setShownDay(selected)
    if (selected !== null) {
      setView(monthKey(fromDayNumber(selected)))
      setPicking(false)
    }
  }
  // Opens on your latest month; a view left over from another year filter falls back to it too
  const month = view !== null && view >= first && view <= last ? view : last

  // Totals per month, for the header and the picker's shading
  const months = useMemo(() => {
    const totals = new Map<number, { ms: number; days: number }>()
    for (const [day, v] of days) {
      const key = monthKey(fromDayNumber(day))
      const t = totals.get(key) ?? { ms: 0, days: 0 }
      t.ms += v.ms
      t.days++
      totals.set(key, t)
    }
    return totals
  }, [days])
  const monthThresholds = useMemo(() => quantileThresholds([...months.values()].map((t) => t.ms)), [months])

  const go = (key: number) => {
    setView(key)
    setPicking(false)
    if (selected !== null && monthKey(fromDayNumber(selected)) !== key) onPick(null)
  }

  // A sideways swipe on the grid steps a month
  const swipe = useRef<number | null>(null)
  const onPointerDown = (e: PointerEvent) => {
    swipe.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (swipe.current === null) return
    const dx = e.clientX - swipe.current
    swipe.current = null
    if (dx > 50 && month > first) go(month - 1)
    else if (dx < -50 && month < last) go(month + 1)
  }

  const start = monthDate(month)
  const firstDay = dayNumber(start)
  const length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const offset = (start.getDay() + 6) % 7
  const total = months.get(month)
  const pickerYears = years.filter((y) => y * 12 + 11 >= first && y * 12 <= last)
  const span = pickerYears.length > 1 ? `${pickerYears[0]} – ${pickerYears[pickerYears.length - 1]}` : `${pickerYears[0] ?? ''}`
  let spanMs = 0
  for (const t of months.values()) spanMs += t.ms

  return (
    <div className="mcal">
      {picking ? (
        <div className="mcal__head">
          <div className="mcal__title is-static">
            <span className="mcal__month">{span}</span>
            <span className="mcal__sum">
              {formatDuration(spanMs)} · {formatNumber(listened.length)} days with music
            </span>
          </div>
        </div>
      ) : (
        <div className="mcal__head">
          <button type="button" className="mcal__step" disabled={month <= first} onClick={() => go(month - 1)} aria-label="Previous month">
            ←
          </button>
          <button type="button" className="mcal__title" onClick={() => setPicking(true)} aria-label={`${formatMonthYear(start)}, back to all months`}>
            <span className="mcal__up">↑ All months</span>
            <span className="mcal__month">{formatMonthYear(start)}</span>
            <span className="mcal__sum">{total ? `${formatDuration(total.ms)} · ${total.days} days with music` : 'No listening'}</span>
          </button>
          <button type="button" className="mcal__step" disabled={month >= last} onClick={() => go(month + 1)} aria-label="Next month">
            →
          </button>
        </div>
      )}

      {picking ? (
        <div className="mcal__picker">
          {pickerYears.map((y) => (
            <div key={y} className="mcal__year">
              <span className="mcal__year-label">{y}</span>
              <div className="mcal__year-months">
                {Array.from({ length: 12 }, (_, m) => {
                  const key = y * 12 + m
                  const t = months.get(key)
                  const fill = t ? heatStep(t.ms, monthThresholds) : undefined
                  return (
                    <button
                      key={m}
                      type="button"
                      className={['mcal__pick', key === view && 'is-current', fill && HEAT.indexOf(fill) >= 4 && 'is-bright'].filter(Boolean).join(' ')}
                      style={fill ? { background: fill } : undefined}
                      disabled={!t}
                      onClick={() => go(key)}
                      aria-label={`${formatMonthYear(monthDate(key))}${t ? `, ${formatDuration(t.ms)}` : ''}`}
                    >
                      {formatMonthShort(m)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mcal__grid" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="mcal__weekday" aria-hidden="true">
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad${i}`} />
          ))}
          {Array.from({ length }, (_, k) => {
            const day = firstDay + k
            const v = days.get(day)
            const fill = v ? heatStep(v.ms, thresholds) : undefined
            const classes = [
              'mcal__day',
              !v && 'is-empty',
              fill && HEAT.indexOf(fill) >= 4 && 'is-bright',
              day === biggest && 'is-max',
              day === selected && 'is-selected',
            ]
            return (
              <button
                key={day}
                type="button"
                className={classes.filter(Boolean).join(' ')}
                style={fill ? { background: fill } : undefined}
                disabled={!v}
                aria-pressed={day === selected}
                aria-label={`${formatLongDate(fromDayNumber(day))}: ${v ? formatDuration(v.ms) : 'no listening'}`}
                onClick={() => onPick(day === selected ? null : day)}
              >
                {k + 1}
              </button>
            )
          })}
        </div>
      )}

      <div className="scale-legend mcal__legend">
        <span aria-hidden="true">Less</span>
        {HEAT.map((c) => (
          <i key={c} style={{ background: c }} aria-hidden="true" />
        ))}
        <span aria-hidden="true">More</span>
        {biggest !== null && (
          <button type="button" className="scale-legend__note scale-legend__button" onClick={() => onPick(biggest)}>
            <i className="is-max-swatch" /> Biggest day
          </button>
        )}
      </div>
    </div>
  )
}
