import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { HourSlot, Records, Take } from '../data/insights'
import { smallPrint } from '../data/smallPrint'
import type { FunStats, Ranked, Summary, WearOut } from '../data/stats'
import { formatDate, formatDuration, formatHour, formatNumber, formatPercent, formatTime } from '../lib/format'
import { InCards } from '../lib/stage'

interface Props {
  takes: Take[]
  fun: FunStats
  rec: Records
  summary: Summary
  devices: Ranked[]
  topArtists: Ranked[]
  hours: HourSlot[]
  /** How songs wear out, for the phone card's small print */
  wear: WearOut | null
  /** "2024", or "2019–2025" for all time */
  period: string
  isAllTime: boolean
}

/*
 * The back of the sleeve: one line that could only be about you, the credits
 * in small print, and your habits as a guessing game, so you find out how
 * well you know them before the number shows up.
 */
export function LinerNotes({ takes, fun, rec, summary, devices, topArtists, hours, wear, period, isAllTime }: Props) {
  const inCards = useContext(InCards)
  // A phone's card has room for a few lines, not the whole sleeve, so it keeps the ones you couldn't have guessed
  if (inCards) return <SmallPrint fun={fun} rec={rec} wear={wear} isAllTime={isAllTime} />
  return (
    <div className="liner">
      <article className="backcover">
        <header className="backcover__top">
          <span>My Listening Record · {period}</span>
          <span>Liner notes</span>
        </header>
        <Headline takes={takes} />
        <Credits fun={fun} rec={rec} summary={summary} devices={devices} topArtists={topArtists} hours={hours} isAllTime={isAllTime} />
      </article>
      <Habits summary={summary} />
    </div>
  )
}

/**
 * Every take sits in the same grid cell with only one showing, so the box is
 * always as tall as the longest and nothing below jumps between takes.
 */
function Headline({ takes }: { takes: Take[] }) {
  const [i, setI] = useState(0)
  if (!takes.length) return null
  const at = i % takes.length

  return (
    <figure className="take">
      <div className="take__stack">
        {takes.map((t, j) => (
          <blockquote key={j} className={`take__text${j === at ? ' is-on' : ''}`} aria-hidden={j !== at}>
            {t.text}
          </blockquote>
        ))}
      </div>
      <figcaption className="take__foot">
        <span className="take__stack">
          {takes.map((t, j) => (
            <span key={j} className={`take__proof${j === at ? ' is-on' : ''}`} aria-hidden={j !== at}>
              {t.proof}
            </span>
          ))}
        </span>
        {takes.length > 1 && (
          <button type="button" className="take__next" onClick={() => setI((n) => (n + 1) % takes.length)}>
            Another take
            <span>
              {at + 1}/{takes.length}
            </span>
          </button>
        )}
      </figcaption>
    </figure>
  )
}

interface CreditsProps {
  fun: FunStats
  rec: Records
  summary: Summary
  devices: Ranked[]
  topArtists: Ranked[]
  hours: HourSlot[]
  isAllTime: boolean
}

function Credits({ fun, rec, summary, devices, topArtists, hours, isAllTime }: CreditsProps) {
  const credits: { label: string; value: string }[] = []

  const featuring = topArtists.slice(0, 5).map((a) => a.label)
  if (featuring.length) {
    credits.push({ label: 'Top artists', value: listOf(featuring) })
    const others = summary.artists - featuring.length
    if (others > 0) credits.push({ label: 'Other artists', value: formatNumber(others) })
  }

  if (devices.length) {
    const total = Math.max(summary.totalMs, 1)
    credits.push({
      label: 'Devices',
      value: devices
        .slice(0, 3)
        .map((d) => `${d.label} ${formatPercent(d.ms / total)}`)
        .join(' · '),
    })
  }

  // The busiest three hours in a row, wrapping past midnight
  const total = hours.reduce((s, h) => s + h.ms, 0)
  if (total > 0) {
    let best = 0
    let bestMs = -1
    for (let s = 0; s < 24; s++) {
      const ms = hours[s].ms + hours[(s + 1) % 24].ms + hours[(s + 2) % 24].ms
      if (ms > bestMs) {
        best = s
        bestMs = ms
      }
    }
    credits.push({
      label: 'Peak hours',
      value: `${formatHour(best)}–${formatHour((best + 3) % 24)} · ${formatPercent(bestMs / total)} of your listening`,
    })
  }

  credits.push({ label: 'Total listening', value: `${formatDuration(summary.totalMs)} · ${formatNumber(summary.streams)} plays` })
  if (summary.tracks > 0) credits.push({ label: 'Different songs', value: formatNumber(summary.tracks) })

  if (rec.firstPlay) {
    credits.push({
      label: isAllTime ? 'First play' : 'First play of the year',
      value: `“${rec.firstPlay.title}”, ${rec.firstPlay.artist} · ${formatDate(rec.firstPlay.date)}`,
    })
  }
  if (rec.marathon) {
    credits.push({
      label: 'Longest session',
      value: `${formatDuration(rec.marathon.ms)} straight from ${formatTime(rec.marathon.start)}, ${formatDate(rec.marathon.start)}`,
    })
  }
  if (fun.longestStreak) {
    credits.push({
      label: 'Longest streak',
      value: `${formatNumber(fun.longestStreak.days)} days in a row · ${formatDate(fun.longestStreak.start)} to ${formatDate(fun.longestStreak.end)}`,
    })
  }
  if (fun.biggestDay) {
    credits.push({ label: 'Biggest day', value: `${formatDuration(fun.biggestDay.ms)} · ${formatDate(fun.biggestDay.date)}` })
  }
  if (fun.onRepeat) {
    credits.push({
      label: 'Most repeats in a day',
      value: `“${fun.onRepeat.title}” ×${fun.onRepeat.count} · ${formatDate(fun.onRepeat.date)}`,
    })
  }
  if (rec.evergreen) {
    credits.push({
      label: 'Most consistent song',
      value: `“${rec.evergreen.title}”, ${rec.evergreen.artist} · ${rec.evergreen.months} of ${rec.evergreen.activeMonths} months`,
    })
  }
  credits.push({ label: 'Average session', value: formatDuration(rec.avgSessionMs) })
  if (isAllTime && rec.forgotten) {
    credits.push({
      label: 'Dropped off',
      value: `${rec.forgotten.artist} · ${formatDuration(rec.forgotten.ms)} total, last played ${formatDate(rec.forgotten.lastPlayed)}`,
    })
  }

  return (
    <dl className="credits">
      {credits.map((c) => (
        <div key={c.label} className="credit">
          <dt>{c.label}</dt>
          <span className="credit__dots" aria-hidden="true" />
          <dd>{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------- The small print, on a phone's card ----------

/** The most facts a card shows; fewer when they don't fit (a small phone, long song titles) */
const MOST_FACTS = 4

interface SmallPrintProps {
  fun: FunStats
  rec: Records
  wear: WearOut | null
  isAllTime: boolean
}

function SmallPrint({ fun, rec, wear, isAllTime }: SmallPrintProps) {
  const facts = useMemo(() => smallPrint(fun, rec, wear, isAllTime).slice(0, MOST_FACTS), [fun, rec, wear, isAllTime])
  const listRef = useRef<HTMLOListElement>(null)

  // Show them all, then drop the last (least surprising) until the rest fit. The DOM is measured and
  // trimmed directly, again when the card changes size or the serif arrives (it sets wider than its fallback).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    let live = true
    const fit = () => {
      if (!live) return
      const items = [...list.children] as HTMLElement[]
      for (const li of items) li.hidden = false
      for (let n = items.length - 1; n > 0 && list.scrollHeight > list.clientHeight + 1; n--) items[n].hidden = true
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(list)
    document.fonts?.addEventListener('loadingdone', fit)
    document.fonts?.ready.then(fit)
    return () => {
      live = false
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [facts])

  if (!facts.length) {
    return (
      <div className="smallprint smallprint--empty">
        <p className="smallprint__line">Not much small print here yet.</p>
        <p className="smallprint__proof">A longer stretch of listening has more to say</p>
      </div>
    )
  }

  return (
    <ol className="smallprint" ref={listRef} aria-label="The small print">
      {facts.map((f) => (
        <li key={f.key} className="smallprint__fact">
          <p className="smallprint__line">
            {f.line.map((part, i) => (typeof part === 'string' ? part : <em key={i}>{part.name}</em>))}
          </p>
          <p className="smallprint__proof">{f.proof}</p>
        </li>
      ))}
    </ol>
  )
}

function listOf(names: string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// ---------- Habits: guess, then see ----------

interface Habit {
  key: string
  question: string
  /** 0–1 for a percentage; the raw number for a count */
  value: number
  note: string
  /** Guessed on a log scale (COUNT_MIN–COUNT_MAX) instead of 0–100% */
  count?: boolean
}

const COUNT_MIN = 10
const COUNT_MAX = 10000
const COUNT_SPAN = Math.log10(COUNT_MAX / COUNT_MIN)

/** Slider position 0–100 to a count, rounded to two significant digits */
function countAt(t: number): number {
  const raw = COUNT_MIN * 10 ** ((t / 100) * COUNT_SPAN)
  const step = 10 ** Math.max(Math.floor(Math.log10(raw)) - 1, 0)
  return Math.round(raw / step) * step
}

/** A count's position on the 0–100 slider, clamped */
function posOf(count: number): number {
  return Math.min(100, Math.max(0, (Math.log10(Math.max(count, 1) / COUNT_MIN) / COUNT_SPAN) * 100))
}

/** A guess within this many points counts as nailing it */
const CLOSE = 5

function Habits({ summary }: { summary: Summary }) {
  const habits: Habit[] = [
    { key: 'skip', question: 'How many songs do you skip?', value: summary.skipRate, note: 'Songs you skipped before they ended' },
  ]
  // Apple Music's export doesn't record shuffle
  if (summary.shuffleRate !== null) {
    habits.push({ key: 'shuffle', question: 'How often is shuffle on?', value: summary.shuffleRate, note: 'Songs played with shuffle on' })
  }
  if (summary.artists > 0) {
    habits.push({ key: 'artists', question: 'How many different artists did you play?', value: summary.artists, note: 'Artists with at least one play', count: true })
  }
  if (summary.podcastMs > 0) {
    habits.push({
      key: 'podcasts',
      question: 'How much of it is podcasts?',
      value: summary.podcastMs / Math.max(summary.totalMs, 1),
      note: 'Share of all your listening time',
    })
  }

  const [guesses, setGuesses] = useState<Record<string, number>>({})
  // Revealed habits; a guess is only kept for the ones you locked in yourself
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set())

  const reveal = (key: string) => setShown((prev) => new Set(prev).add(key))
  const allShown = habits.every((h) => shown.has(h.key))
  // Only percentage habits count toward the average miss; a count is judged on its own card
  const scored = habits.filter((h) => !h.count && shown.has(h.key) && guesses[h.key] !== undefined)
  const avgMiss = scored.length
    ? scored.reduce((s, h) => s + Math.abs(Math.round(h.value * 100) - guesses[h.key]), 0) / scored.length
    : null

  return (
    <section className="habits">
      <header className="habits__head">
        <h3 className="habits__title">Before you look</h3>
        <p>How well do you know your own habits? Guess each one, then lock it in.</p>
      </header>

      <div className="habits__grid">
        {habits.map((h) => (
          <GuessCard
            key={h.key}
            habit={h}
            guess={guesses[h.key]}
            shown={shown.has(h.key)}
            onGuess={(g) => setGuesses((prev) => ({ ...prev, [h.key]: g }))}
            onLock={() => {
              setGuesses((prev) => ({ ...prev, [h.key]: prev[h.key] ?? 50 }))
              reveal(h.key)
            }}
          />
        ))}
      </div>

      <footer className="habits__foot">
        {allShown ? (
          avgMiss !== null && (
            <p>
              {avgMiss <= CLOSE ? 'You know yourself. ' : ''}
              On average you were off by <b>{Math.round(avgMiss)} points</b>.
            </p>
          )
        ) : (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => {
              // A slider that was moved but never locked in isn't a guess
              setGuesses((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => shown.has(key))))
              setShown(new Set(habits.map((h) => h.key)))
            }}
          >
            Just show me
          </button>
        )}
      </footer>
    </section>
  )
}

interface GuessCardProps {
  habit: Habit
  guess: number | undefined
  shown: boolean
  onGuess: (guess: number) => void
  onLock: () => void
}

function GuessCard({ habit, guess, shown, onGuess, onLock }: GuessCardProps) {
  const isCount = !!habit.count
  const real = isCount ? habit.value : Math.round(habit.value * 100)
  const g = guess ?? 50
  const show = (n: number) => (isCount ? formatNumber(n) : `${n}%`)
  // What the guess means in the habit's own unit
  const guessed = isCount ? countAt(g) : g

  if (!shown) {
    return (
      <div className="guess">
        <p className="guess__q">{habit.question}</p>
        <output className="guess__value guess__value--pending">{show(guessed)}</output>
        <input
          type="range"
          className="scrubber guess__slider"
          min={0}
          max={100}
          step={1}
          value={g}
          aria-label={habit.question}
          style={{ ['--progress' as string]: `${g}%` }}
          onChange={(e) => onGuess(Number(e.target.value))}
        />
        <button type="button" className="button button--small guess__lock" onClick={onLock}>
          Lock it in
        </button>
      </div>
    )
  }

  const diff = guess === undefined ? null : real - guessed
  // A count is close when within 15% of the real number, a percentage within CLOSE points
  const hit = diff !== null && (isCount ? Math.abs(diff) <= real * 0.15 : Math.abs(diff) <= CLOSE)
  const unit = isCount ? '' : ' points'
  return (
    <div className="guess guess--shown">
      <p className="guess__q">{habit.question}</p>
      <b className="guess__value">{show(real)}</b>
      <div className="guess__scale" aria-hidden="true">
        <i className="guess__fill" style={{ width: `${isCount ? posOf(real) : real}%` }} />
        {guess !== undefined && <span className="guess__mark" style={{ left: `${guess}%` }} />}
      </div>
      {diff !== null && (
        <p className={`guess__verdict${hit ? ' guess__verdict--hit' : ''}`}>
          {hit
            ? `Nailed it. You said ${show(guessed)}.`
            : `${isCount ? formatNumber(Math.abs(diff)) : Math.abs(diff)}${unit} ${diff > 0 ? 'more' : 'less'} than you guessed.`}
        </p>
      )}
      <p className="guess__note">{habit.note}</p>
    </div>
  )
}
