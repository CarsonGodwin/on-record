import { line, area, curveBasis } from 'd3-shape'
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { artistSeries, type Bins } from '../data/insights'
import { formatDate, formatDuration, formatMonthYearShort } from '../lib/format'
import { usePageScroll, useWidth } from '../lib/hooks'
import { leaveUnlessTouch } from '../lib/pointer'
import { colorFor } from '../lib/palette'
import { FloatTip } from './ui'

/*
 * "Pulse": a ridgeline of your top artists in the order you found them, drawn
 * like a certain famous album cover. Each line is one artist's listening over
 * time, scaled to that artist's own peak.
 */

interface Props {
  bins: Bins
  totals: Map<string, number>[]
  /** Top artists, already in discovery order */
  artists: string[]
  firstHeard: Map<string, number>
  colors: Map<string, string>
  onPoster: () => void
}

const noop = () => {}

export function Pulse({ bins, totals, artists, firstHeard, colors, onPoster }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, 900)
  const narrow = width < 640
  const step = narrow ? 24 : 30
  const left = narrow ? 8 : 170
  const right = narrow ? 8 : 110
  const amp = step * 3.4
  // Room for the first ridge's peaks, plus the column headings
  const headroom = amp + 30
  const height = headroom + step * artists.length + 30
  const innerW = width - left - right
  const [hover, setHover] = useState<{ row: number; i: number; x: number; y: number } | null>(null)
  const clearHover = useCallback(() => setHover(null), [])
  // A clicked ridge stays selected (and its tooltip stays put) until it is clicked again
  const [pinned, setPinned] = useState<{ row: number; i: number; x: number; pageY: number } | null>(null)
  const scrollY = usePageScroll(pinned !== null)
  const shown = pinned ? { row: pinned.row, i: pinned.i, x: pinned.x, y: pinned.pageY - scrollY } : hover

  const series = useMemo(() => artistSeries(totals, artists, bins.size === 'month' ? 1 : 2), [totals, artists, bins])
  const n = bins.starts.length
  const x = (i: number) => left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const baseline = (row: number) => headroom + row * step
  function locate(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const py = e.clientY - rect.top
    const px = e.clientX - rect.left
    // The ridge whose baseline is closest below the pointer
    const row = Math.max(0, Math.min(artists.length - 1, Math.ceil((py - headroom) / step)))
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - left) / innerW) * (n - 1))))
    return { row, i, x: e.clientX, y: e.clientY }
  }
  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (!pinned) setHover(locate(e))
  }
  function onClick(e: MouseEvent<SVGSVGElement>) {
    const at = locate(e)
    if (pinned?.row === at.row) {
      setPinned(null)
      setHover(at)
    } else {
      setPinned({ row: at.row, i: at.i, x: at.x, pageY: at.y + window.scrollY })
    }
  }

  return (
    <div className="pulse" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Ridgeline of your top ${artists.length} artists over time, in the order you first heard them`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={leaveUnlessTouch(clearHover)}
        onClick={onClick}
      >
        {artists.map((artist, row) => {
          const values = series.get(artist)!
          // Each ridge is scaled to its own peak: this chart is about shape, the tooltip has the hours
          const peak = Math.max(...values, 1)
          const base = baseline(row)
          const points = values.map((v, i) => [x(i), base - (v / peak) * amp] as [number, number])
          const fill = area<[number, number]>()
            .x((d) => d[0])
            .y0(base)
            .y1((d) => d[1])
            .curve(curveBasis)(points)
          const stroke = line().curve(curveBasis)(points)
          const on = shown?.row === row
          return (
            <g key={artist} className={on ? 'pulse__ridge is-on' : 'pulse__ridge'} style={{ ['--c' as string]: colorFor(colors, artist) }}>
              <path d={`${fill}`} className="pulse__fill" />
              <path d={stroke ?? ''} className="pulse__line" />
              {!narrow && (
                <>
                  <text x={left - 14} y={base - 2} textAnchor="end" className="pulse__name">
                    {artist.length > 22 ? `${artist.slice(0, 21)}…` : artist}
                  </text>
                  <text x={width - right + 14} y={base - 2} className="pulse__date">
                    {firstHeard.has(artist) ? formatMonthYearShort(firstHeard.get(artist)!) : ''}
                  </text>
                </>
              )}
              {narrow && on && (
                <text x={left + 4} y={base - 6} className="pulse__name pulse__name--inline">
                  {artist}
                </text>
              )}
            </g>
          )
        })}
        {!narrow && (
          <>
            <text x={left - 14} y={14} textAnchor="end" className="axis-title">
              artist
            </text>
            <text x={width - right + 14} y={14} className="axis-title">
              first heard
            </text>
          </>
        )}
        <text x={left} y={height - 6} className="axis-label">
          {formatMonthYearShort(bins.starts[0])}
        </text>
        <text x={left + innerW} y={height - 6} textAnchor="end" className="axis-label">
          {formatMonthYearShort(bins.starts[n - 1])}
        </text>
      </svg>

      {shown && (
        <FloatTip x={shown.x} y={shown.y} onDismiss={pinned ? noop : clearHover}>
          <span className="float-tip__title">{artists[shown.row]}</span>
          <span>
            {bins.size === 'month' ? formatMonthYearShort(bins.starts[shown.i]) : `Week of ${formatDate(bins.starts[shown.i])}`}
          </span>
          <span className="float-tip__big">{formatDuration(totals[shown.i].get(artists[shown.row]) ?? 0)}</span>
        </FloatTip>
      )}
      <div className="pulse__foot">
        <span className="muted">{pinned ? 'Click the line again to let go.' : narrow ? 'Tap a line to see whose it is.' : 'Hover a line to see whose it is, click to keep it.'}</span>
        <button type="button" className="button button--ghost button--small" onClick={onPoster}>
          Make it a poster →
        </button>
      </div>
    </div>
  )
}
