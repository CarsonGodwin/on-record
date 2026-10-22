import { useEffect, useRef } from 'react'
import { TrackMenu, type Track } from './TrackMenu'

/*
 * The bar at the bottom of a phone's deck, where a thumb rests: back, the
 * track you're on (tap it for the whole tracklist), and on. Nothing moves
 * on by itself.
 */

interface Props {
  /** Every track, for the tracklist */
  tracks: Track[]
  sides: Record<string, string>
  /** The tracks in this deck (a period without music has fewer) */
  deck: Track[]
  /** Index into `deck` of the card on screen */
  step: number
  onStep: (step: number) => void
  onJump: (id: string) => void
  onPoster: () => void
  onReset: () => void
}

export function CardNav({ tracks, sides, deck, step, onStep, onJump, onPoster, onReset }: Props) {
  const ref = useRef<HTMLElement>(null)
  const prev = deck[step - 1]
  const next = deck[step + 1]

  // The tracklist opens upwards from here and stops short of the bar
  useEffect(() => {
    const bar = ref.current
    if (!bar) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty('--cardnav-h', `${bar.getBoundingClientRect().height}px`))
    observer.observe(bar)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--cardnav-h')
    }
  }, [])

  return (
    <nav className="cardnav" aria-label="Tracks" ref={ref}>
      <button type="button" className="cardnav__step" onClick={() => onStep(step - 1)} disabled={!prev} aria-label={prev ? `Back to ${prev.title}` : 'Back'}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <TrackMenu tracks={tracks} sides={sides} current={deck[step]?.id ?? null} onJump={onJump} onPoster={onPoster} onReset={onReset} up />
      <button type="button" className="cardnav__step" onClick={() => onStep(step + 1)} disabled={!next} aria-label={next ? `On to ${next.title}` : 'Last track'}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </nav>
  )
}
