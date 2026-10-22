import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bins, RaceData } from '../data/insights'
import { formatDate, formatHours, formatMonthShort } from '../lib/format'
import { prefersReducedMotion, useSeen, useSize, useWidth } from '../lib/hooks'
import { colorFor } from '../lib/palette'
import { InCards, Offstage } from '../lib/stage'
import { raceFrameMs } from '../viz/raceVideo'
import { Cover } from './Cover'
import { RaceExport } from './RaceExport'

/*
 * "The Race": cumulative listening per artist, replayed week by week (or
 * month by month), as a bar chart race. Give it a `key` per range so a new
 * range starts a fresh race.
 */

const TOP = 10
/** On a phone's card the rows share out the height there is, within these bounds */
const CARD_ROW = { min: 26, max: 46 }

interface Props {
  bins: Bins
  race: RaceData
  colors: Map<string, string>
}

export function Race({ bins, race, colors }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<HTMLDivElement>(null)
  const cards = useContext(InCards)
  const offstage = useContext(Offstage)
  const seen = useSeen(ref, 0.35)
  const width = useWidth(ref, 900)
  // A card has a fixed height: the ten rows share what the controls leave, rather than dropping any
  const room = useSize(roomRef, { width: 0, height: 0 })
  const rowH =
    cards && room.height > 0
      ? Math.max(CARD_ROW.min, Math.min(CARD_ROW.max, Math.floor(room.height / TOP)))
      : width < 600
        ? 38
        : 46
  const frames = race.frames
  const frameMs = raceFrameMs(frames)

  // Reduced motion: skip straight to the final standings
  const [t, setT] = useState(() => (prefersReducedMotion() ? frames - 1 : 0))
  const tRef = useRef(t)
  // On the page: null until the viewer touches the controls, autoplaying once scrolled into view.
  // On a card, the card coming on screen plays it (see below), so null just means paused.
  const [choice, setChoice] = useState<boolean | null>(null)
  const playing = cards ? choice === true : (choice ?? (seen && t < frames - 1))
  // While the story video renders (or is on show), the page race waits, so the two don't fight over the phone
  const [exporting, setExporting] = useState(false)
  // The rAF loop counts from tRef, so a rewind worked out while rendering (below) moves it too
  const [rewinds, setRewinds] = useState(0)
  useLayoutEffect(() => {
    if (rewinds) tRef.current = 0
  }, [rewinds])

  /*
   * On a card the race plays like a video when its card is dealt: from the start the first time and
   * after it has finished, picking up where it was if it was playing when you swiped away. Offstage,
   * it pauses. Worked out while rendering, when the card's stage changes.
   */
  const here = cards && !offstage
  const [stage, setStage] = useState({ here: false, started: false, resume: false })
  if (cards && here !== stage.here) {
    if (!here) {
      setStage({ here, started: stage.started, resume: playing })
      if (playing) setChoice(false)
    } else {
      const restart = !stage.started || t >= frames - 1
      const go = !prefersReducedMotion() && !exporting && (restart || stage.resume)
      setStage({ here, started: stage.started || go, resume: false })
      if (go) {
        if (restart) {
          setT(0)
          setRewinds(rewinds + 1)
        }
        setChoice(true)
      }
    }
  }

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // The first frame's timestamp can predate `last`, which would step t below 0
      tRef.current = Math.min(frames - 1, tRef.current + Math.max(0, now - last) / frameMs)
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

  const f0 = Math.max(0, Math.min(Math.floor(t), frames - 1))
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
      <div className="race__room" ref={roomRef}>
        <div className="race__board" ref={boardRef} style={{ height: rowH * TOP }} aria-hidden="true">
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
            setStage((st) => ({ ...st, started: true }))
            setChoice(!playing)
          }}
        >
          {playing ? (
            <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true">
              <rect x="1" y="1" width="4.5" height="16" rx="1.2" />
              <rect x="10.5" y="1" width="4.5" height="16" rx="1.2" />
            </svg>
          ) : t >= frames - 1 ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
              <path d="M15.2 1.8v4h-4" />
            </svg>
          ) : (
            <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true">
              <path d="M3 1.6c0-.8.9-1.3 1.6-.9l10.3 6.6c.7.4.7 1.4 0 1.8L4.6 15.7c-.7.4-1.6-.1-1.6-.9z" />
            </svg>
          )}
        </button>
        {/* Its own drag: a swipe that starts here scrubs the race instead of dealing a card */}
        <input
          type="range"
          className="scrubber"
          data-drag=""
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

      <RaceExport
        bins={bins}
        race={race}
        colors={colors}
        board={boardRef}
        onBusy={(busy) => {
          setExporting(busy)
          if (busy) setChoice(false)
        }}
      />
    </div>
  )
}
