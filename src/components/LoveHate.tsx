import { useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { SongStat } from '../data/insights'
import { hatedFact, loveHate, lovedFact, type LoveHatePick, type SongTally } from '../data/lovehate'
import { formatDuration, formatNumber, formatPercent } from '../lib/format'
import { usePageScroll, useWidth } from '../lib/hooks'
import { leaveUnlessTouch } from '../lib/pointer'
import { SERIES } from '../lib/palette'
import { InCards } from '../lib/stage'
import type { Play } from '../types'
import { Cover } from './Cover'
import { FloatTip } from './ui'

/*
 * "Love / Hate": the song you let play the most against the one you skip the
 * most, each with two runners-up. Below that on the page, every one of your
 * most-played songs by how often you start it (across) and skip it (up).
 */

const M = { top: 20, right: 12, bottom: 40, left: 42 }

/** Let-play and skipped, in the bars and the swatches by each side's name */
const KEPT = SERIES[1]
const SKIPPED = SERIES[2]

interface Props {
  songs: SongStat[]
  /** Overall skip rate, used as the horizontal divider */
  skipRate: number
  /** The filtered plays, for the head-to-head */
  plays: Play[]
}

const noop = () => {}

export function LoveHate({ songs, skipRate, plays }: Props) {
  const cards = useContext(InCards)
  const pick = useMemo(() => loveHate(plays), [plays])
  const marks = useMemo(
    () =>
      [
        { key: pick.loved[0]?.key, tag: 'Most loved' },
        { key: pick.hated[0]?.key, tag: 'Most skipped' },
      ].filter((m): m is { key: string; tag: string } => !!m.key),
    [pick],
  )
  const duel = <Duel pick={pick} />
  // A phone gets the two songs alone; the scatter stays on the page, with the two songs marked on it
  if (cards) return <div className="lovehate lovehate--card">{duel}</div>
  return (
    <div className="lovehate">
      {duel}
      <Scatter songs={songs} skipRate={skipRate} marks={marks} />
    </div>
  )
}

/** Most loved against most skipped, like the two sides of a single */
function Duel({ pick }: { pick: LoveHatePick }) {
  const n = pick.minStarts
  return (
    <div className="duel">
      <DuelSide
        title="Most loved"
        swatch={KEPT}
        songs={pick.loved}
        fact={lovedFact}
        count={(s) => `${formatNumber(s.kept)} of ${formatNumber(s.starts)}`}
        empty={`Every song you started ${n} or more times got skipped more than 1 time in 5.`}
      />
      <DuelSide
        title="Most skipped"
        swatch={SKIPPED}
        songs={pick.hated}
        fact={hatedFact}
        count={(s) => `${formatNumber(s.skips)} of ${formatNumber(s.starts)}`}
        empty={`Nothing you started ${n} or more times got skipped more often than not.`}
      />
    </div>
  )
}

interface SideProps {
  title: string
  swatch: string
  /** The headliner first, then the runners-up */
  songs: SongTally[]
  fact: (s: SongTally) => string
  /** The one number a runner-up shows, the same count its headliner's sentence uses */
  count: (s: SongTally) => string
  empty: string
}

function DuelSide({ title, swatch, songs, fact, count, empty }: SideProps) {
  const [hero, ...rest] = songs
  return (
    <section className="duel__side" aria-label={title}>
      <h3 className="duel__label">
        <i className="duel__swatch" style={{ background: swatch }} aria-hidden="true" />
        {title}
      </h3>
      {hero ? (
        <>
          <div className="duel__hero">
            <Cover name={`${hero.title}|${hero.artist}`} size={96} className="duel__cover" />
            <div className="duel__info">
              <strong className="duel__title">{hero.title}</strong>
              <span className="duel__artist">{hero.artist}</span>
              <p className="duel__fact">{fact(hero)}</p>
              <div className="duel__bar" aria-hidden="true">
                <i style={{ flexGrow: hero.kept, background: KEPT }} />
                <i style={{ flexGrow: hero.skips, background: SKIPPED }} />
              </div>
            </div>
          </div>
          {rest.length > 0 && (
            <ol className="duel__more" start={2}>
              {rest.map((s) => (
                <li key={s.key}>
                  <span className="duel__song">
                    <span className="duel__song-title">{s.title}</span> <span className="duel__song-artist">{s.artist}</span>
                  </span>
                  <span className="duel__count">{count(s)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <p className="duel__empty">{empty}</p>
      )}
    </section>
  )
}

interface ScatterProps {
  songs: SongStat[]
  skipRate: number
  /** Songs to mark and name on the chart */
  marks: { key: string; tag: string }[]
}

function Scatter({ songs, skipRate, marks }: ScatterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, 900)
  const height = width < 600 ? 380 : 460
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const clearHover = useCallback(() => setHover(null), [])
  // A clicked dot stays selected (and its tooltip stays put) until it is clicked again
  const [pinned, setPinned] = useState<{ i: number; x: number; pageY: number } | null>(null)
  const scrollY = usePageScroll(pinned !== null)
  const narrow = width < 600

  // The pinned tip rides along with page scroll, so drop it once the chart is out of view
  useEffect(() => {
    const el = ref.current
    if (!pinned || !el) return
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPinned(null)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [pinned])

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

  const callouts = useMemo(
    () => marks.flatMap(({ key, tag }) => songs.filter((s) => s.key === key).map((song) => ({ song, tag }))),
    [songs, marks],
  )
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
    <div className="lovehate__scatter" ref={ref}>
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
