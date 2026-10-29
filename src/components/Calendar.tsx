import { useCallback, useContext, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import type { DayTotal } from '../data/insights'
import type { Play } from '../types'
import { dayNumber, fromDayNumber } from '../data/stats'
import { formatDuration, formatLongDate, formatMonthShort, formatMonthYear, formatNumber, formatShortDate } from '../lib/format'
import { useWidth } from '../lib/hooks'
import { HEAT, heatStep, quantileThresholds } from '../lib/palette'
import { isHover, leaveUnlessTouch } from '../lib/pointer'
import { useCloseOnBack } from '../lib/back'
import { InCards } from '../lib/stage'
import { DayPanel } from './DayPanel'
import { FloatTip, Segmented } from './ui'

/*
 * "Every Day": one square per day, a year at a time. Wide screens get a
 * GitHub-style strip for the year you pick; phones get a calendar: pick a
 * year, then a month, then a day, or jump straight to a date. Clicking a day
 * opens everything you played that day (on a phone's card, over the calendar).
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

/** A month as one number, so months compare and step like days do */
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth()
const monthDate = (key: number) => new Date(Math.floor(key / 12), key % 12, 1)

export function Calendar({ days, years, plays, firstHeard, colors }: Props) {
  const inCards = useContext(InCards)
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

  // The year on show: the one you chose, else the latest. Picking a day elsewhere (the panel's
  // arrows crossing New Year, the biggest-day button) brings its year along.
  const [chosenYear, setChosenYear] = useState<number | null>(null)
  const [shownDay, setShownDay] = useState(selected)
  if (selected !== shownDay) {
    setShownDay(selected)
    if (selected !== null) setChosenYear(fromDayNumber(selected).getFullYear())
  }
  const year = chosenYear !== null && years.includes(chosenYear) ? chosenYear : years[years.length - 1]
  useCloseOnBack(inCards && selected !== null, () => setPicked(null))

  const panel = selected !== null && (
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
  )

  if (inCards || width < 640) {
    return (
      <div className={inCards ? 'calendar calendar--card' : 'calendar'} ref={ref}>
        <DayWidget
          days={days}
          years={years}
          listened={listened}
          thresholds={thresholds}
          biggest={biggest}
          selected={selected}
          year={year}
          onYear={setChosenYear}
          onPick={setPicked}
        />
        {panel}
      </div>
    )
  }

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
    <div className="calendar" ref={ref}>
      <div className="calendar__year">
        <div className="calendar__head">
          {years.length > 1 ? (
            <Segmented
              label="Year"
              value={year}
              onChange={(y) => {
                setChosenYear(y)
                if (selected !== null && fromDayNumber(selected).getFullYear() !== y) setPicked(null)
              }}
              options={years.map((y) => ({ value: y, label: String(y) }))}
            />
          ) : (
            <span className="calendar__label">{year}</span>
          )}
          <span className="muted">
            {formatNumber(yearMs / 3_600_000)} hrs, {active} days with music
          </span>
        </div>
        <YearStrip year={year} cell={cell} onLeave={leaveUnlessTouch(clearHover)} />
        {selected !== null && selected >= first && selected <= last && panel}
      </div>

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
            {hovered ? `${formatNumber(hovered.plays)} plays, mostly ${hovered.top}` : 'No listening'}
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

/** "2024-03-04" for a date input, in local time */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface WidgetProps {
  days: Map<number, DayTotal>
  years: number[]
  /** Days with listening, ascending */
  listened: number[]
  thresholds: number[]
  biggest: number | null
  selected: number | null
  year: number
  onYear: (year: number) => void
  onPick: (day: number | null) => void
}

/**
 * The phone calendar, everything on one screen: the year, its twelve months
 * shaded by how much you listened, and the month you're in as an ordinary
 * calendar. Any day is three taps away, or one with Find a date.
 */
function DayWidget({ days, years, listened, thresholds, biggest, selected, year, onYear, onPick }: WidgetProps) {
  // Totals per month, for the month chips and the header
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

  // The month on show: the one you picked in this year, else the picked day's, else the year's busiest
  const [chosenMonth, setChosenMonth] = useState<number | null>(null)
  const [shownDay, setShownDay] = useState(selected)
  if (selected !== shownDay) {
    setShownDay(selected)
    if (selected !== null) setChosenMonth(monthKey(fromDayNumber(selected)))
  }
  const busiest = useMemo(() => {
    let best: number | null = null
    for (let m = 0; m < 12; m++) {
      const key = year * 12 + m
      if (months.has(key) && (best === null || months.get(key)!.ms > months.get(best)!.ms)) best = key
    }
    return best ?? year * 12
  }, [months, year])
  const month = chosenMonth !== null && Math.floor(chosenMonth / 12) === year ? chosenMonth : busiest

  // A date you looked for that had no listening, said in the header instead of opening an empty day
  const [missed, setMissed] = useState<number | null>(null)

  const go = (key: number) => {
    setChosenMonth(key)
    setMissed(null)
    onYear(Math.floor(key / 12))
  }

  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const yearIndex = years.indexOf(year)

  const start = monthDate(month)
  const firstDay = dayNumber(start)
  const length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  const offset = (start.getDay() + 6) % 7
  const total = months.get(month)

  const findDate = (e: ChangeEvent<HTMLInputElement>) => {
    const [y, m, d] = e.target.value.split('-').map(Number)
    if (!y || !m || !d) return
    const day = dayNumber(new Date(y, m - 1, d))
    go(y * 12 + m - 1)
    onPick(days.has(day) ? day : null)
    if (!days.has(day)) setMissed(day)
  }

  return (
    <div className="daycal">
      <div className="daycal__years">
        <button type="button" className="daycal__step" disabled={yearIndex <= 0} onClick={() => onYear(years[yearIndex - 1])} aria-label="Previous year">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="daycal__year" aria-live="polite">
          {year}
        </span>
        <button type="button" className="daycal__step" disabled={yearIndex >= years.length - 1} onClick={() => onYear(years[yearIndex + 1])} aria-label="Next year">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {/* The phone's own date wheel, under a button that says what it's for. 16px keeps iOS from zooming in. */}
        <label className="daycal__find">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="M15 15l5 5" />
          </svg>
          Find a date
          <input
            type="date"
            min={listened.length ? isoDay(fromDayNumber(listened[0])) : `${firstYear}-01-01`}
            max={listened.length ? isoDay(fromDayNumber(listened[listened.length - 1])) : `${lastYear}-12-31`}
            value={selected !== null ? isoDay(fromDayNumber(selected)) : ''}
            onChange={findDate}
            aria-label="Find a date"
          />
        </label>
      </div>

      <div className="daycal__months" role="group" aria-label={`Months of ${year}`}>
        {Array.from({ length: 12 }, (_, m) => {
          const key = year * 12 + m
          const t = months.get(key)
          const fill = t ? heatStep(t.ms, monthThresholds) : undefined
          return (
            // A dot of heat rather than a whole tinted chip, so the month you're in and the days under it stand out
            <button
              key={m}
              type="button"
              className="daycal__month"
              disabled={!t}
              aria-pressed={key === month}
              onClick={() => go(key)}
              aria-label={`${formatMonthYear(monthDate(key))}${t ? `, ${formatDuration(t.ms)}` : ', no listening'}`}
            >
              {fill && <i className="daycal__heat" style={{ background: fill }} aria-hidden="true" />}
              {formatMonthShort(m)}
            </button>
          )
        })}
      </div>

      <p className="daycal__title">
        <strong>{formatMonthYear(start)}</strong>
        <span aria-live="polite">
          {missed !== null
            ? `Nothing played on ${formatShortDate(fromDayNumber(missed))}`
            : total
              ? `${formatDuration(total.ms)}, ${total.days} days with music`
              : 'No listening'}
        </span>
      </p>

      <div className="daycal__grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="daycal__weekday" aria-hidden="true">
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
          const classes = ['daycal__day', fill && HEAT.indexOf(fill) >= 4 && 'is-bright', day === biggest && 'is-max', day === selected && 'is-selected']
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

      <div className="daycal__foot">
        <div className="scale-legend daycal__legend" aria-hidden="true">
          <span>Less</span>
          {HEAT.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
        {biggest !== null && (
          <button type="button" className="chip-button daycal__biggest" onClick={() => onPick(biggest)}>
            <i className="is-max-swatch" /> Biggest day
          </button>
        )}
      </div>
    </div>
  )
}
