import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fromDayNumber } from '../data/stats'
import { formatDuration, formatHour, formatLongDate, formatNumber, formatShortDate, formatTime } from '../lib/format'
import { useMediaQuery, useSeen, useSize, useWidth } from '../lib/hooks'
import { COARSE, useFingerDrag, useHoldDrag } from '../lib/pointer'
import { InCards } from '../lib/stage'
import { IDENTITY, usePanZoom, type View } from '../lib/zoom'
import type { Play } from '../types'
import {
  GROOVE,
  MINUTES,
  PODCAST,
  SLOT_OTHER,
  SLOT_PODCAST,
  TAU,
  drawRecord,
  quietestMinute,
  recordGeometry,
  recordGuides,
  type RecordModel,
} from '../viz/record'
import { ZoomControls } from './ZoomControls'

/*
 * "The Record": your listening pressed into vinyl. The record is the overview;
 * the deck beside it zooms into one day. Pick a day by tapping a groove, with
 * the slider, or the arrows, and the tonearm follows.
 *
 * On a phone the deck splits in two: the readout sits above the record, where
 * a thumb on the record doesn't cover it, and the controls go below. Touch
 * and hold the record, then drag, to skim it the way a mouse does by hovering.
 *
 * On a phone's card nothing scrolls, so the needle is the finger's straight
 * away: put a finger down and the needle jumps there and follows it. Two
 * fingers pinch and pan, and a double tap zooms in on that spot.
 */

interface Props {
  plays: Play[]
  model: RecordModel
  /** Colors per slot: 10 artists, then everyone else, then podcasts */
  slotColors: string[]
  legend: string[]
  title: string
  subtitle: string
  onPoster: () => void
  /** Whether a finger has scrubbed the record yet; lives above the record so a year switch doesn't bring the how-to back */
  learned: boolean
  onLearned: () => void
}

interface Needle {
  ring: number
  /** null: let the deck pick a moment with music */
  minute: number | null
}

/** Brighter "everyone else" for the day strip, where arcs are bigger */
const STRIP_OTHER = 'rgba(244, 241, 234, 0.42)'

/** Matches the CSS breakpoint where the record and deck stack */
const STACKED = '(max-width: 900px)'
export function Vinyl({ plays, model, slotColors, legend, title, subtitle, onPoster, learned, onLearned }: Props) {
  const inCards = useContext(InCards)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stage = useSize(stageRef, { width: 560, height: 560 })
  const width = stage.width
  // Leave room on the right for the tonearm; on a card, as big as the space between the readout and the key allows,
  // less a little at the top where the arm's counterweight swings up past the record's square
  const size = inCards ? Math.max(160, Math.min(Math.round(width * 0.9), Math.round(stage.height * 0.92))) : Math.min(Math.round(width * 0.86), 600)
  const g = recordGeometry(size, model.days)
  // Deep enough that a single day's groove gets about 10px wide
  const maxZoom = Math.min(100, Math.max(6, 10 / g.ring))
  const platterRef = useRef<HTMLDivElement>(null)
  const stacked = useMediaQuery(STACKED)

  const [needle, setNeedle] = useState<Needle | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  // Hovering previews a day; clicking pins it until you click away
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // The how-to on touch screens: shown once the record is in view, gone at the first touch
  const seen = useSeen(platterRef, 0.6)
  const [touched, setTouched] = useState(false)
  // While a finger scrubs with the readout scrolled out of view, a small label under the top bar stands in for it
  const readoutRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState(false)

  // Hold and drag with a finger: skims the record like a hovering mouse, and lands where you let go
  const holding = useHoldDrag(
    platterRef,
    {
    onStart: (e) => {
      setScrubbing(true)
      setTouched(true)
      setTip(readoutHidden())
      pick(e, false)
    },
    onMove: (e) => pick(e, false),
    onEnd: () => {
      setScrubbing(false)
      setTip(false)
      setPinned(true)
      if (!learned) onLearned()
    },
    },
    !inCards,
  )
  // On a card one finger always belongs to the needle; panning takes two
  const fingerOnNeedle = useRef(true)
  const zoom = usePanZoom(platterRef, { width: size, height: size, max: maxZoom, busy: inCards ? fingerOnNeedle : holding })
  const view = zoom.view
  const zoomed = view.s > 1.01
  // The view the canvas was last drawn at; between redraws a CSS transform stretches it to the live view
  const drawn = useRef<View>(IDENTITY)
  const drawCost = useRef(0)

  const guides = useMemo(() => recordGuides(model), [model])
  const guideMinute = useMemo(() => quietestMinute(model), [model])
  const hasPodcasts = useMemo(() => plays.some((p) => p.kind !== 'track'), [plays])
  const [focus, setFocus] = useState<number | null>(null)
  const [fontsReady, setFontsReady] = useState(false)

  const biggest = useMemo(() => {
    let best = 0
    for (let i = 1; i < model.days; i++) if (model.dayMinutes[i] > model.dayMinutes[best]) best = i
    return best
  }, [model])

  const coach = !inCards && COARSE && seen && !learned && !touched && !zoomed

  // Where the needle was before a touch, in case the touch turns out to be a pinch, and before the touch
  // ahead of it, since a double tap means zoom: neither of its taps should have moved the needle
  const beforeTouch = useRef<{ needle: Needle | null; pinned: boolean } | null>(null)
  const beforeLastTouch = useRef<{ needle: Needle | null; pinned: boolean } | null>(null)
  // After a double tap the finger is zooming, not steering, until it lifts
  const zoomingTap = useRef(false)
  useFingerDrag(
    platterRef,
    {
      onStart: (e) => {
        beforeLastTouch.current = beforeTouch.current
        beforeTouch.current = { needle, pinned }
        setScrubbing(true)
        pick(e, false)
      },
      onMove: (e) => {
        if (!zoomingTap.current) pick(e, false)
      },
      onEnd: () => {
        zoomingTap.current = false
        setScrubbing(false)
        setPinned(true)
        if (!learned) onLearned()
      },
      onCancel: () => {
        setScrubbing(false)
        const was = beforeTouch.current
        if (!was) return
        setNeedle(was.needle)
        setPinned(was.pinned)
      },
      onDoubleTap: (e) => {
        zoomingTap.current = true
        const was = beforeLastTouch.current
        if (was) {
          setNeedle(was.needle)
          setPinned(was.pinned)
        }
        const r = platterRef.current!.getBoundingClientRect()
        if (zoomed) zoom.reset()
        else zoom.zoomTo(Math.min(4, maxZoom), e.clientX - r.left, e.clientY - r.top)
      },
    },
    inCards,
  )

  useEffect(() => {
    if (!pinned) return
    const release = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', release)
    return () => document.removeEventListener('pointerdown', release)
  }, [pinned])

  /** A deliberate choice (click, slider, button): moves the needle and holds it */
  function select(next: Needle) {
    setNeedle(next)
    setPinned(true)
  }
  const ring = Math.min(needle?.ring ?? biggest, model.days - 1)

  // Everything that played on the selected day
  const day = useMemo(() => {
    const arcs: number[] = []
    const byArtist = new Map<string, number>()
    const playIds = new Set<number>()
    for (let k = 0; k < model.count; k++) {
      if (model.ring[k] !== ring) continue
      arcs.push(k)
      playIds.add(model.play[k])
      const p = plays[model.play[k]]
      byArtist.set(p.artist, (byArtist.get(p.artist) ?? 0) + (model.to[k] - model.from[k]))
    }
    const top = [...byArtist].sort((a, b) => b[1] - a[1]).slice(0, 3)
    // Until you pick a time, the needle sits in the middle of the day's longest play
    const longest = arcs.reduce((best, k) => (best < 0 || model.to[k] - model.from[k] > model.to[best] - model.from[best] ? k : best), -1)
    const autoMinute = longest >= 0 ? (model.from[longest] + model.to[longest]) / 2 : 21 * 60
    return { arcs, top, plays: playIds.size, autoMinute }
  }, [model, ring, plays])
  const minute = needle?.minute ?? day.autoMinute

  const playingArc = useMemo(() => {
    let best = -1
    let bestGap = 8
    for (const k of day.arcs) {
      const gap = minute < model.from[k] ? model.from[k] - minute : minute > model.to[k] ? minute - model.to[k] : 0
      if (gap < bestGap) {
        best = k
        bestGap = gap
      }
    }
    return best
  }, [day, minute, model])
  const playing = playingArc >= 0 ? plays[model.play[playingArc]] : null
  // In a quiet moment, say what came on next
  const nextArc = playing ? -1 : day.arcs.filter((k) => model.from[k] > minute).reduce((best, k) => (best < 0 || model.from[k] < model.from[best] ? k : best), -1)
  const next = nextArc >= 0 ? plays[model.play[nextArc]] : null

  useEffect(() => {
    let live = true
    document.fonts.ready.then(() => live && setFontsReady(true))
    return () => {
      live = false
    }
  }, [])

  // Redraws keep pace with a pan or pinch, as often as drawing cost allows, so it stays sharp at any zoom;
  // between redraws a CSS transform stretches the last one to the live view.
  // The pixels and that transform always change together, outside React, so the record never jumps against
  // the overlay (needle, rings) for a frame: layout effects land in the same paint as the overlay.
  const liveView = useRef(view)
  const settledView = useRef(view)
  const drawLatest = useRef<() => void>(() => {})
  const lastDraw = useRef(0)
  const queued = useRef({ timer: 0, frame: 0 })

  /** Stretches the last drawing to the live view */
  function place(canvas: HTMLCanvasElement) {
    const v = liveView.current
    const d = drawn.current
    const k = v.s / d.s
    canvas.style.transform = k === 1 && v.x === d.x && v.y === d.y ? '' : `translate(${v.x - k * d.x}px, ${v.y - k * d.y}px) scale(${k})`
  }

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    liveView.current = view
    place(canvas)
    const onlyMoved = settledView.current !== view
    settledView.current = view
    drawLatest.current = () => {
      // Always the newest view React has put on screen, even if this closure is older
      const view = liveView.current
      const t0 = performance.now()
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      const px = Math.round(size * dpr)
      if (canvas.width !== px) {
        canvas.width = px
        canvas.height = px
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(view.s, 0, 0, view.s, view.x * dpr, view.y * dpr)
      drawRecord(ctx, model, {
        size: canvas.width,
        colors: slotColors,
        focus,
        title,
        subtitle,
        labelColor: slotColors[0],
        sheen: false,
        ink: 'rgba(244, 241, 234, 0.55)',
        guides,
        guideMinute,
        // Small enough on screen to keep the glow on every record
        glow: true,
        zoom: view.s,
        visible: {
          x0: (-view.x * dpr) / view.s,
          y0: (-view.y * dpr) / view.s,
          x1: (canvas.width - view.x * dpr) / view.s,
          y1: (canvas.height - view.y * dpr) / view.s,
        },
      })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      lastDraw.current = performance.now()
      drawCost.current = lastDraw.current - t0
      drawn.current = view
      place(canvas)
    }
    const q = queued.current
    if (!onlyMoved) {
      window.clearTimeout(q.timer)
      cancelAnimationFrame(q.frame)
      q.timer = q.frame = 0
      drawLatest.current()
      return
    }
    // One redraw in flight at a time, drawing whatever the view is by then.
    // Slow draws leave a gap after each one so the gesture itself doesn't stutter.
    if (q.timer || q.frame) return
    const wait = Math.max(0, lastDraw.current + drawCost.current * 2 - performance.now())
    q.timer = window.setTimeout(() => {
      q.timer = 0
      q.frame = requestAnimationFrame(() => {
        q.frame = 0
        drawLatest.current()
      })
    }, wait)
  }, [model, size, slotColors, focus, title, subtitle, guides, guideMinute, fontsReady, view])
  useEffect(() => {
    const q = queued.current
    return () => {
      window.clearTimeout(q.timer)
      cancelAnimationFrame(q.frame)
    }
  }, [])

  /** True when the stacked readout's date or song is under the top bar or below the screen */
  function readoutHidden() {
    const r = readoutRef.current?.getBoundingClientRect()
    if (!r) return false
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0
    return r.top < bar || r.top + 120 > window.innerHeight
  }

  /** Moves the needle to wherever the pointer is on the record */
  function pick(e: { clientX: number; clientY: number }, hold: boolean) {
    // Measure against the platter: the canvas itself may be mid-stretch
    const rect = platterRef.current!.getBoundingClientRect()
    const dx = (e.clientX - rect.left - view.x) / view.s - g.center
    const dy = (e.clientY - rect.top - view.y) / view.s - g.center
    const radius = Math.hypot(dx, dy)
    if (radius < g.inner || radius > g.outer) {
      // Clicking the blank part of the sleeve lets go
      if (hold) setPinned(false)
      return
    }
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU
    const nextRing = Math.min(model.days - 1, Math.floor((radius - g.inner) / g.ring))
    // Whole minutes are plenty; skip updates that wouldn't change anything visible
    const nextMinute = Math.round((angle / TAU) * MINUTES)
    if (hold) {
      select({ ring: nextRing, minute: nextMinute })
      return
    }
    setNeedle((cur) => (cur && cur.ring === nextRing && cur.minute !== null && Math.round(cur.minute) === nextMinute ? cur : { ring: nextRing, minute: nextMinute }))
  }

  /** Moves to another day, keeping the time you picked (if you picked one) */
  function goTo(nextRing: number) {
    select({ ring: Math.max(0, Math.min(model.days - 1, nextRing)), minute: needle?.minute ?? null })
  }

  function randomDay() {
    const withMusic: number[] = []
    for (let i = 0; i < model.days; i++) if (model.dayMinutes[i] > 0 && i !== ring) withMusic.push(i)
    if (withMusic.length) select({ ring: withMusic[Math.floor(Math.random() * withMusic.length)], minute: null })
  }

  const date = fromDayNumber(model.firstDay + ring)
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(minute))
  const ringR = g.inner + (ring + 0.5) * g.ring
  const angle = (minute / MINUTES) * TAU
  // Overlay positions on screen, with the zoom applied
  const cx = view.x + view.s * g.center
  const cy = view.y + view.s * g.center
  const ringOnScreen = ringR * view.s
  const grooveOnScreen = g.ring * view.s
  const stripColor = (slot: number) => (slot === SLOT_OTHER ? STRIP_OTHER : slotColors[slot])

  const heading = (
    <>
      <div className="deck__date">{formatLongDate(date)}</div>
      <div className="deck__meta">
        {model.dayMinutes[ring] > 0 ? (
          <>
            {/* The badge needs the room, so "of listening" makes way for it */}
            <span className="deck__stat">
              {formatDuration(model.dayMinutes[ring] * 60_000)}
              {ring !== biggest && ' of listening'} · {formatNumber(day.plays)} plays
            </span>
            {ring === biggest && <span className="deck__badge">Biggest day</span>}
          </>
        ) : (
          'A quiet day: nothing played'
        )}
      </div>
    </>
  )

  const strip = (
    <DayStrip
      height={inCards ? 30 : COARSE ? 54 : 46}
      arcs={day.arcs}
      model={model}
      color={stripColor}
      minute={minute}
      onMinute={(m) => {
        setTouched(true)
        select({ ring, minute: m })
      }}
    />
  )

  const now = (
    <div className="deck__now">
      <span className="deck__time">{formatTime(at)}</span>
      {playing ? (
        <span className="deck__track">
          <strong>{playing.title}</strong>
          <span>{playing.artist}</span>
        </span>
      ) : (
        <span className="deck__track deck__track--quiet">
          <strong>Nothing playing</strong>
          {next && (
            <span>
              Next, at {formatTime(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, Math.round(model.from[nextArc])))}:{' '}
              {next.title} by {next.artist}
            </span>
          )}
        </span>
      )}
    </div>
  )

  const controls = (
    <>
      {/* Always rendered: quiet days keep the same height as busy ones */}
      <p className="deck__top">
        {day.top.length > 0 && (
          <>
            Mostly{' '}
            {day.top.map(([artist], i) => (
              <span key={artist}>
                {i > 0 && (i === day.top.length - 1 ? ' and ' : ', ')}
                <b>{artist}</b>
              </span>
            ))}
          </>
        )}
      </p>

      <div className="deck__nav">
        <button type="button" className="icon-button" aria-label="Previous day" onClick={() => goTo(ring - 1)} disabled={ring <= 0}>
          ‹
        </button>
        <input
          type="range"
          className="scrubber"
          min={0}
          max={model.days - 1}
          value={ring}
          aria-label="Day"
          aria-valuetext={formatLongDate(date)}
          onChange={(e) => goTo(Number(e.target.value))}
          style={{ ['--progress' as string]: `${(ring / Math.max(model.days - 1, 1)) * 100}%` }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Next day"
          onClick={() => goTo(ring + 1)}
          disabled={ring >= model.days - 1}
        >
          ›
        </button>
      </div>
      <div className="deck__jumps">
        <button type="button" className="chip-button" onClick={() => select({ ring: biggest, minute: null })}>
          Biggest day
        </button>
        <button type="button" className="chip-button" onClick={randomDay}>
          Random day
        </button>
      </div>
    </>
  )

  const platter = (
    <div
      className={zoomed ? 'vinyl__platter is-zoomed' : 'vinyl__platter'}
      ref={platterRef}
      style={{ width: size, height: size }}
      data-drag={inCards ? '' : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Your listening as a vinyl record: ${model.days} grooves, one per day. Use the controls next to it to explore one day at a time.`}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || pinned || e.buttons !== 0) return
          setScrubbing(true)
          pick(e, false)
        }}
        onPointerLeave={() => setScrubbing(false)}
        onClick={(e) => {
          setScrubbing(false)
          setTouched(true)
          pick(e, true)
        }}
      />
      <div
        className="vinyl__sheen"
        style={{ inset: size * 0.045, transform: zoomed ? `translate(${view.x}px, ${view.y}px) scale(${view.s})` : undefined }}
        aria-hidden="true"
      />
      <svg className={['vinyl__overlay', scrubbing && 'is-scrubbing', pinned && 'is-pinned'].filter(Boolean).join(' ')} width={size} height={size} aria-hidden="true">
        {grooveOnScreen >= 5 ? (
          // Zoomed in far enough to see the groove itself: bracket it instead of drawing over it
          <>
            <circle cx={cx} cy={cy} r={ringOnScreen - grooveOnScreen / 2 - 1} className="vinyl__ring vinyl__ring--edge" />
            <circle cx={cx} cy={cy} r={ringOnScreen + grooveOnScreen / 2 + 1} className="vinyl__ring vinyl__ring--edge" />
          </>
        ) : (
          <circle cx={cx} cy={cy} r={ringOnScreen} className="vinyl__ring" />
        )}
        <circle cx={cx + ringOnScreen * Math.sin(angle)} cy={cy - ringOnScreen * Math.cos(angle)} r={5} className="vinyl__needle" />
        {!zoomed && <Tonearm size={size} radius={ringR} />}
      </svg>
      {coach && <Coach size={size} radius={(g.inner + g.outer) / 2} />}
      {tip &&
        createPortal(
          <div className="scrub-tip" aria-hidden="true">
            <span className="scrub-tip__when">
              {formatLongDate(date)} · {formatTime(at)}
            </span>
            <span className="scrub-tip__what">{playing ? `${playing.title} · ${playing.artist}` : 'Nothing playing'}</span>
          </div>,
          document.body,
        )}
    </div>
  )

  const legendItems = [
    ...legend.map((artist, i) => (
      <li key={artist}>
        <button type="button" className="legend__item" aria-pressed={focus === i} onClick={() => setFocus(focus === i ? null : i)}>
          <span className="legend__dot" style={{ background: slotColors[i] }} />
          {artist}
        </button>
      </li>
    )),
    <li key="everyone" className="legend__item legend__item--static">
      <span className="legend__dot" style={{ background: GROOVE }} />
      Everyone else
    </li>,
    ...(hasPodcasts
      ? [
          <li key="podcasts" className="legend__item legend__item--static">
            <span className="legend__dot" style={{ background: PODCAST }} />
            Podcasts
          </li>,
        ]
      : []),
  ]

  if (inCards) {
    return (
      <div className="vinyl vinyl--card" ref={rootRef}>
        <div className="vinyl__readout" aria-live="polite">
          <div className="vinyl__day">
            <p className="vinyl__date">
              <strong>{formatShortDate(date)}</strong>
              {model.dayMinutes[ring] > 0 ? (
                <span>
                  {formatDuration(model.dayMinutes[ring] * 60_000)}, {formatNumber(day.plays)} plays
                  {ring === biggest && <em> Biggest day</em>}
                </span>
              ) : (
                <span>Nothing played</span>
              )}
            </p>
            <div className="vinyl__steps">
              <StepButton label="Previous day" disabled={ring <= 0} onStep={() => goTo(ring - 1)}>
                <path d="M15 5l-7 7 7 7" />
              </StepButton>
              <button type="button" className="vinyl__step" aria-label="A random day" onClick={randomDay}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.8 0 3-2 4-4.2M14.4 9.2c.9-1.3 1.9-2.2 3.1-2.2H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />
                </svg>
              </button>
              <StepButton label="Next day" disabled={ring >= model.days - 1} onStep={() => goTo(ring + 1)}>
                <path d="M9 5l7 7-7 7" />
              </StepButton>
            </div>
          </div>
          <p className="vinyl__now">
            <span className="vinyl__time">{formatTime(at)}</span>
            {playing ? (
              <span className="vinyl__track">
                <strong>{playing.title}</strong> {playing.artist}
              </span>
            ) : (
              <span className="vinyl__track is-quiet">{next ? `Quiet until ${next.title}` : 'Quiet'}</span>
            )}
          </p>
          {strip}
        </div>

        <div className="vinyl__stage" ref={stageRef}>
          {platter}
          {zoomed && (
            <button type="button" className="chip-button vinyl__unzoom" onClick={zoom.reset}>
              Zoom out
            </button>
          )}
        </div>

        <CardLegend items={legendItems} />
      </div>
    )
  }

  return (
    <div className="vinyl" ref={rootRef}>
      {/* Stacked, this holds the readout, the record and its controls */}
      <div className="vinyl__turntable">
        {stacked && (
          // Above the record on phones, where a thumb on the record would otherwise cover what it's reading
          <div className="deck deck--readout" ref={readoutRef} aria-live="polite">
            {heading}
            {now}
            {strip}
          </div>
        )}

        <div className="vinyl__stage" ref={stageRef}>
          {platter}
          <ZoomControls zoom={zoom} className="vinyl__zoom" />
        </div>
        {stacked && <div className="deck deck--controls">{controls}</div>}
      </div>

      <div className="vinyl__side">
        {!stacked && (
          <div className="deck" aria-live="polite">
            {heading}
            {strip}
            {now}
            {controls}
          </div>
        )}

        <ul className="legend" aria-label="Artist colors">
          {legendItems}
        </ul>
        <p className="hint">
          {COARSE
            ? 'Tap a groove to pick a day. Hold and drag on the record to skim, or drag along the strip to move through a day. Pinch to zoom. Tap an artist to light up only their grooves.'
            : 'Hover the record to preview a day, click to hold it, click away to let go. Zoom in to see single days up close. Tap an artist to light up only their grooves.'}
        </p>

        <button type="button" className="button button--ghost" onClick={onPoster}>
          Make it a poster →
        </button>
      </div>
    </div>
  )
}

/**
 * A how-to for touch screens: a ghost fingertip rests on the record, then
 * drags along the grooves. Gone at the first touch, and for good once you've
 * scrubbed.
 */
function Coach({ size, radius }: { size: number; radius: number }) {
  return (
    <div className="coach" aria-hidden="true">
      <div className="coach__orbit">
        <span className="coach__finger" style={{ left: size / 2 - 22, top: size / 2 - radius - 22 }} />
      </div>
      <span className="coach__label">Hold, then drag to skim</span>
    </div>
  )
}

interface StripProps {
  /** The bar's height, without the hour labels under it */
  height: number
  arcs: number[]
  model: RecordModel
  color: (slot: number) => string
  minute: number
  onMinute: (minute: number) => void
}

/** One day, unrolled: a 24-hour bar with every play on it. Drag along it to move the needle. */
function DayStrip({ height: h, arcs, model, color, minute, onMinute }: StripProps) {
  const ref = useRef<HTMLDivElement>(null)
  const w = useWidth(ref, 300)
  const x = (m: number) => (m / MINUTES) * w

  function fromEvent(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    onMinute(Math.max(0, Math.min(MINUTES - 1, ((e.clientX - rect.left) / rect.width) * MINUTES)))
  }

  return (
    <div className="strip" ref={ref} data-drag="">
      <svg
        width={w}
        height={h + 20}
        role="img"
        aria-label="This day's listening from midnight to midnight"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromEvent(e)
        }}
        onPointerMove={(e) => e.buttons > 0 && fromEvent(e)}
      >
        <rect x={0} y={0} width={w} height={h} rx={8} className="strip__track" />
        {[3, 6, 9, 12, 15, 18, 21].map((hr) => (
          <line key={hr} x1={x(hr * 60)} x2={x(hr * 60)} y1={0} y2={h} className="strip__grid" />
        ))}
        {arcs.map((k) => (
          <rect
            key={k}
            x={x(model.from[k])}
            y={6}
            width={Math.max(1.5, x(model.to[k]) - x(model.from[k]))}
            height={h - 12}
            rx={1.5}
            fill={color(model.slot[k] === SLOT_PODCAST ? SLOT_PODCAST : model.slot[k])}
          />
        ))}
        <line x1={x(minute)} x2={x(minute)} y1={-2} y2={h + 2} className="strip__needle" />
        <circle cx={x(minute)} cy={h + 2} r={COARSE ? 6 : 4} className="strip__knob" />
        {[0, 6, 12, 18, 24].map((hr) => (
          <text
            key={hr}
            x={x(hr * 60)}
            y={h + 16}
            className="axis-label"
            textAnchor={hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle'}
          >
            {formatHour(hr % 24).replace(' ', '').toLowerCase()}
          </text>
        ))}
      </svg>
    </div>
  )
}

/**
 * A tonearm whose stylus sits on the selected groove. The arm pivots near the
 * top-right corner; solving the triangle (pivot, record center, stylus) gives
 * the angle that lands the stylus at the right radius.
 */
function Tonearm({ size: S, radius }: { size: number; radius: number }) {
  const px = 0.97 * S
  const py = 0.04 * S
  const L = 0.52 * S
  const dx = px - S / 2
  const dy = py - S / 2
  const M = Math.hypot(dx, dy)
  const k = (radius * radius - M * M - L * L) / (2 * L)
  const theta = Math.acos(Math.max(-1, Math.min(1, k / M))) - Math.atan2(dx, dy)
  const deg = (theta * 180) / Math.PI

  return (
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
  )
}

/** A day stepper: tap for one day, hold to run through them */
function StepButton({ label, disabled, onStep, children }: { label: string; disabled: boolean; onStep: () => void; children: ReactNode }) {
  const timer = useRef(0)
  const step = useRef(onStep)
  useLayoutEffect(() => {
    step.current = onStep
  })
  const stop = () => window.clearTimeout(timer.current)
  useEffect(() => stop, [])
  // Disabled at the first or last day: stop running, or the timer would keep firing into nothing
  useEffect(() => {
    if (disabled) stop()
  }, [disabled])
  return (
    <button
      type="button"
      className="vinyl__step"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        step.current()
        const run = (delay: number) => {
          timer.current = window.setTimeout(() => {
            step.current()
            run(Math.max(45, delay * 0.82))
          }, delay)
        }
        run(380)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          step.current()
        }
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

/**
 * The record's key on a card: as many artists as fit on two lines, and the
 * rest a tap away, opening over the record rather than pushing it smaller.
 */
function CardLegend({ items }: { items: ReactNode[] }) {
  const measureRef = useRef<HTMLUListElement>(null)
  const [fit, setFit] = useState(Infinity)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // A hidden copy of the whole key, measured at the card's width: everything on its first two lines fits
  useLayoutEffect(() => {
    const list = measureRef.current
    if (!list) return
    const measure = () => {
      const items = [...list.children] as HTMLElement[]
      const tops = [...new Set(items.map((li) => li.offsetTop))].sort((a, b) => a - b)
      if (tops.length <= 2) return setFit(Infinity)
      const onTwo = items.filter((li) => li.offsetTop <= tops[1]).length
      // Room for the "+n" on the second line
      setFit(Math.max(1, onTwo - 1))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [items.length])

  useEffect(() => {
    if (!open) return
    const close = (e: globalThis.PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const hiddenCount = Number.isFinite(fit) ? Math.max(0, items.length - fit) : 0

  return (
    <div className="legend-fit" ref={wrapRef}>
      <ul className="legend legend--card legend-fit__measure" ref={measureRef} aria-hidden="true">
        {items}
      </ul>
      <ul className="legend legend--card" aria-label="Artist colors">
        {hiddenCount > 0 ? items.slice(0, fit) : items}
        {hiddenCount > 0 && (
          <li>
            <button type="button" className="legend__item legend__more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Less' : `+${hiddenCount} more`}
            </button>
          </li>
        )}
      </ul>
      {open && (
        <ul className="legend legend--card legend-fit__all" aria-label="All artist colors">
          {items}
        </ul>
      )}
    </div>
  )
}
