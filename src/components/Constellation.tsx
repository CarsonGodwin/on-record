import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GraphLink, GraphNode } from '../data/insights'
import { formatDuration, formatNumber } from '../lib/format'
import { useSize, useWidth } from '../lib/hooks'
import { isHover } from '../lib/pointer'
import { mulberry32 } from '../lib/random'
import { InCards } from '../lib/stage'
import { usePanZoom } from '../lib/zoom'
import { layoutConstellation, nearestStar, starSize, trimGraph } from '../viz/constellation'
import { ZoomControls } from './ZoomControls'

/*
 * "Constellation": your top artists as stars, linked when you tend to play
 * one straight after the other. Clusters are your scenes.
 */

interface Props {
  nodes: GraphNode[]
  links: GraphLink[]
  colors: Map<string, string>
  onPoster?: () => void
}

const STARLIGHT = '#d9d4ff'
/** On a phone's card a tap takes the nearest star this far past its edge, since the stars themselves are small targets */
const REACH = 30

/** "A", "A and B", "A, B and C", each name in the serif */
function nameList(names: string[]): ReactNode {
  return names.map((name, i) => (
    <span key={name}>
      {i > 0 && (i === names.length - 1 ? ' and ' : ', ')}
      <em>{name}</em>
    </span>
  ))
}

export function Constellation({ nodes: allNodes, links: allLinks, colors, onPoster }: Props) {
  // On a phone's card the sky fills the card and a finger always explores it; on the page it's a band in the column
  const card = useContext(InCards)
  const ref = useRef<HTMLDivElement>(null)
  const skyRef = useRef<HTMLDivElement>(null)
  const columnWidth = useWidth(ref, 900)
  // Only a card fits the sky to its box; the page goes by the column, so watching the box there would just redraw the sky
  const box = useSize(skyRef, { width: 358, height: 400 }, card)
  const width = card ? box.width : columnWidth
  const narrow = width < 600
  const height = card ? box.height : narrow ? 480 : 600
  const [active, setActiveNow] = useState<string | null>(null)
  const zoom = usePanZoom(skyRef, { width, height, max: 4, oneFinger: card, doubleTap: card })
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
  const pad = card ? 40 : narrow ? 44 : 70
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY, 2.2)
  // A phone's card is taller than the graph is: stretch it down a little (up to 1.7×) to fill the sky and open up the labels
  const scaleY = card ? Math.min((height - pad * 2) / spanY, scale * 1.7) : scale
  // Zooming spreads the stars apart; their sizes grow only a little, so crowded clusters open up
  const pos = (id: string) => {
    const p = layout.get(id)!
    const x = width / 2 + (p.x - minX - spanX / 2) * scale
    const y = height / 2 + (p.y - minY - spanY / 2) * scaleY
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

  // A selection can outlive its star (a new year, or a phone trimming the sky), so ignore ids no longer drawn
  const shown = [pinned, active].find((id) => id !== null && layout.has(id)) ?? null
  const isLit = (id: string) => !shown || id === shown || neighbors.get(shown)?.has(id)
  // More names fit as the stars spread out
  const labelled = new Set(nodes.slice(0, Math.round((narrow ? 8 : 14) * view.s * view.s)).map((n) => n.id))
  const radius = (n: GraphNode) => starSize(n.ms, maxMs) * (narrow ? 0.85 : 1) * grow

  const activeLinks = shown
    ? links
        .filter((l) => l.source === shown || l.target === shown)
        .sort((a, b) => b.count - a.count)
        .map((l) => ({ other: l.source === shown ? l.target : l.source, count: l.count }))
    : []

  // Where each visible name goes. With a star selected on a phone the sky is too
  // tight to name every neighbor, so names are placed strongest link first, in the
  // first free spot around the star; any that don't fit are listed in the readout
  type Label = { x: number; y: number; anchor: 'middle' | 'start' | 'end' }
  const labels = (() => {
    const placed = new Map<string, Label>()
    const charW = narrow ? 7.4 : 7
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = []
    // A name that would land on another, or off the card, waits until zooming spreads the stars out
    const off = (b: (typeof boxes)[number]) => b.x0 < 0 || b.x1 > width || (card && (b.y0 < 0 || b.y1 > height))
    const place = (n: GraphNode, avoid: boolean) => {
      const p = pos(n.id)
      const r = radius(n)
      // Zoomed in on a card, a star panned out of sight takes its name with it
      if (card && (p.x < -r || p.x > width + r || p.y < -r || p.y > height + r)) return
      const w = n.id.length * charW + 6
      // Keep centred names inside the sky instead of half off its edge
      const cx = Math.max(w / 2, Math.min(width - w / 2, p.x))
      const spots: (Label & { x0: number })[] = [
        { x: cx, y: p.y + r + 14, anchor: 'middle', x0: cx - w / 2 },
        { x: cx, y: p.y - r - 7, anchor: 'middle', x0: cx - w / 2 },
        { x: p.x + r + 5, y: p.y + 4, anchor: 'start', x0: p.x + r + 2 },
        { x: p.x - r - 5, y: p.y + 4, anchor: 'end', x0: p.x - r - 2 - w },
      ]
      for (const { x0, ...spot } of avoid ? spots : spots.slice(0, 1)) {
        const box = { x0, x1: x0 + w, y0: spot.y - 12, y1: spot.y + 4 }
        if (avoid && (off(box) || boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1))) continue
        boxes.push(box)
        placed.set(n.id, spot)
        return
      }
    }
    if (!shown) {
      for (const n of nodes) if (labelled.has(n.id)) place(n, card)
    } else if (!narrow) {
      for (const n of nodes) if (isLit(n.id)) place(n, false)
    } else {
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const self = byId.get(shown)!
      const p = pos(shown)
      const r = radius(self)
      // The selected star itself stays clear
      boxes.push({ x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r })
      place(self, true)
      for (const l of activeLinks) place(byId.get(l.other)!, true)
    }
    return placed
  })()
  // Neighbors past the top three that didn't get a name on the sky
  const unnamed = activeLinks.slice(3).filter((l) => !labels.has(l.other))

  const nearest = (x: number, y: number) => nearestStar(nodes.map((n) => ({ id: n.id, ...pos(n.id), r: radius(n) })), x, y, REACH)
  // With nothing picked, the card's caption names the pair you play back to back the most
  const tightest = links.reduce<GraphLink | null>((best, l) => (!best || l.count > best.count ? l : best), null)

  const zoomed = view.s > 1.01
  const sky = (
    <div className={zoomed ? 'constellation__sky is-zoomed' : 'constellation__sky'} ref={skyRef} data-drag={card || undefined}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Network of your top artists, linked by what you play back to back"
        onClick={(e) => {
          if (card) {
            const r = e.currentTarget.getBoundingClientRect()
            const id = nearest(e.clientX - r.left, e.clientY - r.top)
            setPinned(id === pinned ? null : id)
            return
          }
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
          const r = radius(n)
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
              // On a card the sky picks the nearest star itself
              onClick={card ? undefined : () => setPinned(pinned === n.id ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                setPinned(pinned === n.id ? null : n.id)
              }}
              // A tap focuses the star too; on a card only keyboard focus should light it, or a second tap couldn't let go
              onFocus={(e) => (!card || e.currentTarget.matches(':focus-visible')) && setActive(n.id)}
              onBlur={() => setActive(null)}
            >
              <circle cx={p.x} cy={p.y} r={r * 1.9} fill={color} opacity={0.35} filter="url(#star-glow)" className="constellation__halo" />
              <circle cx={p.x} cy={p.y} r={r} fill={color} />
              <circle cx={p.x} cy={p.y} r={r * 0.35} fill="#fff" opacity={0.75} />
              <circle cx={p.x} cy={p.y} r={Math.max(r + 8, 14)} fill="transparent" />
            </g>
          )
        })}

        {/* Names sit above every star so a neighbor's glow never covers them */}
        <g aria-hidden="true" pointerEvents="none">
          {[...labels].map(([id, label]) => (
            <text key={id} x={label.x} y={label.y} textAnchor={label.anchor} className="constellation__label">
              {id}
            </text>
          ))}
        </g>
      </svg>
      {!card && <ZoomControls zoom={zoom} className="constellation__zoom" />}
    </div>
  )

  if (card) {
    return (
      <div className="constellation is-card" ref={ref}>
        {sky}
        {zoomed && (
          <button type="button" className="constellation__reset" onClick={zoom.reset}>
            Reset
          </button>
        )}
        <p className="constellation__caption" aria-live="polite">
          {shown ? (
            <>
              <em className="constellation__who">{shown}</em>,{' '}
              {activeLinks.length ? <>often next to {nameList(activeLinks.slice(0, 2).map((l) => l.other))}.</> : 'rarely played next to your other favorites.'}
            </>
          ) : tightest ? (
            <>Most often back to back: {nameList([tightest.source, tightest.target])}, {formatNumber(tightest.count)} times.</>
          ) : (
            'None of these artists come up back to back often enough to join.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="constellation" ref={ref}>
      {sky}

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
                {unnamed.length > 0 && (
                  <>
                    {' '}Also linked: {unnamed.map((l) => l.other).join(', ')}.
                  </>
                )}
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
        {onPoster && (
          <button type="button" className="button button--ghost button--small" onClick={onPoster}>
            Make it a poster →
          </button>
        )}
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
