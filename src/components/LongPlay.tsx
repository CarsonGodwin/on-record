import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { COARSE } from '../lib/pointer'
import {
  ChartsSlide,
  ClockSlide,
  ConstellationSlide,
  DaysSlide,
  ErasSlide,
  LoveHateSlide,
  NotesSlide,
  PosterSlide,
  PulseSlide,
  RaceSlide,
  RecordSlide,
  Sleeve,
  type PlaybackData,
  type SlideProps,
} from './LongPlayTracks'
import type { Track } from './TrackMenu'

/*
 * The Long Play: the whole record played back one track at a time, a slide
 * per chapter. It opens on the sleeve's tracklist, then A1 through D2 each
 * show a pocket version of their chart and the one thing it says. Tap through,
 * hold to pause, or open any track in full on the page.
 */

interface Props {
  data: PlaybackData
  tracks: Track[]
  /** Side letter → side title, e.g. A → "Time" */
  sides: Record<string, string>
  /** Closes the story and scrolls to a chapter */
  onJump: (id: string) => void
  onPoster: () => void
  onClose: () => void
}

const SLIDES: Record<string, (props: SlideProps) => ReactNode> = {
  record: RecordSlide,
  eras: ErasSlide,
  race: RaceSlide,
  clock: ClockSlide,
  days: DaysSlide,
  lovehate: LoveHateSlide,
  constellation: ConstellationSlide,
  pulse: PulseSlide,
  charts: ChartsSlide,
  notes: NotesSlide,
}

/** How long each slide stays up before the next, ms. The last one waits for you. */
const DURATION: Record<string, number> = { sleeve: 6000, record: 9000, race: 9500, notes: 9000, poster: Infinity }
const DEFAULT_DURATION = 8500
/** A press-and-hold shorter than this is a tap */
const HOLD_MS = 220
/** A drag has to head down this far before the story starts following it, px */
const DRAG_SLOP = 16
/** How far down a drag has to go to close the story: this many px, or this share of its height */
const DISMISS_MIN = 160
const DISMISS_SHARE = 0.28

export function LongPlay({ data, tracks, sides, onJump, onPoster, onClose }: Props) {
  // The sleeve first, then every track
  const stops = ['sleeve', ...tracks.map((t) => t.id)]
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const id = stops[index]
  const track = tracks.find((t) => t.id === id)
  const side = track?.num[0]

  const frameRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const elapsed = useRef(0)

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(stops.length - 1, to))
      elapsed.current = 0
      setIndex(next)
    },
    [stops.length],
  )

  // Hold the page still behind the story, and hand focus back to whatever opened it
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('lp-open')
    frameRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      document.documentElement.classList.remove('lp-open')
      opener?.focus?.({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === ' ' || e.key === 'k') {
        // Space on a focused button presses it instead
        if (e.key === ' ' && (e.target as HTMLElement).closest('button, a')) return
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, onClose])

  // The progress bar, and moving on when it fills
  useEffect(() => {
    const duration = DURATION[id] ?? DEFAULT_DURATION
    if (paused || holding || !Number.isFinite(duration)) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      elapsed.current += Math.max(0, now - last)
      last = now
      barRef.current?.style.setProperty('--p', String(Math.min(1, elapsed.current / duration)))
      if (elapsed.current >= duration) {
        go(index + 1)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [id, index, paused, holding, go])

  // Tap the left third to go back, anywhere else to go on. Hold to pause.
  // Drag down to leave: the story follows the finger and only lets go past a
  // real distance, so a sloppy tap or a scroll-like flick springs back instead.
  const gesture = useRef<{ x: number; y: number; timer: number; held: boolean; dragging: boolean } | null>(null)
  function setDrag(dy: number | null) {
    const frame = frameRef.current
    if (!frame) return
    frame.classList.toggle('is-dragging', dy !== null)
    frame.style.transform = dy ? `translateY(${dy}px) scale(${1 - Math.min(dy / 4000, 0.06)})` : ''
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, a') || e.button !== 0 || gesture.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const timer = window.setTimeout(() => {
      if (gesture.current) gesture.current.held = true
      setHolding(true)
    }, HOLD_MS)
    gesture.current = { x: e.clientX, y: e.clientY, timer, held: false, dragging: false }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const gs = gesture.current
    if (!gs) return
    const dx = e.clientX - gs.x
    const dy = e.clientY - gs.y
    if (!gs.dragging && dy > DRAG_SLOP && dy > Math.abs(dx) * 1.5) {
      gs.dragging = true
      setHolding(true)
    }
    if (gs.dragging) setDrag(Math.max(0, dy))
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const gs = gesture.current
    gesture.current = null
    if (!gs) return
    clearTimeout(gs.timer)
    setHolding(false)
    if (gs.dragging) {
      const dy = e.clientY - gs.y
      if (dy > Math.max(DISMISS_MIN, e.currentTarget.clientHeight * DISMISS_SHARE)) onClose()
      else setDrag(null)
      return
    }
    if (gs.held || Math.hypot(e.clientX - gs.x, e.clientY - gs.y) > 12) return
    const rect = e.currentTarget.getBoundingClientRect()
    go((e.clientX - rect.left) / rect.width < 0.3 ? index - 1 : index + 1)
  }
  function onPointerCancel() {
    if (gesture.current) clearTimeout(gesture.current.timer)
    gesture.current = null
    setHolding(false)
    setDrag(null)
  }

  const Slide = SLIDES[id]
  // Progress grouped like the record: the sleeve, then a run of bars per side
  const groups: { key: string; from: number; count: number }[] = [{ key: 'sleeve', from: 0, count: 1 }]
  for (const s of Object.keys(sides)) {
    const from = stops.findIndex((stop) => tracks.find((t) => t.id === stop)?.num.startsWith(s))
    if (from >= 0) groups.push({ key: s, from, count: tracks.filter((t) => t.num.startsWith(s)).length })
  }

  return createPortal(
    <div className="lp" role="dialog" aria-modal="true" aria-label="The Long Play">
      <button type="button" className="lp__step" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous track">
        <span aria-hidden="true">←</span>
      </button>

      <div
        ref={frameRef}
        className={['lp__frame', (paused || holding) && 'is-paused', holding && 'is-holding'].filter(Boolean).join(' ')}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="lp__chrome">
          <div className="lp__bars" aria-hidden="true">
            {groups.map((g) => (
              <span key={g.key} className="lp__bar-group" style={{ flexGrow: g.count }}>
                {Array.from({ length: g.count }, (_, k) => {
                  const i = g.from + k
                  return (
                    <span key={i} className={i < index ? 'is-done' : undefined}>
                      {i === index && <span ref={barRef} className="lp__fill" />}
                    </span>
                  )
                })}
              </span>
            ))}
          </div>
          <div className="lp__head">
            <p className="lp__side">
              {side ? (
                <>
                  <span className="lp__side-label">Side {side}</span>
                  <span className="lp__side-title">{sides[side]}</span>
                </>
              ) : (
                <>
                  <span className="lp__side-label">The Long Play</span>
                  <span className="lp__side-title">{tracks.length} tracks</span>
                </>
              )}
            </p>
            <button type="button" className="lp__icon" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'}>
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button type="button" className="lp__icon" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="lp__slide" key={id} aria-live="polite">
          <header className="lp__track">
            <span className="lp__num" aria-hidden="true">
              {track?.num ?? 'LP'}
            </span>
            <h2>{track?.title ?? 'Drop the needle'}</h2>
          </header>

          <div className="lp__body">
            {id === 'sleeve' ? (
              <Sleeve data={data} paused={paused} tracks={tracks} sides={sides} />
            ) : id === 'poster' ? (
              <PosterSlide data={data} paused={paused} onPoster={onPoster} onReplay={() => go(0)} onClose={onClose} />
            ) : (
              Slide && <Slide data={data} paused={paused || holding} />
            )}
          </div>

          <footer className="lp__foot">
            {id === 'sleeve' ? (
              <p className="lp__hint">{COARSE ? 'Tap to skip ahead. Hold to pause.' : 'Click or use the arrow keys to skip. Space to pause.'}</p>
            ) : id !== 'poster' && track ? (
              <button type="button" className="chip-button lp__open" onClick={() => onJump(track.id)}>
                Open {track.num} in full
              </button>
            ) : null}
          </footer>
        </div>
      </div>

      <button type="button" className="lp__step" onClick={() => go(index + 1)} disabled={index === stops.length - 1} aria-label="Next track">
        <span aria-hidden="true">→</span>
      </button>
    </div>,
    document.body,
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
