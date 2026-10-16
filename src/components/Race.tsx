import { useEffect, useRef, useState } from 'react'
import type { Bins, RaceData } from '../data/insights'
import { formatDate, formatHours, formatMonthShort } from '../lib/format'
import { prefersReducedMotion, useSeen, useWidth } from '../lib/hooks'
import { colorFor } from '../lib/palette'
import { Cover } from './Cover'

/*
 * "The Race": cumulative listening per artist, replayed week by week (or
 * month by month), as a bar chart race. Give it a `key` per range so a new
 * range starts a fresh race.
 */

const TOP = 10

interface Props {
  bins: Bins
  race: RaceData
  colors: Map<string, string>
}

export function Race({ bins, race, colors }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeen(ref, 0.35)
  const width = useWidth(ref, 900)
  const rowH = width < 600 ? 38 : 46
  const frames = race.frames
  // The whole race takes about 25 seconds, whatever the range
  const frameMs = Math.max(60, Math.min(450, 25_000 / Math.max(frames, 1)))

  // Reduced motion: skip straight to the final standings
  const [t, setT] = useState(() => (prefersReducedMotion() ? frames - 1 : 0))
  const tRef = useRef(t)
  // null until the viewer touches the controls: then it autoplays once scrolled into view
  const [choice, setChoice] = useState<boolean | null>(null)
  const playing = choice ?? (seen && t < frames - 1)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      tRef.current = Math.min(frames - 1, tRef.current + (now - last) / frameMs)
      last = now
      setT(tRef.current)
      if (tRef.current >= frames - 1) {
        setChoice(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, frames, frameMs])

  const f0 = Math.min(Math.floor(t), frames - 1)
  const f1 = Math.min(frames - 1, f0 + 1)
  const frac = t - f0
  const n = race.names.length
  const values = race.names.map((name, i) => {
    const a = race.values[f0 * n + i]
    const b = race.values[f1 * n + i]
    return { name, ms: a + (b - a) * frac }
  })
  const ranked = [...values].sort((a, b) => b.ms - a.ms)
  const rank = new Map(ranked.map((v, i) => [v.name, i]))
  const max = ranked[0]?.ms || 1
  const total = values.reduce((sum, v) => sum + v.ms, 0)

  const date = new Date(bins.starts[f0] ?? bins.starts[0])
  const barArea = width - (width < 600 ? 44 : 60) - 96

  return (
    <div className="race" ref={ref}>
      <div className="race__board" style={{ height: rowH * TOP }} aria-hidden="true">
        {values.map(({ name, ms }) => {
          const r = rank.get(name)!
          const visible = r < TOP && ms > 0
          const fillPx = Math.max(4, (ms / max) * barArea)
          const nameInside = fillPx > name.length * 7.6 + 24
          return (
            <div
              key={name}
              className="race__row"
              style={{
                transform: `translateY(${Math.min(r, TOP) * rowH}px)`,
                opacity: visible ? 1 : 0,
                height: rowH,
                ['--c' as string]: colorFor(colors, name),
              }}
            >
              <span className="race__rank">{r + 1}</span>
              <Cover name={name} size={rowH - 10} className="race__cover" />
              <div className="race__track">
                <div className="race__fill" style={{ width: fillPx }}>
                  {nameInside && <span className="race__name">{name}</span>}
                </div>
                <span className="race__value">
                  {!nameInside && <span className="race__name race__name--out">{name}</span>}
                  {formatHours(ms)}
                </span>
              </div>
            </div>
          )
        })}
        <div className="race__date">
          <span>{bins.size === 'month' ? formatMonthShort(date.getMonth()) : formatDate(date).replace(/,? \d{4}$/, '')}</span>
          <b>{date.getFullYear()}</b>
          <small>{formatHours(total)} by now</small>
        </div>
      </div>

      <ol className="sr-only">
        {ranked.slice(0, TOP).map((v) => (
          <li key={v.name}>
            {v.name}: {formatHours(v.ms)}
          </li>
        ))}
      </ol>

      <div className="race__controls">
        <button
          type="button"
          className="round-button"
          aria-label={playing ? 'Pause' : t >= frames - 1 ? 'Replay' : 'Play'}
          onClick={() => {
            if (!playing && tRef.current >= frames - 1) {
              tRef.current = 0
              setT(0)
            }
            setChoice(!playing)
          }}
        >
          {playing ? (
            <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true">
              <rect x="1" y="1" width="4.5" height="16" rx="1.2" />
              <rect x="10.5" y="1" width="4.5" height="16" rx="1.2" />
            </svg>
          ) : t >= frames - 1 ? (
            '↻'
          ) : (
            '▶'
          )}
        </button>
        <input
          type="range"
          className="scrubber"
          min={0}
          max={frames - 1}
          step={0.01}
          value={t}
          aria-label="Race position"
          onChange={(e) => {
            setChoice(false)
            tRef.current = Number(e.target.value)
            setT(tRef.current)
          }}
          style={{ ['--progress' as string]: `${(t / Math.max(frames - 1, 1)) * 100}%` }}
        />
      </div>
    </div>
  )
}
