import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fromDayNumber } from '../data/stats'
import { formatMonthYear, formatNumber } from '../lib/format'
import { prefersReducedMotion, useWidth } from '../lib/hooks'
import { createPress, drawDisc, type Press } from '../viz/pressing'
import { recordGeometry, type RecordModel } from '../viz/record'

/*
 * The Long Play's way in: a blank record and its tonearm. Swing the needle
 * onto the record (or just tap it) and every day you listened presses into
 * it, a groove at a time from the label out, with the needle riding along.
 */

interface Props {
  model: RecordModel
  /** Colors per slot, as on the record chapter */
  slotColors: string[]
  /** "2023–2026" or "2025", for the label */
  period: string
  hours: number
}

type Phase = 'idle' | 'aiming' | 'landing' | 'pressing' | 'pressed'

const PAPER = '#f4f1ea'
const PRESS_MS = 3800
/** The needle settles onto the first groove before pressing starts */
const LANDING_MS = 520
/** Pixels a press can wander before it's aiming the arm rather than tapping */
const SLOP = 6

/*
 * The arm pivots near the top-right corner, like the record chapter's. Angles
 * are degrees clockwise from hanging straight down, which is off the record.
 */
function pivot(S: number) {
  return { px: 0.97 * S, py: 0.04 * S, L: 0.52 * S }
}

/** The arm angle that lands the stylus `r` from the record's center */
function angleFor(S: number, r: number): number {
  const { px, py, L } = pivot(S)
  const dx = px - S / 2
  const dy = py - S / 2
  const M = Math.hypot(dx, dy)
  const k = (r * r - M * M - L * L) / (2 * L)
  return ((Math.acos(Math.max(-1, Math.min(1, k / M))) - Math.atan2(dx, dy)) * 180) / Math.PI
}

/** How far from the center the stylus is at an arm angle */
function radiusAt(S: number, deg: number): number {
  const { px, py, L } = pivot(S)
  const t = (deg * Math.PI) / 180
  return Math.hypot(px - L * Math.sin(t) - S / 2, py + L * Math.cos(t) - S / 2)
}

/** The arm angle that points at a spot */
function angleToward(S: number, x: number, y: number): number {
  const { px, py } = pivot(S)
  return (Math.atan2(-(x - px), y - py) * 180) / Math.PI
}

export function NeedleDrop({ model, slotColors, period, hours }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const S = useWidth(boxRef, 0)
  const g = recordGeometry(S || 1, model.days)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef<HTMLCanvasElement>(null)
  const press = useRef<Press | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [deg, setDeg] = useState(0)
  const degRef = useRef(0)
  const [ring, setRing] = useState(-1)
  const ringRef = useRef(-1)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  function aim(next: number) {
    degRef.current = next
    setDeg(next)
  }

  function pressTo(next: number) {
    ringRef.current = next
    setRing(next)
    press.current?.pressTo(next)
  }

  // The blank disc underneath, and the layer the days press into. A resize presses back up to where it was.
  useEffect(() => {
    const base = baseRef.current
    const layer = dataRef.current
    if (!S || !base || !layer) return
    const baseCtx = sizeCanvas(base, S)
    const draw = () => drawDisc(baseCtx, S, model.days, period, PAPER)
    draw()
    document.fonts?.ready.then(draw)
    press.current = createPress(sizeCanvas(layer, S), null, model, S, slotColors)
    if (ringRef.current >= 0) press.current.pressTo(ringRef.current)
  }, [S, model, period, slotColors])

  // Needle down: a moment to settle on the first groove, then the days press in from the label out
  useEffect(() => {
    if (phase !== 'landing' && phase !== 'pressing') return
    if (phase === 'landing') {
      const timer = window.setTimeout(() => setPhase('pressing'), LANDING_MS)
      return () => clearTimeout(timer)
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, now - start) / PRESS_MS)
      // Ease out, so the needle settles into the last grooves
      pressTo(Math.round((1 - Math.pow(1 - t, 3)) * (model.days - 1)))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setPhase('pressed')
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, model.days])

  function drop() {
    if (prefersReducedMotion()) {
      pressTo(model.days - 1)
      setPhase('pressed')
      return
    }
    pressTo(-1)
    setPhase('landing')
  }

  /** The pointer, relative to the record's box */
  function local(e: PointerEvent) {
    const rect = boxRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Once the needle's down, the record is pressing: nothing to grab until the next track
    if (phase !== 'idle' || e.button !== 0 || drag.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SLOP) return
    d.moved = true
    setPhase('aiming')
    const p = local(e)
    // The arm swings between hanging off the record and the innermost groove
    aim(Math.max(0, Math.min(angleFor(S, g.inner), angleToward(S, p.x, p.y))))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId) return
    if (!d.moved) {
      // A tap anywhere drops the needle too
      drop()
    } else if (radiusAt(S, degRef.current) <= g.outer) {
      drop()
    } else {
      // Let go off the record: the arm swings back to its rest
      aim(0)
      setPhase('idle')
    }
  }

  function onPointerCancel() {
    drag.current = null
    if (phase === 'aiming') {
      aim(0)
      setPhase('idle')
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle') {
      e.preventDefault()
      drop()
    }
  }

  const down = phase === 'landing' || phase === 'pressing' || phase === 'pressed'
  // Down, the arm follows the pressing; up, it follows your finger
  const armDeg = down ? angleFor(S, g.inner + (Math.max(ring, 0) + 0.5) * g.ring) : deg
  const { px, py, L } = pivot(S || 1)

  return (
    <section className="needle-drop" id="needle-drop" aria-labelledby="needle-drop-title">
      <h1 className="needle-drop__title" id="needle-drop-title">
        Your <em>{period}</em>, on record.
      </h1>

      <div
        className={['needle-drop__platter', `is-${phase}`].join(' ')}
        ref={boxRef}
        role="button"
        tabIndex={0}
        aria-label={phase === 'idle' ? 'Drop the needle' : 'The record, pressing'}
        aria-disabled={phase !== 'idle'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="needle-drop__spin">
          <canvas ref={baseRef} />
          <canvas ref={dataRef} />
        </div>
        <div className="needle-drop__sheen" style={{ inset: (S || 0) * (0.5 - 0.432) }} />
        {S > 0 && (
          <svg className="needle-drop__arm" viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
            <g className="tonearm">
              <circle cx={px} cy={py} r={0.05 * S} className="tonearm__base" />
              <g className="tonearm__arm" style={{ transform: `rotate(${armDeg}deg)`, transformOrigin: `${px}px ${py}px` }}>
                <rect x={px - 0.028 * S} y={py - 0.12 * S} width={0.056 * S} height={0.06 * S} rx={0.01 * S} className="tonearm__weight" />
                <line x1={px} y1={py - 0.07 * S} x2={px} y2={py + L - 0.04 * S} className="tonearm__rod" strokeWidth={Math.max(2, 0.011 * S)} />
                <rect x={px - 0.02 * S} y={py + L - 0.06 * S} width={0.04 * S} height={0.07 * S} rx={0.008 * S} className="tonearm__head" />
                <circle cx={px} cy={py + L} r={Math.max(2, 0.006 * S)} className="tonearm__stylus" />
                {/* A beacon on the headshell until you've picked the arm up */}
                {phase === 'idle' && <circle cx={px} cy={py + L - 0.025 * S} r={0.05 * S} className="needle-drop__beacon" />}
              </g>
              <circle cx={px} cy={py} r={0.018 * S} className="tonearm__cap" />
            </g>
          </svg>
        )}
      </div>

      <p className="needle-drop__readout" aria-live="polite">
        {phase === 'pressed'
          ? `${formatNumber(model.days)} grooves · ${formatNumber(hours)} hours`
          : ring >= 0
            ? formatMonthYear(fromDayNumber(model.firstDay + ring))
            : `${formatNumber(model.days)} days, waiting to be pressed`}
      </p>
    </section>
  )
}

function sizeCanvas(canvas: HTMLCanvasElement, size: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = canvas.height = Math.round(size * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
