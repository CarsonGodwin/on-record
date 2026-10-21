import { useMemo, useState } from 'react'
import { topItems, type Category, type RankBy, type Ranked } from '../data/stats'
import { formatDuration, formatNumber } from '../lib/format'
import type { Play } from '../types'
import { Cover } from './Cover'
import { Segmented } from './ui'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'artist', label: 'Artists' },
  { value: 'track', label: 'Songs' },
  { value: 'album', label: 'Albums' },
  { value: 'show', label: 'Podcasts' },
]

const playsLabel = (n: number) => `${formatNumber(n)} play${n === 1 ? '' : 's'}`

interface Props {
  plays: Play[]
  /** Hides an artist from the whole page; returns false if they're all that's left */
  onHide: (artist: string) => boolean
  /** A new set every time it changes, which is how a refusal knows it's out of date */
  hidden: ReadonlySet<string>
  onManage: () => void
}

/** "The Charts": your top artists, songs, albums and podcasts, with a podium for the top 3 */
export function TopCharts({ plays, onHide, hidden, onManage }: Props) {
  const [category, setCategory] = useState<Category>('artist')
  const [rankBy, setRankBy] = useState<RankBy>('time')
  const [expanded, setExpanded] = useState(false)
  // Why the last Hide didn't happen; it stops applying once the hidden set changes
  const [refused, setRefused] = useState<{ name: string; hidden: ReadonlySet<string> } | null>(null)
  const hiddenCount = hidden.size

  const hasPodcasts = useMemo(() => plays.some((p) => p.kind === 'episode'), [plays])
  const options = hasPodcasts ? CATEGORIES : CATEGORIES.filter((c) => c.value !== 'show')
  const active = !hasPodcasts && category === 'show' ? 'artist' : category
  const items = useMemo(() => topItems(plays, active, rankBy, expanded ? 50 : 20), [plays, active, rankBy, expanded])

  const value = rankBy === 'time' ? (r: Ranked) => r.ms : (r: Ranked) => r.plays
  const primary = rankBy === 'time' ? (r: Ranked) => formatDuration(r.ms) : (r: Ranked) => playsLabel(r.plays)
  const secondary = rankBy === 'time' ? (r: Ranked) => playsLabel(r.plays) : (r: Ranked) => formatDuration(r.ms)
  const max = Math.max(...items.map(value), 1)
  const canHide = active === 'artist'
  const hideButton = (name: string) =>
    canHide && (
      <button type="button" className="chart-hide" aria-label={`Hide ${name} everywhere`} title="Hide everywhere" onClick={() => setRefused(onHide(name) ? null : { name, hidden })}>
        Hide
      </button>
    )

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

      {refused?.hidden === hidden && (
        <p className="charts__hidden" role="status">
          Can’t hide {refused.name}: at least one artist has to stay.
        </p>
      )}

      {hiddenCount > 0 && (
        <p className="charts__hidden">
          {hiddenCount} artist{hiddenCount === 1 ? '' : 's'} hidden from every chart.{' '}
          <button type="button" className="chip-button" onClick={onManage}>
            Manage
          </button>
        </p>
      )}

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
                  {primary(item)} <span className="muted">· {secondary(item)}</span>
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
