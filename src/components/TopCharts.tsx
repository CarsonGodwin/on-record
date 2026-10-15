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

/** "The Charts": your top artists, songs, albums and podcasts, with a podium for the top 3 */
export function TopCharts({ plays }: { plays: Play[] }) {
  const [category, setCategory] = useState<Category>('artist')
  const [rankBy, setRankBy] = useState<RankBy>('time')
  const [expanded, setExpanded] = useState(false)

  const hasPodcasts = useMemo(() => plays.some((p) => p.kind === 'episode'), [plays])
  const options = hasPodcasts ? CATEGORIES : CATEGORIES.filter((c) => c.value !== 'show')
  const active = !hasPodcasts && category === 'show' ? 'artist' : category
  const items = useMemo(() => topItems(plays, active, rankBy, expanded ? 50 : 20), [plays, active, rankBy, expanded])

  const value = rankBy === 'time' ? (r: Ranked) => r.ms : (r: Ranked) => r.plays
  const primary = rankBy === 'time' ? (r: Ranked) => formatDuration(r.ms) : (r: Ranked) => playsLabel(r.plays)
  const secondary = rankBy === 'time' ? (r: Ranked) => playsLabel(r.plays) : (r: Ranked) => formatDuration(r.ms)
  const max = Math.max(...items.map(value), 1)

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
              </li>
            ))}
          </ol>

          <ol className="chart-list" start={4}>
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
