import { useRef } from 'react'
import type { FunStats, Ranked, Summary } from '../data/stats'
import { formatDate, formatDays, formatDuration, formatNumber } from '../lib/format'
import { useCountUp, useSeen } from '../lib/hooks'

interface Props {
  summary: Summary
  year: number | null
  span: string
  isSample: boolean
  topArtist: Ranked | undefined
  biggestDay: FunStats['biggestDay']
  onPlay: () => void
  onPoster: () => void
}

// A non-breaking space keeps "410 hrs" together when the line wraps
const glue = (text: string) => text.replace(' ', '\u00a0')

export function Hero({ summary, year, span, isSample, topArtist, biggestDay, onPlay, onPoster }: Props) {
  const ref = useRef<HTMLElement>(null)
  const seen = useSeen(ref, 0.1)
  const total = summary.totalMs / 3_600_000
  const count = useCountUp(total, seen, 1800)
  // The period opens the sentence, so the number doesn't need a label above it
  const period = year !== null ? `In ${year}` : span.includes('–') ? `From ${span.replace('–', ' to ')}` : `In ${span}`
  const artistFact = topArtist && (
    <>
      <b>{topArtist.label}</b> alone had {glue(formatDuration(topArtist.ms))} of it
    </>
  )
  const dayFact = biggestDay && (
    <>
      {formatDate(biggestDay.date)} you listened for <b>{glue(formatDuration(biggestDay.ms))}</b>
    </>
  )

  return (
    <section className="hero" ref={ref} id="top">
      <div className="hero__rings" aria-hidden="true" />
      <h1 className="hero__number" aria-label={`${formatNumber(total)} hours`}>
        {formatNumber(count)}
      </h1>
      <p className="hero__unit">
        hours in <em>{isSample ? 'a sample record' : 'my listening record'}</em>
      </p>
      <p className="hero__eq">
        {/* Facts from this record rather than yardsticks anyone's stats could fill in */}
        {period}, that’s <b>{glue(formatDays(summary.totalMs))}</b> of sound.
        {/* Either fact can be missing (a podcast-only period has no top artist), so each stands on its own */}
        {(artistFact || dayFact) && (
          <>
            {' '}
            {artistFact}
            {dayFact && (
              <>
                {artistFact ? ', and on ' : 'On '}
                {dayFact}
              </>
            )}
            .
          </>
        )}
      </p>
      <div className="hero__actions">
        <button type="button" className="button button--big" onClick={onPlay}>
          <span className="button__icon">▶</span> Take me through it
        </button>
        <button type="button" className="button button--big button--ghost" onClick={onPoster}>
          Make your poster
        </button>
      </div>
    </section>
  )
}
