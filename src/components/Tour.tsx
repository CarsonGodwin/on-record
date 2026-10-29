import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { COARSE } from '../lib/pointer'
import type { Track } from './TrackMenu'

/*
 * The Long Play: a walk through the record, one track at a time, on the page
 * itself. Each stop is the real chapter with everything in it live, and a
 * tip at the bottom says what to try there. Nothing moves on by itself: the
 * way on waits at the end of each stop, and at the end the whole page opens
 * back up.
 */

interface Tip {
  /** What to try first */
  try: string
  /** Once you've tried something there: the next thing */
  then: string
}

const TAP = COARSE ? 'Tap' : 'Click'

const TIPS: Record<string, Tip> = {
  record: {
    try: COARSE ? 'Hold the record, then drag to skim your days.' : 'Hover the record to skim, click to hold a day.',
    then: `${TAP} an artist below to light up their grooves.`,
  },
  eras: {
    try: `${TAP} the river to see who led back then.`,
    then: 'The pills along the top are your eras.',
  },
  race: {
    try: 'Drag the slider to rewind the race.',
    then: 'Press play to run it again from there.',
  },
  clock: {
    try: `${TAP} an hour on the dial to see who’s on.`,
    then: `Further down, ${TAP.toLowerCase()} any hour of the week.`,
  },
  days: {
    try: `${TAP} any day to see everything you played.`,
    then: 'Step through the days with the arrows.',
  },
  lovehate: {
    try: `${TAP} a dot to find out which song it is.`,
    then: 'Top right: can’t quit them, can’t finish them.',
  },
  constellation: {
    try: `${TAP} a star to light up its scene.`,
    then: COARSE ? 'Pinch to zoom into a cluster.' : 'Use + to zoom into a cluster.',
  },
  pulse: {
    try: `${TAP} a line to pick out an artist.`,
    then: 'Drag the slider to ride it through time.',
  },
  charts: {
    try: 'Switch to songs, albums or podcasts.',
    then: 'Now rank them by plays instead of time.',
  },
  notes: {
    try: `${TAP} Another take for a different line.`,
    then: 'Scroll down and guess your own habits.',
  },
  poster: {
    try: 'Pick a design, a size and a background.',
    then: COARSE ? 'Send it straight from here, or save it.' : 'Download it when it looks right.',
  },
}

interface Props {
  tracks: Track[]
  /** Side letter → side title, e.g. A → "Time" */
  sides: Record<string, string>
  /** Index into the tracks */
  step: number
  onStep: (step: number) => void
  /** Leaves partway, onto the chapter you were on */
  onClose: () => void
  /** The top bar, which the page measures in place of its own while the tour is up */
  topRef: RefObject<HTMLDivElement | null>
}

/** The tour's top bar and its tip. The way on is at the end of each stop, in the page: see UpNext. */
export function Tour({ tracks, sides, step, onStep, onClose, topRef }: Props) {
  const stops = tracks.map((t) => t.id)
  const id = stops[step]
  const track = tracks.find((t) => t.id === id)
  const side = track?.num[0]
  const last = step === stops.length - 1
  const tip = TIPS[id]
  // The stops where you've tried something, and the ones whose tip you've put away
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set())
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const done = tried.has(id)
  const cardRef = useRef<HTMLDivElement>(null)

  // The tip floats over the bottom of the page, so the page leaves room for it.
  // A layout effect, so it's all undone before the page lands back where it was
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const root = document.documentElement
    root.classList.add('tour-open')
    const observer = new ResizeObserver(() => root.style.setProperty('--tour-card-h', `${card.getBoundingClientRect().height}px`))
    observer.observe(card)
    return () => {
      observer.disconnect()
      root.classList.remove('tour-open')
      root.style.removeProperty('--tour-card-h')
    }
  }, [])

  // Every stop starts from its top
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [step])

  // You've tried a stop once a touch lands on it (a swipe that scrolled doesn't count), a slider moves, or a key presses something
  useEffect(() => {
    const el = document.getElementById(id)
    if (!el) return
    const mark = () => setTried((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') mark()
    }
    el.addEventListener('pointerup', mark)
    el.addEventListener('input', mark)
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointerup', mark)
      el.removeEventListener('input', mark)
      el.removeEventListener('keydown', onKey)
    }
  }, [id])

  // Arrow keys step through, Escape leaves, except where a slider or the day details want those keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') return onClose()
      if ((e.target as Element).closest?.('input, select, textarea, .day-panel')) return
      if (e.key === 'ArrowRight' && !last) onStep(step + 1)
      else if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, last, onStep, onClose])

  // Progress grouped like the record: a run of bars per side
  const groups: { key: string; from: number; count: number }[] = []
  for (const s of Object.keys(sides)) {
    const from = stops.findIndex((stop) => tracks.find((t) => t.id === stop)?.num.startsWith(s))
    if (from >= 0) groups.push({ key: s, from, count: tracks.filter((t) => t.num.startsWith(s)).length })
  }

  return (
    <>
      <div className="tour__top" ref={topRef}>
        <div className="tour__bars" aria-hidden="true">
          {groups.map((g) => (
            <span key={g.key} className="tour__bar-group" style={{ flexGrow: g.count }}>
              {Array.from({ length: g.count }, (_, k) => {
                const i = g.from + k
                const state = i < step ? 'is-past' : i === step ? (done ? 'is-on is-done' : 'is-on') : undefined
                return <span key={i} className={state} />
              })}
            </span>
          ))}
        </div>
        <div className="tour__head">
          <button type="button" className="tour__icon tour__icon--back" onClick={() => onStep(step - 1)} disabled={step === 0} aria-label="Previous track">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="tour__side">
            {side ? (
              <>
                <span className="tour__side-label">Side {side}</span>
                <span className="tour__side-title">{sides[side]}</span>
              </>
            ) : (
              <>
                <span className="tour__side-label">The Long Play</span>
                <span className="tour__side-title">{tracks.length} tracks</span>
              </>
            )}
          </p>
          <button type="button" className="tour__icon" onClick={() => onStep(step + 1)} disabled={last} aria-label="Skip to the next track">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="tour__icon tour__icon--close" onClick={onClose} aria-label="Leave The Long Play">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Just a pointer at what to play with: put it away and it stays away until the next track */}
      <div className="tour__tip" ref={cardRef} hidden={dismissed.has(id)}>
        <p key={`${id}-${done}`} aria-live="polite">
          <span className={done ? 'tour__kicker is-also' : 'tour__kicker'}>{done ? 'Also try' : 'Try it'}</span>
          {done ? tip.then : tip.try}
        </p>
        <button type="button" className="tour__icon" onClick={() => setDismissed((prev) => new Set(prev).add(id))} aria-label="Hide this tip">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  )
}

interface UpNextProps {
  tracks: Track[]
  sides: Record<string, string>
  step: number
  onStep: (step: number) => void
  /** Leaves at the end, onto the whole page */
  onFinish: () => void
}

/**
 * The way on, at the bottom of a stop: you get to it by going through what's
 * there, and it's there whenever you're done, never sooner or louder.
 */
export function UpNext({ tracks, sides, step, onStep, onFinish }: UpNextProps) {
  const next = tracks[step + 1]
  const side = next?.num[0]
  const newSide = side !== undefined && side !== tracks[step]?.num[0]
  return (
    <nav className="up-next" aria-label="The Long Play">
      {next ? (
        <button type="button" className="up-next__button" onClick={() => onStep(step + 1)}>
          <span className="up-next__kicker">
            Up next
            {newSide && (
              <>
                {' '}
                on Side {side} <em>{sides[side]}</em>
              </>
            )}
          </span>
          <span className="up-next__track">
            <span className="up-next__num">{next.num}</span>
            {next.title}
          </span>
          <Arrow />
        </button>
      ) : (
        <button type="button" className="up-next__button" onClick={onFinish}>
          <span className="up-next__kicker">That’s the whole record</span>
          <span className="up-next__track">See it all on one page</span>
          <Arrow />
        </button>
      )}
    </nav>
  )
}

function Arrow() {
  return (
    <span className="up-next__arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
