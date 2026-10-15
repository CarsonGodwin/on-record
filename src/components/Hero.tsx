import { useRef } from 'react'
import type { HourSlot } from '../data/insights'
import type { Ranked, Summary } from '../data/stats'
import { equivalents, formatDuration, formatHour, formatNumber, formatPercent } from '../lib/format'
import { useCountUp, useSeen } from '../lib/hooks'

interface Props {
  summary: Summary
  year: number | null
  span: string
  isSample: boolean
  topArtist: Ranked | undefined
  hours: HourSlot[]
  newArtists: number | null
  onPoster: () => void
}

export function Hero({ summary, year, span, isSample, topArtist, hours, newArtists, onPoster }: Props) {
  const ref = useRef<HTMLElement>(null)
  const seen = useSeen(ref, 0.1)
  const total = summary.totalMs / 3_600_000
  const count = useCountUp(total, seen, 1800)
  const eq = equivalents(summary.totalMs)
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])

  const ticker = [
    `${formatNumber(summary.streams)} streams`,
    `${formatNumber(summary.artists)} artists`,
    `${formatNumber(summary.tracks)} songs`,
    `${formatNumber(summary.activeDays)} days with music`,
    `${formatDuration(summary.totalMs / Math.max(summary.activeDays, 1))} a day`,
    ...(newArtists !== null ? [`${formatNumber(newArtists)} new artists`] : []),
    `peak hour ${formatHour(peak.hour)}`,
    ...(topArtist ? [`#1 ${topArtist.label}`] : []),
    `${formatPercent(summary.skipRate)} skipped`,
  ]

  return (
    <>
      <section className="hero" ref={ref} id="top">
        <div className="hero__rings" aria-hidden="true" />
        <p className="hero__eyebrow">
          {isSample ? 'Sample record' : 'Your record'} <span>·</span> {year ?? span}
        </p>
        <h1 className="hero__number" aria-label={`${formatNumber(total)} hours`}>
          {formatNumber(count)}
        </h1>
        <p className="hero__unit">
          hours <em>on record</em>
        </p>
        <p className="hero__eq">
          That’s <b>{formatNumber(eq.days)} days</b> of sound. <b>{formatNumber(eq.flights)} flights</b> from New York to Tokyo.{' '}
          <b>{formatNumber(eq.marathons)}</b> back-to-back extended Lord of the Rings marathons.
        </p>
        <div className="hero__actions">
          <a className="button button--big" href="#record">
            <span className="button__icon">↓</span> Drop the needle
          </a>
          <button type="button" className="button button--big button--ghost" onClick={onPoster}>
            Make your poster
          </button>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker__track">
          {[0, 1].map((copy) => (
            <span key={copy} className="ticker__set">
              {ticker.map((t) => (
                <span key={t}>
                  {t}
                  <i>✦</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <ul className="sr-only">
        {ticker.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  )
}
