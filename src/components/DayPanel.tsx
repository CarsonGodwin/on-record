import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { dayDetail } from '../data/insights'
import { fromDayNumber, isSkip } from '../data/stats'
import { formatDuration, formatHour, formatLongDate, formatNumber, formatTime } from '../lib/format'
import { colorFor } from '../lib/palette'
import type { Play } from '../types'
import { Cover } from './Cover'

/*
 * The detail view under "Every Day": what you played on one day, when, and
 * the full play-by-play. Opened by clicking a square; arrows step between days.
 */

const LOG_PREVIEW = 12

interface Props {
  day: number
  plays: Play[]
  firstHeard: Map<string, number>
  colors: Map<string, string>
  /** Previous / next day with listening, if any */
  prev: number | null
  next: number | null
  onSelect: (day: number) => void
  onClose: () => void
}

export function DayPanel({ day, plays, firstHeard, colors, prev, next, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const detail = useMemo(() => dayDetail(plays, day, firstHeard), [plays, day, firstHeard])
  // The full log stays open only for the day it was opened on
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const showAll = expandedDay === day

  // Bring the panel on screen when it opens or the day changes
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [day])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowLeft' && prev !== null) onSelect(prev)
    else if (e.key === 'ArrowRight' && next !== null) onSelect(next)
    else return
    e.preventDefault()
  }

  const { plays: log, hours } = detail
  const peakHour = Math.max(...hours, 1)
  const topArtists = detail.artists.slice(0, 5)
  const topSongs = detail.songs.slice(0, 5)
  const artistMax = topArtists[0]?.ms ?? 1
  const first = log[0]
  const last = log[log.length - 1]

  return (
    <div className="day-panel" ref={ref} tabIndex={-1} onKeyDown={onKeyDown} role="region" aria-label={`Listening on ${formatLongDate(fromDayNumber(day))}`}>
      <header className="day-panel__head">
        <div className="day-panel__nav">
          <button type="button" className="day-panel__step" disabled={prev === null} onClick={() => prev !== null && onSelect(prev)} aria-label="Previous day with listening">
            ←
          </button>
          <button type="button" className="day-panel__step" disabled={next === null} onClick={() => next !== null && onSelect(next)} aria-label="Next day with listening">
            →
          </button>
        </div>
        <div className="day-panel__titles">
          <h3>{formatLongDate(fromDayNumber(day))}</h3>
          {first && (
            <span className="muted">
              {formatTime(first.endTime - first.msPlayed)} – {formatTime(last.endTime)}
            </span>
          )}
        </div>
        <button type="button" className="day-panel__close" onClick={onClose} aria-label="Close day details">
          ×
        </button>
      </header>

      <dl className="day-panel__stats">
        <div>
          <dt>Listened</dt>
          <dd>{formatDuration(detail.ms)}</dd>
        </div>
        <div>
          <dt>Plays</dt>
          <dd>{formatNumber(detail.streams)}</dd>
        </div>
        <div>
          <dt>Artists</dt>
          <dd>{formatNumber(detail.artists.length)}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{formatNumber(detail.skips)}</dd>
        </div>
      </dl>

      <div className="day-panel__hours" role="img" aria-label="Listening by hour of the day">
        <div className="day-panel__bars">
          {hours.map((ms, h) => (
            <i
              key={h}
              className={ms ? undefined : 'is-empty'}
              style={{ height: `${Math.max(ms / peakHour, ms ? 0.06 : 0) * 100}%` }}
              title={`${formatHour(h)}: ${ms ? formatDuration(ms) : 'nothing'}`}
            />
          ))}
        </div>
        <div className="day-panel__axis" aria-hidden="true">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      </div>

      {detail.firstTimers.length > 0 && (
        <p className="day-panel__new">
          <span className="day-panel__label">First time hearing</span>
          {detail.firstTimers.map((name) => (
            <span key={name} className="day-panel__chip">
              {name}
            </span>
          ))}
        </p>
      )}

      <div className="day-panel__cols">
        <section>
          <h4 className="day-panel__label">Top artists</h4>
          <ol className="day-panel__list">
            {topArtists.map((a) => (
              <li key={a.name}>
                <Cover name={a.name} size={36} />
                <div className="day-panel__main">
                  <span className="day-panel__name">{a.name}</span>
                  <span className="day-panel__bar" aria-hidden="true">
                    <i style={{ width: `${(a.ms / artistMax) * 100}%`, background: colorFor(colors, a.name) }} />
                  </span>
                </div>
                <span className="day-panel__value">{formatDuration(a.ms)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h4 className="day-panel__label">Most played</h4>
          <ol className="day-panel__list">
            {topSongs.map((s) => (
              <li key={s.key}>
                <Cover name={`${s.title}|${s.artist}`} size={36} />
                <div className="day-panel__main">
                  <span className="day-panel__name">{s.title}</span>
                  <span className="day-panel__sub">{s.artist}</span>
                </div>
                <span className="day-panel__value">×{s.plays}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section>
        <h4 className="day-panel__label">Every play · {formatNumber(log.length)}</h4>
        <ol className="day-panel__log">
          {(showAll ? log : log.slice(0, LOG_PREVIEW)).map((p, i) => {
            const skipped = p.kind === 'track' && isSkip(p)
            return (
              <li key={i} className={skipped ? 'is-skipped' : undefined}>
                <time>{formatTime(p.endTime - p.msPlayed)}</time>
                <span className="day-panel__main">
                  <span className="day-panel__name">{p.title}</span>
                  <span className="day-panel__sub">{p.artist}</span>
                </span>
                <span className="day-panel__value">{skipped ? 'skipped' : formatDuration(p.msPlayed)}</span>
              </li>
            )
          })}
        </ol>
        {log.length > LOG_PREVIEW && (
          <button type="button" className="chip-button" onClick={() => setExpandedDay(showAll ? null : day)}>
            {showAll ? 'Show less' : `Show all ${formatNumber(log.length)} plays`}
          </button>
        )}
      </section>
    </div>
  )
}
