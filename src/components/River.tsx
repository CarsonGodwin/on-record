import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape'
import { useCallback, useContext, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { eraLength, longestEra, pickEras, spreadLabels } from '../data/eraTimeline'
import { artistSeries, type Bins, type Era } from '../data/insights'
import { formatDate, formatDuration, formatHours, formatMonthRange, formatMonthShort, formatMonthYearShort, formatPercent } from '../lib/format'
import { useSize, useWidth } from '../lib/hooks'
import { COARSE, leaveUnlessTouch } from '../lib/pointer'
import { colorFor } from '../lib/palette'
import { InCards } from '../lib/stage'
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

export function River(props: Props) {
  // A phone's card has no room for a wide river above a list, so time runs down the card instead
  return useContext(InCards) ? <ErasCard {...props} /> : <RiverPage {...props} />
}

/** The stacked, wiggle-centered streams, one layer per artist */
function useStreams(bins: Bins, totals: Map<string, number>[], artists: string[]) {
  return useMemo(() => {
    const series = artistSeries(totals, artists, bins.size === 'month' ? 1 : 2)
    const rows: Row[] = bins.starts.map((_, i) => Object.fromEntries(artists.map((a) => [a, series.get(a)![i]])))
    return stack<Row>().keys(artists).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows)
  }, [bins, totals, artists])
}

function RiverPage({ bins, totals, eras, artists, colors }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef, 900)
  const height = width < 600 ? 300 : 400
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const clearHover = useCallback(() => setHover(null), [])

  const n = bins.starts.length
  const layers = useStreams(bins, totals, artists)

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
                {eraRange(bins, era)}, {formatPercent(era.share)} of your music
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** As many eras as a phone's card can label without crowding */
const CARD_ERAS = 8
/** Room for the time axis's year (or month) labels, left of the river */
const AXIS_W = 36
/** Space above and below the river, so the first and last labels aren't clipped */
const PAD_Y = 10
/** Between two era labels */
const LABEL_GAP = 4

/**
 * Eras on a phone's card: one time axis runs down the card, oldest at the top.
 * The river turns on its side into a narrow column on the left, and each era
 * sits to its right at its real place in time: a bar from its first to its
 * last month, then the artist and when. Tap an era to pick out its stream, or
 * the river for that month's top artists.
 */
function ErasCard({ bins, totals, eras, artists, colors }: Props) {
  const plotRef = useRef<HTMLDivElement>(null)
  const { width: W, height: H } = useSize(plotRef, { width: 0, height: 0 })
  // The picked era, by its first bin (eras never share one)
  const [picked, setPicked] = useState<number | null>(null)
  // The bin tapped on the river. Its readout lives in the card, so it waits offstage with it.
  const [month, setMonth] = useState<number | null>(null)

  const layers = useStreams(bins, totals, artists)
  const { shown, hidden } = useMemo(() => pickEras(eras, CARD_ERAS), [eras])
  const era = shown.find((e) => e.start === picked) ?? null
  const unit = bins.size === 'month' ? 'month' : 'week'
  const n = bins.starts.length

  // Time runs down the card
  const top = PAD_Y
  const bottom = Math.max(top + 1, H - PAD_Y)
  const ty = (i: number) => top + (n > 1 ? Math.max(0, Math.min(n - 1, i)) / (n - 1) : 0.5) * (bottom - top)

  // The river's column: a third of the card, or most of it when there are no eras to label
  const riverRight = Math.round(W * (shown.length ? 0.36 : 0.66))
  let lo = Infinity
  let hi = -Infinity
  for (const layer of layers) {
    for (const d of layer) {
      lo = Math.min(lo, d[0])
      hi = Math.max(hi, d[1])
    }
  }
  const span = hi - lo || 1
  const vx = (v: number) => AXIS_W + ((v - lo) / span) * (riverRight - AXIS_W)
  const path = area<[number, number]>()
    .y((_, i) => ty(i))
    .x0((d) => vx(d[0]))
    .x1((d) => vx(d[1]))
    .curve(curveBasis)

  // Labels: as big as the room allows, then nudged apart so none overlap; bars stay at their true place
  const barX = riverRight + 10
  const labelX = barX + 16
  const step = shown.length ? Math.min(58, (H + LABEL_GAP) / shown.length) : 0
  const size = step - LABEL_GAP
  const fontPx = Math.max(15, Math.min(24, (size - 19) / 1.12))
  const nameH = fontPx * 1.12
  const mids = shown.map((e) => (ty(e.start - 0.5) + ty(e.end + 0.5)) / 2)
  const tops = spreadLabels(
    mids.map((m) => m - nameH / 2),
    size,
    LABEL_GAP,
    H,
  )

  // Year ticks (month ticks within a year), skipping any that would crowd the one before
  const ticks: { i: number; label: string }[] = []
  bins.starts.forEach((t, i) => {
    const d = new Date(t)
    const prev = i > 0 ? new Date(bins.starts[i - 1]) : null
    const label =
      bins.size === 'month'
        ? !prev || d.getFullYear() !== prev.getFullYear()
          ? String(d.getFullYear())
          : null
        : !prev || prev.getMonth() !== d.getMonth()
          ? formatMonthShort(d.getMonth())
          : null
    if (!label) return
    const last = ticks[ticks.length - 1]
    if (last && ty(i) - ty(last.i) < 22) {
      // The range's first label gives way to the first full year (or month)
      if (last.i === 0) ticks[ticks.length - 1] = { i, label }
      return
    }
    ticks.push({ i, label })
  })

  function pickMonth(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const py = e.clientY - rect.top
    setMonth(Math.max(0, Math.min(n - 1, Math.round(n > 1 ? ((py - top) / (bottom - top)) * (n - 1) : 0))))
  }

  const monthRows =
    month === null
      ? []
      : artists
          .map((a) => ({ a, ms: totals[month].get(a) ?? 0 }))
          .filter((r) => r.ms > 0)
          .sort((p, q) => q.ms - p.ms)
          .slice(0, 6)
  const monthY = month === null ? 0 : ty(month)

  const longest = longestEra(eras)
  const lengthOf = (e: Era) => {
    const k = eraLength(e)
    return `${k} ${unit}${k === 1 ? '' : 's'}`
  }

  return (
    <div
      className="eras-card"
      onPointerDown={(e) => {
        // A tap anywhere but the river puts its readout away
        if (!(e.target as Element).closest('.eras-card__river')) setMonth(null)
      }}
    >
      <p className="eras-card__status" aria-live="polite">
        {era ? (
          <>
            <em>{era.artist}</em> was {formatPercent(era.share)} of your music for those {lengthOf(era)}, {formatHours(era.ms)}.
          </>
        ) : longest ? (
          <>
            {eras.length === 1 ? 'One era' : `${eras.length} eras`}. The longest: <em>{longest.artist}</em>, {lengthOf(longest)}.
            {hidden > 0 && (
              <span className="eras-card__more">
                {' '}
                {hidden === 1 ? 'One shorter one isn’t shown.' : `${hidden} shorter ones aren’t shown.`}
              </span>
            )}
          </>
        ) : (
          'No one artist stayed on top for long here, so there are no eras. Just a mix.'
        )}
      </p>

      <div className="eras-card__plot" ref={plotRef}>
        {W > 0 && H > 0 && (
          <>
            <svg width={W} height={H} role="img" aria-label={`Your top ${artists.length} artists over time, oldest at the top, with ${shown.length} eras`}>
              {ticks.map((t) => (
                <g key={t.i}>
                  <text x={0} y={ty(t.i)} className="axis-label eras-card__tick" dominantBaseline="middle">
                    {t.label}
                  </text>
                  <line x1={AXIS_W - 7} x2={AXIS_W - 3} y1={ty(t.i)} y2={ty(t.i)} className="eras-card__tickmark" />
                </g>
              ))}

              {layers.map((layer) => (
                <path
                  key={layer.key}
                  d={path(layer as unknown as [number, number][]) ?? ''}
                  fill={colorFor(colors, layer.key)}
                  className="river__layer"
                  opacity={era ? (layer.key === era.artist ? 1 : 0.22) : month !== null ? 0.85 : 1}
                />
              ))}

              {/* The picked era's stretch, marked across the river */}
              {era &&
                [ty(era.start - 0.5), ty(era.end + 0.5)].map((y, k) => (
                  <line key={k} x1={AXIS_W - 4} x2={barX} y1={y} y2={y} className="eras-card__edge" />
                ))}

              {shown.map((e, k) => {
                const y0 = ty(e.start - 0.5)
                const y1 = ty(e.end + 0.5)
                const anchor = tops[k] + nameH / 2
                const color = colorFor(colors, e.artist)
                const dim = era !== null && era !== e
                return (
                  <g key={e.start} opacity={dim ? 0.35 : 1}>
                    <rect x={barX - (era === e ? 3 : 2)} y={y0 + 1} width={era === e ? 6 : 4} height={Math.max(4, y1 - y0 - 2)} rx={2} fill={color} />
                    <path
                      d={`M${barX + 2} ${mids[k]} C${barX + 9} ${mids[k]} ${labelX - 11} ${anchor} ${labelX - 4} ${anchor}`}
                      className="eras-card__leader"
                      stroke={color}
                    />
                  </g>
                )
              })}

              {month !== null && <line x1={AXIS_W - 4} x2={labelX - 10} y1={monthY} y2={monthY} className="crosshair" />}
            </svg>

            <div
              className="eras-card__river"
              data-drag=""
              style={{ width: riverRight + 6 }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                setPicked(null)
                pickMonth(e)
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'mouse' || e.currentTarget.hasPointerCapture?.(e.pointerId)) pickMonth(e)
              }}
              aria-hidden="true"
            />

            {shown.map((e, k) => {
              const left = barX - 8
              return (
                <button
                  key={e.start}
                  type="button"
                  className="eras-card__era"
                  aria-pressed={era === e}
                  aria-label={`The ${e.artist.replace(/^the /i, '')} era, ${eraRange(bins, e)}, ${formatPercent(e.share)} of your music`}
                  onClick={() => setPicked(era === e ? null : e.start)}
                  style={{
                    top: tops[k] - LABEL_GAP / 2,
                    height: step,
                    left,
                    paddingLeft: labelX - left,
                    paddingTop: LABEL_GAP / 2,
                    opacity: era !== null && era !== e ? 0.5 : 1,
                    // A long name steps down a size or two before it has to be cut short
                    ['--name' as string]: `${Math.max(15, Math.min(fontPx, (W - labelX) / serifEms(e.artist))).toFixed(1)}px`,
                  }}
                >
                  <span className="eras-card__name">{e.artist}</span>
                  <span className="eras-card__meta">
                    <span>{cardRange(bins, e)}</span>
                    <b>{formatPercent(e.share)}</b>
                  </span>
                </button>
              )
            })}

            {month !== null && (
              <div
                className="eras-card__readout"
                role="status"
                style={{ left: Math.max(0, Math.min(barX - 4, W - 200)), ...(monthY < H / 2 ? { top: Math.max(0, monthY - 16) } : { bottom: Math.max(0, H - monthY - 16) }) }}
                onClick={() => setMonth(null)}
              >
                <span className="eras-card__readout-title">{binLabel(bins, month)}</span>
                {monthRows.length === 0 && <span className="eras-card__readout-row">None of your top artists</span>}
                {monthRows.map((r) => (
                  <span key={r.a} className="eras-card__readout-row">
                    <i style={{ background: colorFor(colors, r.a) }} />
                    <span>{r.a}</span>
                    <b>{formatDuration(r.ms)}</b>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Short dates for an era on a phone: "Mar 2021 – Jan 2022" or "Jan – Jul 2024" by month, "Mar 3 – Apr 6" by
 * week. Weeks only bin a year or a short history, where the axis beside the label already gives the year.
 */
const dayRange = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
function cardRange(bins: Bins, era: Era): string {
  const start = bins.starts[era.start]
  const last = bins.starts[era.end]
  if (bins.size === 'month') return era.start === era.end ? formatMonthYearShort(start) : formatMonthRange(start, last)
  const end = new Date(last)
  const to = Math.min(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 6).getTime(), bins.end)
  // formatRange brings the years back for a range across New Year (a year's first week starts in December)
  return new Date(start).getFullYear() === new Date(to).getFullYear()
    ? dayRange.formatRange(start, to)
    : `${dayRange.format(start)}\u2009–\u2009${dayRange.format(to)}`
}

/** Roughly how wide Instrument Serif sets a name, in ems: enough to shrink a long name before it's cut */
function serifEms(text: string): number {
  return text.length * 0.44
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
