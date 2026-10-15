import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphLink, GraphNode } from '../data/insights'
import { formatDuration, formatNumber } from '../lib/format'
import { useWidth } from '../lib/hooks'
import { isHover } from '../lib/pointer'
import { mulberry32 } from '../lib/random'
import { usePanZoom } from '../lib/zoom'
import { layoutConstellation, starSize, trimGraph } from '../viz/constellation'
import { ZoomControls } from './ZoomControls'

/*
 * "Constellation": your top artists as stars, linked when you tend to play
 * one straight after the other. Clusters are your scenes.
 */

interface Props {
  nodes: GraphNode[]
  links: GraphLink[]
  colors: Map<string, string>
  onPoster: () => void
}

const STARLIGHT = '#d9d4ff'

export function Constellation({ nodes: allNodes, links: allLinks, colors, onPoster }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, 900)
  const narrow = width < 600
  const height = narrow ? 480 : 600
  const [active, setActiveNow] = useState<string | null>(null)
  const skyRef = useRef<HTMLDivElement>(null)
  const zoom = usePanZoom(skyRef, { width, height, max: 4 })
  const view = zoom.view
  // A clicked star stays selected until it is clicked again (or the sky is)
  const [pinned, setPinned] = useState<string | null>(null)
  const clearTimer = useRef<number | undefined>(undefined)
  // Moving star to star fires a leave then an enter; clearing on a short delay stops the readout flashing its idle text in between
  const setActive = useCallback((id: string | null) => {
    window.clearTimeout(clearTimer.current)
    if (id === null) clearTimer.current = window.setTimeout(() => setActiveNow(null), 120)
    else setActiveNow(id)
  }, [])
  useEffect(() => () => window.clearTimeout(clearTimer.current), [])

  // Phones get fewer, bigger stars so names stay readable
  const { nodes, links } = useMemo(() => trimGraph(allNodes, allLinks, narrow ? 22 : allNodes.length), [allNodes, allLinks, narrow])
  const maxMs = Math.max(...nodes.map((n) => n.ms), 1)
  const maxCount = Math.max(...links.map((l) => l.count), 1)
  const layout = useMemo(() => layoutConstellation(nodes, links), [nodes, links])

  // Fit the layout into the box
  const xs = [...layout.values()].map((p) => p.x)
  const ys = [...layout.values()].map((p) => p.y)
  const pad = narrow ? 44 : 70
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY, 2.2)
  // Zooming spreads the stars apart; their sizes grow only a little, so crowded clusters open up
  const pos = (id: string) => {
    const p = layout.get(id)!
    const x = width / 2 + (p.x - minX - spanX / 2) * scale
    const y = height / 2 + (p.y - minY - spanY / 2) * scale
    return { x: view.x + view.s * x, y: view.y + view.s * y }
  }
  const grow = Math.pow(view.s, 0.3)

  const stars = useMemo(() => {
    const rand = mulberry32(99)
    return Array.from({ length: 160 }, () => ({ x: rand(), y: rand(), r: rand() * 1.1 + 0.2, delay: rand() * 6 }))
  }, [])

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of links) {
      if (!map.has(l.source)) map.set(l.source, new Set())
      if (!map.has(l.target)) map.set(l.target, new Set())
      map.get(l.source)!.add(l.target)
      map.get(l.target)!.add(l.source)
    }
    return map
  }, [links])

  const shown = pinned ?? active
  const isLit = (id: string) => !shown || id === shown || neighbors.get(shown)?.has(id)
  // More names fit as the stars spread out
  const labelled = new Set(nodes.slice(0, Math.round((narrow ? 8 : 14) * view.s * view.s)).map((n) => n.id))

  const activeLinks = shown
    ? links
        .filter((l) => l.source === shown || l.target === shown)
        .sort((a, b) => b.count - a.count)
        .map((l) => ({ other: l.source === shown ? l.target : l.source, count: l.count }))
    : []

  return (
    <div className="constellation" ref={ref}>
      <div className={view.s > 1.01 ? 'constellation__sky is-zoomed' : 'constellation__sky'} ref={skyRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Network of your top artists, linked by what you play back to back"
        onClick={(e) => {
          if (e.target !== e.currentTarget) return
          setPinned(null)
          setActive(null)
        }}
      >
        <defs>
          <filter id="star-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x * width}
            cy={s.y * height}
            r={s.r}
            className="constellation__star"
            style={{ animationDelay: `${s.delay}s` }}
          />
        ))}

        {links.map((l) => {
          const a = pos(l.source)
          const b = pos(l.target)
          const on = shown && (l.source === shown || l.target === shown)
          return (
            <line
              key={`${l.source}-${l.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={on ? 'constellation__link is-on' : 'constellation__link'}
              strokeWidth={0.6 + (l.count / maxCount) * 2.4}
              strokeOpacity={shown ? (on ? 0.9 : 0.04) : 0.1 + (l.count / maxCount) * 0.4}
            />
          )
        })}

        {nodes.map((n) => {
          const p = pos(n.id)
          const color = colors.get(n.id) ?? STARLIGHT
          const r = starSize(n.ms, maxMs) * (narrow ? 0.85 : 1) * grow
          const lit = isLit(n.id)
          return (
            <g
              key={n.id}
              className="constellation__node"
              opacity={lit ? 1 : 0.18}
              tabIndex={0}
              role="button"
              aria-label={`${n.id}, ${formatDuration(n.ms)}`}
              onPointerEnter={(e) => isHover(e) && setActive(n.id)}
              onPointerLeave={(e) => isHover(e) && setActive(null)}
              aria-pressed={pinned === n.id}
              onClick={() => setPinned(pinned === n.id ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                setPinned(pinned === n.id ? null : n.id)
              }}
              onFocus={() => setActive(n.id)}
              onBlur={() => setActive(null)}
            >
              <circle cx={p.x} cy={p.y} r={r * 1.9} fill={color} opacity={0.35} filter="url(#star-glow)" />
              <circle cx={p.x} cy={p.y} r={r} fill={color} />
              <circle cx={p.x} cy={p.y} r={r * 0.35} fill="#fff" opacity={0.75} />
              <circle cx={p.x} cy={p.y} r={Math.max(r + 8, 14)} fill="transparent" />
              {(shown ? n.id === shown || (lit && !narrow) : labelled.has(n.id)) && (
                <text x={p.x} y={p.y + r + 14} textAnchor="middle" className="constellation__label">
                  {n.id}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <ZoomControls zoom={zoom} className="constellation__zoom" />
      </div>

      <div className="constellation__readout" aria-live="polite">
        <div className="constellation__text">
        {shown ? (
          <>
            <strong>{shown}</strong>
            {activeLinks.length ? (
              <span>
                Most often played back to back with{' '}
                {activeLinks.slice(0, 3).map((l, i) => (
                  <span key={l.other}>
                    {i > 0 && (i === Math.min(activeLinks.length, 3) - 1 ? ' and ' : ', ')}
                    <em>{l.other}</em> ({formatNumber(l.count)}×)
                  </span>
                ))}
                .
              </span>
            ) : (
              <span>A lone star: rarely played next to your other favorites.</span>
            )}
          </>
        ) : (
          <span className="muted">
            Bigger stars got more of your time. Lines join artists you play back to back, thicker for more often.{' '}
            {narrow ? 'Tap a star.' : 'Hover a star, click to keep it selected.'}
          </span>
        )}
        </div>
        <button type="button" className="button button--ghost button--small" onClick={onPoster}>
          Make it a poster →
        </button>
      </div>
    </div>
  )
}

export function ConstellationTable({ links }: { links: GraphLink[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Artist</th>
          <th>Played next to</th>
          <th className="num">Times</th>
        </tr>
      </thead>
      <tbody>
        {[...links]
          .sort((a, b) => b.count - a.count)
          .map((l) => (
            <tr key={`${l.source}-${l.target}`}>
              <td>{l.source}</td>
              <td>{l.target}</td>
              <td className="num">{formatNumber(l.count)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
