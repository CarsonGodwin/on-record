import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { SongStat } from '../data/insights'
import { formatDuration, formatNumber, formatPercent } from '../lib/format'
import { usePageScroll, useWidth } from '../lib/hooks'
import { leaveUnlessTouch } from '../lib/pointer'
import { SERIES } from '../lib/palette'
import { FloatTip } from './ui'

/*
 * "Love / Hate": your most-played songs by how often you play them (across)
 * and how often you skip them (up). The corners tell different stories.
 */

const M = { top: 20, right: 12, bottom: 40, left: 42 }

interface Props {
  songs: SongStat[]
  /** Overall skip rate, used as the horizontal divider */
  skipRate: number
}

const noop = () => {}

export function LoveHate({ songs, skipRate }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, 900)
  const height = width < 600 ? 380 : 460
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const clearHover = useCallback(() => setHover(null), [])
  // A clicked dot stays selected (and its tooltip stays put) until it is clicked again
  const [pinned, setPinned] = useState<{ i: number; x: number; pageY: number } | null>(null)
  const scrollY = usePageScroll(pinned !== null)
  const narrow = width < 600

  const minPlays = Math.min(...songs.map((s) => s.plays))
  const maxPlays = Math.max(...songs.map((s) => s.plays))
  const maxMs = Math.max(...songs.map((s) => s.ms), 1)
  const innerW = width - M.left - M.right
  const innerH = height - M.top - M.bottom
  const logMin = Math.log(minPlays * 0.9)
  const logMax = Math.log(maxPlays * 1.1)
  const x = (plays: number) => M.left + ((Math.log(plays) - logMin) / (logMax - logMin || 1)) * innerW
  const y = (rate: number) => M.top + (1 - rate) * innerH
  const r = (ms: number) => 3 + Math.sqrt(ms / maxMs) * 10

  const midPlays = Math.sqrt(minPlays * maxPlays)

  const callouts = useMemo(() => {
    const rate = (s: SongStat) => s.skips / s.plays
    const best = (score: (s: SongStat) => number) => songs.reduce((b, s) => (score(s) > score(b) ? s : b), songs[0])
    const picks = [
      { song: best((s) => s.plays * (1 - rate(s)) ** 3), tag: 'The keeper' },
      { song: best((s) => (s.plays >= midPlays ? s.plays * rate(s) ** 2 : 0)), tag: 'Can’t quit it, can’t finish it' },
      { song: best((s) => (s.plays >= 6 ? rate(s) : 0)), tag: 'Instant skip' },
    ]
    return picks.filter((p, i) => picks.findIndex((q) => q.song.key === p.song.key) === i)
  }, [songs, midPlays])
  const calloutKeys = new Set(callouts.map((c) => c.song.key))

  const xTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((t) => t >= minPlays * 0.9 && t <= maxPlays * 1.1)

  function nearest(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    let best = -1
    let bestD = 28 * 28
    songs.forEach((s, i) => {
      const d = (x(s.plays) - px) ** 2 + (y(s.skips / s.plays) - py) ** 2
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    return best >= 0 ? { i: best, x: e.clientX, y: e.clientY } : null
  }
  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (!pinned) setHover(nearest(e))
  }
  function onClick(e: MouseEvent<SVGSVGElement>) {
    const at = nearest(e)
    if (!at || pinned?.i === at.i) {
      setPinned(null)
      setHover(at)
    } else {
      setPinned({ i: at.i, x: at.x, pageY: at.y + window.scrollY })
    }
  }

  const shown = pinned ? { i: pinned.i, x: pinned.x, y: pinned.pageY - scrollY } : hover
  const hovered = shown ? songs[shown.i] : null

  return (
    <div className="lovehate" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Scatter plot of your ${songs.length} most played songs by plays and skip rate`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={leaveUnlessTouch(clearHover)}
        onClick={onClick}
      >
        <rect x={x(midPlays)} y={M.top} width={M.left + innerW - x(midPlays)} height={y(skipRate) - M.top} className="lovehate__zone lovehate__zone--hot" />
        <rect x={x(midPlays)} y={y(skipRate)} width={M.left + innerW - x(midPlays)} height={M.top + innerH - y(skipRate)} className="lovehate__zone lovehate__zone--cool" />

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="axis-label">
              {formatPercent(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={M.top + innerH + 18} textAnchor="middle" className="axis-label">
            {formatNumber(t)}
          </text>
        ))}
        <text x={M.left + innerW} y={height - 4} textAnchor="end" className="axis-title">
          plays →
        </text>
        <text x={12} y={M.top - 6} className="axis-title">
          ↑ skipped
        </text>

        <line x1={x(midPlays)} x2={x(midPlays)} y1={M.top} y2={M.top + innerH} className="divider" />
        <line x1={M.left} x2={M.left + innerW} y1={y(skipRate)} y2={y(skipRate)} className="divider" />

        <text x={M.left + innerW - 8} y={M.top + 22} textAnchor="end" className="quadrant">
          love–hate
        </text>
        <text x={M.left + innerW - 8} y={M.top + innerH - 10} textAnchor="end" className="quadrant">
          ride or die
        </text>
        <text x={M.left + 10} y={M.top + 22} className="quadrant">
          hard pass
        </text>
        <text x={M.left + 10} y={M.top + innerH - 10} className="quadrant">
          deep cuts
        </text>

        {songs.map((s, i) => (
          <circle
            key={s.key}
            cx={x(s.plays)}
            cy={y(s.skips / s.plays)}
            r={r(s.ms)}
            fill={calloutKeys.has(s.key) ? SERIES[0] : SERIES[1]}
            className={shown?.i === i ? 'lovehate__dot is-on' : calloutKeys.has(s.key) ? 'lovehate__dot is-callout' : 'lovehate__dot'}
          />
        ))}

        {!narrow && callouts.map(({ song, tag }) => {
          const cx = x(song.plays)
          const cy = y(song.skips / song.plays)
          const flip = cx > M.left + innerW * 0.6
          const below = cy < M.top + 40
          const ty = below ? cy + r(song.ms) + 18 : cy - r(song.ms) - 22
          return (
            <g key={song.key} className="callout">
              <text x={cx + (flip ? 6 : -6)} y={ty} textAnchor={flip ? 'end' : 'start'} className="callout__tag">
                {tag}
              </text>
              <text x={cx + (flip ? 6 : -6)} y={ty + 15} textAnchor={flip ? 'end' : 'start'} className="callout__name">
                {song.title.length > 28 ? `${song.title.slice(0, 27)}…` : song.title}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered && shown && (
        <FloatTip x={shown.x} y={shown.y} onDismiss={pinned ? noop : clearHover}>
          <span className="float-tip__title">{hovered.title}</span>
          <span>{hovered.artist}</span>
          <span className="float-tip__row">
            Started <b>{formatNumber(hovered.plays)}×</b>
          </span>
          <span className="float-tip__row">
            Skipped <b>{formatPercent(hovered.skips / hovered.plays)}</b>
          </span>
          <span className="float-tip__row">
            Listened <b>{formatDuration(hovered.ms)}</b>
          </span>
        </FloatTip>
      )}

      <ul className="callout-cards">
        {callouts.map(({ song, tag }) => (
          <li key={song.key}>
            <span className="callout-cards__tag">{tag}</span>
            <strong>{song.title}</strong>
            <span className="muted">
              {song.artist} · {formatNumber(song.plays)} plays · skipped {formatPercent(song.skips / song.plays)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LoveHateTable({ songs }: { songs: SongStat[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Song</th>
          <th>Artist</th>
          <th className="num">Plays</th>
          <th className="num">Skipped</th>
          <th className="num">Time</th>
        </tr>
      </thead>
      <tbody>
        {songs.map((s) => (
          <tr key={s.key}>
            <td>{s.title}</td>
            <td>{s.artist}</td>
            <td className="num">{formatNumber(s.plays)}</td>
            <td className="num">{formatPercent(s.skips / s.plays)}</td>
            <td className="num">{formatDuration(s.ms)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
