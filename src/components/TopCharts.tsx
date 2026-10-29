import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { topItems, type Category, type RankBy, type Ranked } from '../data/stats'
import { formatDuration, formatPlays } from '../lib/format'
import { useSize } from '../lib/hooks'
import { InCards } from '../lib/stage'
import type { Play } from '../types'
import { Cover } from './Cover'
import { Segmented } from './ui'
import { useCloseOnBack } from '../lib/back'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'artist', label: 'Artists' },
  { value: 'track', label: 'Songs' },
  { value: 'album', label: 'Albums' },
  { value: 'show', label: 'Podcasts' },
]

/**
 * A list row's height on a phone's card (taller when each name has an artist under it), and the
 * "See top 50" line above the rows, in CSS pixels. The card shows as many whole rows as fit.
 */
const CARD_ROW = 44
const CARD_ROW_TALL = 52
const CARD_MORE = 40
/** The most a phone's card ranks before you open the full list */
const CARD_MAX = 20
const FULL = 50

interface Props {
  plays: Play[]
  /** Hides an artist from the whole page; returns false if they're all that's left */
  onHide: (artist: string) => boolean
  /**
   * What's been hidden, which can be ahead of `plays` for a moment while the page catches up.
   * A new set every time it changes, which is how a refusal knows it's out of date.
   */
  hidden: ReadonlySet<string>
  onManage: () => void
}

/** "The Charts": your top artists, songs, albums and podcasts, with a podium for the top 3 */
export function TopCharts({ plays, onHide, hidden, onManage }: Props) {
  // A phone's card shows the podium and as many rows as fit; the full list opens on top when you ask for it
  const card = useContext(InCards)
  const [category, setCategory] = useState<Category>('artist')
  const [rankBy, setRankBy] = useState<RankBy>('time')
  const [expanded, setExpanded] = useState(false)
  const [sheet, setSheet] = useState(false)
  useCloseOnBack(sheet, () => setSheet(false))
  const restRef = useRef<HTMLDivElement>(null)
  const rest = useSize(restRef, { width: 358, height: 200 })
  // Why the last Hide didn't happen; it stops applying once the hidden set changes
  const [refused, setRefused] = useState<{ name: string; hidden: ReadonlySet<string> } | null>(null)
  const hiddenCount = hidden.size

  const hasPodcasts = useMemo(() => plays.some((p) => p.kind === 'episode'), [plays])
  const options = hasPodcasts ? CATEGORIES : CATEGORIES.filter((c) => c.value !== 'show')
  const active = !hasPodcasts && category === 'show' ? 'artist' : category
  // A hidden artist leaves the list at once; the rest of the page catches up a moment later
  const items = useMemo(() => {
    const ranked = topItems(plays, active, rankBy, expanded || card ? FULL : 20)
    return active === 'artist' ? ranked.filter((r) => !hidden.has(r.label)) : ranked
  }, [plays, active, rankBy, expanded, card, hidden])

  const value = rankBy === 'time' ? (r: Ranked) => r.ms : (r: Ranked) => r.plays
  const primary = rankBy === 'time' ? (r: Ranked) => formatDuration(r.ms) : (r: Ranked) => formatPlays(r.plays)
  const secondary = rankBy === 'time' ? (r: Ranked) => formatPlays(r.plays) : (r: Ranked) => formatDuration(r.ms)
  const max = Math.max(...items.map(value), 1)
  const canHide = active === 'artist'
  const hideButton = (name: string) =>
    canHide && (
      <button type="button" className="chart-hide" aria-label={`Hide ${name} everywhere`} title="Hide everywhere" onClick={() => setRefused(onHide(name) ? null : { name, hidden })}>
        Hide
      </button>
    )

  const refusal = refused?.hidden === hidden && (
    <p className="charts__hidden" role="status">
      Can’t hide {refused.name}: at least one artist has to stay.
    </p>
  )
  const hiddenNote = hiddenCount > 0 && (
    <p className="charts__hidden">
      {hiddenCount} artist{hiddenCount === 1 ? '' : 's'} hidden from every chart.{' '}
      <button type="button" className="chip-button" onClick={onManage}>
        Manage
      </button>
    </p>
  )
  const cover = (item: Ranked, size: number) => <Cover name={item.sublabel ? `${item.label}|${item.sublabel}` : item.label} size={size} />

  if (card) {
    const head = CATEGORIES.find((c) => c.value === active)!.label.toLowerCase()
    // The rows under the podium: as many whole rows as the space below it holds
    const rowH = items.some((r) => r.sublabel) ? CARD_ROW_TALL : CARD_ROW
    const room = Math.max(0, Math.floor((rest.height - CARD_MORE) / rowH))
    const shownRows = items.slice(3, Math.min(CARD_MAX, 3 + room))
    const row = (item: Ranked, rank: number, withHide: boolean) => (
      <li key={item.key} className="chart-list__row">
        <span className="chart-list__rank">{rank}</span>
        {cover(item, 36)}
        <div className="chart-list__main">
          <span className="chart-list__name">{item.label}</span>
          {item.sublabel && <span className="chart-list__sub">{item.sublabel}</span>}
        </div>
        <span className="chart-list__value">{primary(item)}</span>
        {withHide && hideButton(item.label)}
      </li>
    )
    return (
      <div className="charts is-card" style={{ ['--row' as string]: `${rowH}px`, ['--more' as string]: `${CARD_MORE}px` }}>
        <div className="charts__bar">
          <Segmented label="Category" className="charts__cats" value={active} onChange={setCategory} options={options} />
          {/* One button that flips the ranking: a second row of options won't fit beside four categories on a narrow phone */}
          <button
            type="button"
            className="charts__sort"
            aria-label={rankBy === 'time' ? 'Ranked by time, switch to plays' : 'Ranked by plays, switch to time'}
            onClick={() => setRankBy(rankBy === 'time' ? 'plays' : 'time')}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {rankBy === 'time' ? 'Time' : 'Plays'}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="muted">Nothing here for this period.</p>
        ) : (
          <ol className="podium">
            {items.slice(0, 3).map((item, i) => (
              <li key={item.key} className={`podium__spot podium__spot--${i + 1}`}>
                <div className="podium__art">
                  {cover(item, 120)}
                  <span className="podium__rank" aria-hidden="true">
                    {i + 1}
                  </span>
                </div>
                <strong className="podium__name">{item.label}</strong>
                {item.sublabel && <span className="podium__sub">{item.sublabel}</span>}
                <span className="podium__value">{primary(item)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="charts__rest" ref={restRef}>
          {items.length > 3 + shownRows.length && (
            <button type="button" className="charts__more" onClick={() => setSheet(true)}>
              See top {items.length}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <ol className="chart-list" start={4}>
            {shownRows.map((item, i) => row(item, i + 4, false))}
          </ol>
        </div>

        {sheet && (
          <ChartSheet title={`Your top ${items.length} ${head}`} onClose={() => setSheet(false)}>
            {refusal}
            {hiddenNote}
            <ol className={canHide ? 'chart-list chart-list--hideable' : 'chart-list'}>{items.map((item, i) => row(item, i + 1, true))}</ol>
          </ChartSheet>
        )}
      </div>
    )
  }

  return (
    <div className="charts">
      <div className="charts__controls">
        <Segmented label="Category" value={active} onChange={setCategory} options={options} />
        <Segmented
          label="Rank by"
          value={rankBy}
          onChange={setRankBy}
          options={[
            { value: 'time', label: 'By time' },
            { value: 'plays', label: 'By plays' },
          ]}
        />
      </div>

      {refusal}

      {hiddenNote}

      {items.length === 0 ? (
        <p className="muted">Nothing here for this period.</p>
      ) : (
        <>
          <ol className="podium">
            {items.slice(0, 3).map((item, i) => (
              <li key={item.key} className={`podium__spot podium__spot--${i + 1}`}>
                <div className="podium__art">
                  <Cover name={item.sublabel ? `${item.label}|${item.sublabel}` : item.label} size={220} />
                  <span className="podium__rank" aria-hidden="true">
                    {i + 1}
                  </span>
                </div>
                <strong className="podium__name">{item.label}</strong>
                {item.sublabel && <span className="podium__sub">{item.sublabel}</span>}
                <span className="podium__value">
                  {primary(item)}, <span className="muted">{secondary(item)}</span>
                </span>
                {hideButton(item.label)}
              </li>
            ))}
          </ol>

          <ol className={canHide ? 'chart-list chart-list--hideable' : 'chart-list'} start={4}>
            {items.slice(3).map((item, i) => (
              <li key={item.key} className="chart-list__row">
                <span className="chart-list__rank">{i + 4}</span>
                <Cover name={item.sublabel ? `${item.label}|${item.sublabel}` : item.label} size={40} />
                <div className="chart-list__main">
                  <span className="chart-list__name">{item.label}</span>
                  {item.sublabel && <span className="chart-list__sub">{item.sublabel}</span>}
                  <span className="chart-list__bar" aria-hidden="true">
                    <i style={{ width: `${(value(item) / max) * 100}%` }} />
                  </span>
                </div>
                <div className="chart-list__value">
                  <span>{primary(item)}</span>
                  <span className="chart-list__sub">{secondary(item)}</span>
                </div>
                {hideButton(item.label)}
              </li>
            ))}
          </ol>
        </>
      )}

      {items.length >= 20 && (
        <button type="button" className="chip-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show top 20' : 'Show top 50'}
        </button>
      )}
    </div>
  )
}

/**
 * The whole chart over a phone's card: the one place on the card that scrolls, and only once you've
 * opened it. It also holds the Hide buttons, which the card itself has no room for.
 */
function ChartSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => opener?.focus({ preventScroll: true })
  }, [])
  return (
    <div
      className="charts__sheet"
      role="dialog"
      aria-label={title}
      data-drag
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="charts__sheet-head">
        <strong>{title}</strong>
        <button type="button" className="charts__close" ref={closeRef} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Close
        </button>
      </div>
      <div className="charts__sheet-scroll">{children}</div>
    </div>
  )
}
