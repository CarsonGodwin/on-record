import type { Track } from './TrackMenu'

/*
 * The way between cards on a phone: back on the left, on to the next track
 * on the right, both where a thumb rests. Nothing moves on by itself.
 */

interface Props {
  tracks: Track[]
  /** Index of the card on screen */
  step: number
  onStep: (step: number) => void
}

export function CardNav({ tracks, step, onStep }: Props) {
  const prev = tracks[step - 1]
  const next = tracks[step + 1]
  return (
    <nav className="cardnav" aria-label="Tracks">
      <button type="button" className="cardnav__prev" onClick={() => onStep(step - 1)} disabled={!prev} aria-label={prev ? `Back to ${prev.title}` : 'Back'}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="cardnav__count" aria-live="polite">
        {step + 1} / {tracks.length}
      </span>
      <button type="button" className="cardnav__next" onClick={() => onStep(step + 1)} disabled={!next}>
        {next ? (
          <>
            <span className="cardnav__num">{next.num}</span>
            <span className="cardnav__title">{next.title}</span>
          </>
        ) : (
          <span className="cardnav__title">Last track</span>
        )}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  )
}
