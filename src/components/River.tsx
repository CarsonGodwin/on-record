import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape'
import { useCallback, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { artistSeries, type Bins, type Era } from '../data/insights'
import { formatDate, formatDuration, formatMonthShort, formatMonthYearShort, formatPercent } from '../lib/format'
import { useWidth } from '../lib/hooks'
import { COARSE, leaveUnlessTouch } from '../lib/pointer'
import { colorFor } from '../lib/palette'
import { FloatTip, ReadingGuide } from './ui'

/*
 * "Eras": a streamgraph of your top artists over time, with the stretches where
 * one artist led your listening called out above it.
 */

interface Props {
  bins: Bins
  totals: Map<string, number>[]
  eras: Era[]
  /** Top artists in view, at most 8 */
  artists: string[]
  colors: Map<string, string>
}

const MARGIN = { top: 44, right: 8, bottom: 28, left: 8 }

type Row = Record<string, number>

export function River({ bins, totals, eras, artists, colors }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef, 900)
  const height = width < 600 ? 300 : 400
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const clearHover = useCallback(() => setHover(null), [])

  const n = bins.starts.length
  const layers = useMemo(() => {
    const series = artistSeries(totals, artists, bins.size === 'month' ? 1 : 2)
    const rows: Row[] = bins.starts.map((_, i) => Object.fromEntries(artists.map((a) => [a, series.get(a)![i]])))
    return stack<Row>().keys(artists).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows)
  }, [bins, totals, artists])

  const innerW = width - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top - MARGIN.bottom
  const x = (i: number) => MARGIN.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)

  let lo = Infinity
  let hi = -Infinity
  for (const layer of layers) {
    for (const d of layer) {
      lo = Math.min(lo, d[0])
      hi = Math.max(hi, d[1])
    }
  }
  const span = hi - lo || 1
  const y = (v: number) => MARGIN.top + innerH - ((v - lo) / span) * innerH

  const path = area<[number, number]>()
    .x((_, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveBasis)

  // Label each stream where it's thickest, if there's room and it doesn't collide with a bigger stream's label
  const candidates = layers.flatMap((layer) => {
    let best = 0
    layer.forEach((d, i) => {
      if (d[1] - d[0] > layer[best][1] - layer[best][0]) best = i
    })
    const d = layer[best]
    const thickness = ((d[1] - d[0]) / span) * innerH
    if (thickness < 18) return []
    const half = layer.key.length * 3.7 + 4
    const cx = Math.max(MARGIN.left + half, Math.min(width - MARGIN.right - half, x(best)))
    return [{ key: layer.key, x: cx, y: y((d[0] + d[1]) / 2), half, thickness }]
  })
  const labels: typeof candidates = []
  for (const c of candidates.sort((a, b) => b.thickness - a.thickness)) {
    const clash = labels.some((l) => Math.abs(l.x - c.x) < l.half + c.half && Math.abs(l.y - c.y) < 16)
    if (!clash) labels.push(c)
  }

  const ticks = bins.starts.flatMap((t, i) => {
    const d = new Date(t)
    if (bins.size === 'month') return d.getMonth() === 0 || i === 0 ? [{ i, label: String(d.getFullYear()) }] : []
    // Weekly: the first week that starts in each month
    const prev = i > 0 ? new Date(bins.starts[i - 1]) : null
    return !prev || prev.getMonth() !== d.getMonth() ? [{ i, label: formatMonthShort(d.getMonth()) }] : []
  })
  const tickEvery = Math.max(1, Math.ceil((ticks.length * 44) / innerW))

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - MARGIN.left) / innerW) * (n - 1))))
    setHover({ i, x: e.clientX, y: e.clientY })
  }

  const lead = colorFor(colors, artists[0])
  const unit = bins.size === 'month' ? 'month' : 'week'

  return (
    <div className="river" ref={wrapRef}>
      <ReadingGuide
        takeaway={erasTakeaway(bins, eras)}
        items={[
          {
            glyph: <rect x={1} y={4} width={26} height={8} rx={4} fill={eras[0] ? colorFor(colors, eras[0].artist) : lead} />,
            text: 'An era: a stretch when one artist led',
          },
          {
            glyph: <path d="M1 7.5C9 7 15 2 27 1.5V14.5C15 14 9 9 1 8.5Z" fill={lead} />,
            text: `Thicker stream = more hours that ${unit}`,
          },
          {
            glyph: (
              <>
                <line x1={14} x2={14} y1={1} y2={15} stroke="currentColor" strokeWidth={1.5} />
                <circle cx={14} cy={8} r={3} fill="currentColor" />
              </>
            ),
            text: `${COARSE ? 'Tap' : 'Hover'} anywhere for that ${unit}’s top artists`,
          },
        ]}
      />
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Streamgraph of your top ${artists.length} artists over time`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={leaveUnlessTouch(() => setHover(null))}
      >
        <defs>
          <linearGradient id="river-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Era strip */}
        {eras.map((era) => {
          const x0 = Math.max(MARGIN.left, x(era.start - 0.5))
          const x1 = Math.min(width - MARGIN.right, x(era.end + 0.5))
          const w = Math.max(2, x1 - x0 - 2)
          const label = era.artist
          return (
            <g key={`${era.artist}-${era.start}`} className="river__era">
              <rect x={x0 + 1} y={6} width={w} height={24} rx={12} fill={colorFor(colors, era.artist)} />
              {w > label.length * 6.6 + 18 && (
                <text x={x0 + 1 + w / 2} y={22} textAnchor="middle">
                  {label}
                </text>
              )}
            </g>
          )
        })}

        {layers.map((layer) => (
          <path
            key={layer.key}
            d={path(layer as unknown as [number, number][]) ?? ''}
            fill={colorFor(colors, layer.key)}
            className="river__layer"
            opacity={hover ? 0.85 : 1}
          />
        ))}
        {layers.map((layer) => (
          <path key={`${layer.key}-sheen`} d={path(layer as unknown as [number, number][]) ?? ''} fill="url(#river-fade)" pointerEvents="none" />
        ))}

        {labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} className="river__label" textAnchor="middle" dominantBaseline="middle">
            {l.key}
          </text>
        ))}

        {ticks
          .filter((_, k) => k % tickEvery === 0)
          .map((t) => (
            <text key={t.i} x={x(t.i)} y={height - 8} className="axis-label" textAnchor="middle">
              {t.label}
            </text>
          ))}

        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={MARGIN.top - 6} y2={height - MARGIN.bottom + 4} className="crosshair" />}
      </svg>

      {hover && (
        <FloatTip x={hover.x} y={hover.y} onDismiss={clearHover}>
          <span className="float-tip__title">{binLabel(bins, hover.i)}</span>
          {artists
            .map((a) => ({ a, ms: totals[hover.i].get(a) ?? 0 }))
            .filter((r) => r.ms > 0)
            .sort((p, q) => q.ms - p.ms)
            .map((r) => (
              <span key={r.a} className="float-tip__row">
                <i style={{ background: colorFor(colors, r.a) }} />
                {r.a}
                <b>{formatDuration(r.ms)}</b>
              </span>
            ))}
        </FloatTip>
      )}

      {eras.length > 0 && (
        <ol className="eras">
          {eras.map((era) => (
            <li key={`${era.artist}-${era.start}`} className="era" style={{ ['--era' as string]: colorFor(colors, era.artist) }}>
              <span className="era__name">
                {/* "The The Paper Moons era" reads wrong; a name that starts with "The" brings its own */}
                {/^the /i.test(era.artist) ? '' : 'The '}
                <em>{era.artist}</em> era
              </span>
              <span className="era__meta">
                {eraRange(bins, era)} · {formatPercent(era.share)} of your music
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** The chart in one sentence: how many eras, the longest, and the latest */
function erasTakeaway(bins: Bins, eras: Era[]): ReactNode {
  if (eras.length === 0) return 'No one artist stayed on top for long here, so there are no eras. Just a mix.'
  const longest = eras.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a))
  const latest = eras.reduce((a, b) => (b.start > a.start ? b : a))
  return (
    <>
      {eras.length === 1 ? 'One era' : `${eras.length} eras`}. The longest was <em>{longest.artist}</em>, {eraRange(bins, longest)}
      {latest === longest ? '.' : <>. The latest: <em>{latest.artist}</em>.</>}
    </>
  )
}

function binLabel(bins: Bins, i: number): string {
  const start = bins.starts[i]
  return bins.size === 'month' ? formatMonthYearShort(start) : `Week of ${formatDate(start)}`
}

function eraRange(bins: Bins, era: Era): string {
  const start = bins.starts[era.start]
  if (bins.size === 'month') {
    const a = formatMonthYearShort(start)
    const b = formatMonthYearShort(bins.starts[era.end])
    return a === b ? a : `${a} – ${b}`
  }
  const end = new Date(bins.starts[era.end])
  const weekEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 6).getTime()
  return `${formatDate(start)} – ${formatDate(Math.min(weekEnd, bins.end))}`
}

export function RiverTable({ bins, totals, artists }: { bins: Bins; totals: Map<string, number>[]; artists: string[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>{bins.size === 'month' ? 'Month' : 'Week'}</th>
          {artists.map((a) => (
            <th key={a} className="num">
              {a}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bins.starts.map((_, i) => (
          <tr key={i}>
            <td>{binLabel(bins, i)}</td>
            {artists.map((a) => (
              <td key={a} className="num">
                {totals[i].get(a) ? formatDuration(totals[i].get(a)!) : '–'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
