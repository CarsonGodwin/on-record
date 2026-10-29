import { WEAR_MAX, fromDayNumber } from '../data/stats'
import { formatDate, formatNumber } from '../lib/format'
import { isDarkPaper, type PosterData, type PosterPaper } from './poster'
import { DISPLAY, MINUTES, SLOT_OTHER, TAU, drawRecord, mix, quietestMinute, recordGeometry, type RecordModel } from './record'
import { clip, clock, curveThrough, driftScale, fit, monthly, pill, wrap } from './posterShared'

/*
 * The Deep dive poster (4:5): dense and made to be read up close, like a post on r/dataisbeautiful.
 * The record is the centerpiece, fully annotated, with small charts that unpack it underneath.
 */

/** Lines of callout detail that fit in a callout's block */
const DETAIL_LINES = 3

interface Callout {
  label: string
  value: string
  detail: string
  /** Points on the record that can stand for this moment */
  anchors: [number, number][]
}

export function renderDeepPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: PosterData, paper: PosterPaper, accentPick?: string) {
  const u = W / 100
  const pad = 5 * u
  const dark = isDarkPaper(paper)
  const bg = dark ? '#0e0d12' : '#efe8da'
  const ink = dark ? '#f4f1ea' : '#17141d'
  const soft = dark ? 'rgba(244, 241, 234, 0.64)' : 'rgba(23, 20, 29, 0.64)'
  const faint = dark ? 'rgba(244, 241, 234, 0.14)' : 'rgba(23, 20, 29, 0.14)'
  const otherColor = dark ? '#5d5868' : '#a8a2b3'
  const accent = accentPick ?? data.tracklist[0]?.color ?? '#ff277c'
  const font = (weight: number, px: number) => `${weight} ${px}px ${DISPLAY}`
  const model = data.record
  const multiYear = data.period.includes('–')
  const months = monthly(model, 'month', multiYear)
  const driftBins = monthly(model, driftScale(model, multiYear), multiYear)
  const firstDate = fromDayNumber(model.firstDay)
  const lastDate = fromDayNumber(model.firstDay + model.days - 1)

  ctx.save()
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  // ---------- Header: the title states what you're looking at ----------
  const y0 = data.period
  const years = Math.round(model.days / 365.25)
  const title = multiYear ? `${years} years of my music, one groove per day` : `My ${y0} in music, one groove per day`
  ctx.fillStyle = ink
  ctx.font = font(800, 4.2 * u)
  let y = wrap(ctx, title, pad, 9 * u, W - 2 * pad, 4.9 * u)

  // The headline numbers, big, in a row under the title
  const figures = [
    { value: data.stats.hours, label: 'hours listened' },
    { value: data.stats.streams, label: 'plays' },
    { value: data.stats.songs, label: 'different songs' },
    { value: data.stats.artists, label: 'artists' },
  ]
  const figW = (W - 2 * pad) / figures.length
  const figTop = y + 2.6 * u
  figures.forEach((f, i) => {
    const x = pad + i * figW
    ctx.fillStyle = ink
    ctx.font = font(800, 4 * u)
    ctx.fillText(formatNumber(f.value), x, figTop + 3.6 * u)
    ctx.fillStyle = soft
    ctx.font = font(600, 1.5 * u)
    ctx.fillText(f.label, x, figTop + 5.9 * u)
  })
  y = figTop + 5.9 * u

  ctx.fillStyle = soft
  ctx.font = font(500, 1.7 * u)
  y = wrap(
    ctx,
    `Each ring is one day, from the center (${formatDate(firstDate)}) to the edge (${formatDate(lastDate)}). Each colored mark is a play, placed at the time of day it happened, midnight at the top.`,
    pad,
    y + 3 * u,
    W - 2 * pad,
    2.35 * u,
  )
  ctx.fillStyle = faint
  ctx.fillRect(pad, y + 2 * u, W - 2 * pad, Math.max(1, 0.1 * u))

  // ---------- The record ----------
  const mainTop = y + 2.6 * u
  const mainBottom = mainTop + 58.5 * u
  const Rd = 25.5 * u
  const cx = W / 2
  const cy = (mainTop + mainBottom) / 2
  const s = Rd / recordGeometry(1, model.days).disc
  ctx.save()
  ctx.translate(cx - s / 2, cy - s / 2)
  drawRecord(ctx, model, {
    size: s,
    colors: data.recordColors,
    focus: null,
    title: '',
    subtitle: '',
    labelColor: accent,
    sheen: true,
    ink: 'rgba(0, 0, 0, 0)',
    guides: [],
    guideMinute: 0,
  })
  ctx.restore()
  const g = recordGeometry(s, model.days)
  const ringR = (ring: number) => g.inner + ring * g.ring
  const polar = (r: number, minute: number) => {
    const a = (minute / MINUTES) * TAU - Math.PI / 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
  }

  // Month (or year) boundaries as faint rings
  ctx.lineWidth = Math.max(1, 0.06 * u)
  for (const m of months.slice(1)) {
    const strong = multiYear ? m.month === 0 : m.month % 3 === 0
    if (multiYear && m.month % 3 !== 0) continue
    ctx.strokeStyle = strong ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.12)'
    ctx.beginPath()
    ctx.arc(cx, cy, ringR(m.ring0), 0, TAU)
    ctx.stroke()
  }

  // Label
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(cx, cy, g.label, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fit(ctx, data.recordTitle, cx, cy + 0.2 * u, g.label * 1.3, 2.6 * u, (px) => font(800, px))

  // 24-hour clock around the rim
  const hourNames = ['midnight', '3 am', '6 am', '9 am', 'noon', '3 pm', '6 pm', '9 pm']
  ctx.strokeStyle = soft
  ctx.fillStyle = soft
  ctx.lineWidth = Math.max(1, 0.1 * u)
  ctx.font = font(600, 1.45 * u)
  for (let h = 0; h < 24; h++) {
    const [ax, ay] = polar(Rd + 0.5 * u, h * 60)
    const [bx, by] = polar(Rd + (h % 3 === 0 ? 1.6 : 1) * u, h * 60)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    if (h % 3 === 0) ctx.fillText(hourNames[h / 3], ...polar(Rd + 3.4 * u, h * 60))
  }

  // Dates along the quietest radius, each sitting on its year (or quarter) ring
  const qm = quietestMinute(model)
  const marks = months.filter((m, i) => (multiYear ? m.month === 0 || i === 0 : m.month % 3 === 0))
  // Pills run along a radius at any angle, so crowding is judged on their boxes. The start always shows;
  // the rest step back evenly from the latest date, every year if they fit, else every other, and so on
  const pillFont = font(700, 1.35 * u)
  ctx.font = pillFont
  const pills = marks.map((m) => {
    const text = multiYear ? String(m.year) : m.label
    const [px, py] = polar(ringR(m.ring0), qm)
    const w = ctx.measureText(text).width + 2.4 * u * 0.62
    const h = 4.4 * u * 0.62
    return { text, px, py, x0: px - w / 2, x1: px + w / 2, y0: py - h / 2, y1: py + h / 2 }
  })
  const gapP = 0.5 * u
  const clash = (a: (typeof pills)[number], b: (typeof pills)[number]) => a.x0 < b.x1 + gapP && a.x1 > b.x0 - gapP && a.y0 < b.y1 + gapP && a.y1 > b.y0 - gapP
  const last = pills.length - 1
  let kept = pills.slice(0, 1)
  for (let step = 1; step <= last; step++) {
    const pick = [pills[0], ...pills.filter((_, i) => i > 0 && (last - i) % step === 0)]
    if (pick.every((a, i) => pick.slice(i + 1).every((b) => !clash(a, b)))) {
      kept = pick
      break
    }
  }
  for (const b of kept) pill(ctx, b.text, b.px, b.py, u * 0.62, pillFont)

  // Clock drift line
  const pts = driftBins.filter((m) => m.minute !== null).map((m) => polar(ringR((m.ring0 + m.ring1) / 2), m.minute as number))
  if (pts.length > 1) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [w, color] of [[0.8 * u, 'rgba(11, 10, 15, 0.85)'], [0.32 * u, '#ffffff']] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = w
      curveThrough(ctx, pts)
      ctx.stroke()
    }
    const [sx, sy] = pts[0]
    const [ex, ey] = pts[pts.length - 1]
    ctx.fillStyle = '#0b0a0f'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.22 * u
    ctx.beginPath()
    ctx.arc(sx, sy, 0.5 * u, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex, ey, 0.6 * u, 0, TAU)
    ctx.fill()
  }

  // ---------- Callouts ----------
  // Each moment lists every point that can stand for it (any play on a day, any angle across a streak),
  // and the placement picks whichever sits nearest a free label slot
  const callouts: Callout[] = []
  const arcsOn = (ring: number, match: (k: number) => boolean = () => true) => {
    const out: [number, number][] = []
    for (let k = 0; k < model.count; k++) {
      if (model.ring[k] === ring && match(k)) out.push(polar(ringR(ring + 0.5), (model.from[k] + model.to[k]) / 2))
    }
    return out
  }
  for (const m of data.moments) {
    if (m.kind === 'day') {
      callouts.push({ label: 'Biggest day', value: m.value, detail: m.detail, anchors: arcsOn(m.ring) })
    } else if (m.kind === 'streak') {
      const r = ringR(((m.ring + (m.ringEnd ?? m.ring)) / 2) + 0.5)
      callouts.push({ label: 'Longest streak', value: m.value, detail: m.detail, anchors: Array.from({ length: 48 }, (_, i) => polar(r, i * 30)) })
    } else if (m.kind === 'session' && m.from !== undefined && m.to !== undefined) {
      callouts.push({ label: 'Longest session', value: m.value, detail: `${m.detail}, from ${clock(m.from)}`, anchors: [polar(ringR(m.ring + 0.5), (m.from + m.to) / 2)] })
    } else if (m.kind === 'first') {
      callouts.push({ label: 'First play', value: m.value, detail: m.detail, anchors: [polar(ringR(m.ring + 0.5), m.from ?? 0)] })
    } else if (m.kind === 'week' && m.plays) {
      callouts.push({ label: 'Most played in a week', value: m.value, detail: m.detail, anchors: m.plays.map((p) => polar(ringR(p.ring + 0.5), p.minute)) })
    }
  }
  const quiet = goneQuiet(model)
  if (quiet) {
    const name = data.tracklist[quiet.slot]?.name ?? ''
    callouts.push({
      label: 'Went quiet on',
      value: name,
      detail: `Last played ${formatDate(fromDayNumber(model.firstDay + quiet.ring))}`,
      anchors: arcsOn(quiet.ring, (k) => model.slot[k] === quiet.slot),
    })
  }
  const { markers, leaders, boxes } = placeCallouts(ctx, callouts.filter((c) => c.anchors.length > 0), { cx, cy, rClear: Rd + 5.6 * u, rLabel: g.label, top: mainTop + 0.5 * u, bottom: mainBottom, pad, W, u, ink, soft, dark, accent, disc: g.disc, font })

  // White is only ever the drift line, so it gets a name where it ends, on whichever side is clearest
  if (pts.length > 1) {
    const [ex, ey] = pts[pts.length - 1]
    ctx.font = font(650, 1.3 * u)
    const tag = 'usual time of day'
    const tw = ctx.measureText(tag).width + 1.6 * u
    const th = 2.4 * u
    const gapX = 1.2 * u
    // Beside the dot, or above or below it at two distances and three alignments
    const options: [number, number][] = [[ex + gapX, ey - th / 2], [ex - gapX - tw, ey - th / 2]]
    for (const dy of [-1.2 * u - th, 1.2 * u, -3.8 * u - th, 3.8 * u]) {
      for (const dx of [-tw / 2, -u, -tw + u]) options.push([ex + dx, ey + dy])
    }
    // Callout text is worst to cover, then a numbered dot, then the line itself
    const inTag = ([x, y]: [number, number], [px, py]: [number, number]) => px > x - u && px < x + tw + u && py > y - u && py < y + th + u
    // A leader crosses the tag if any point along it lands inside
    const onLeader = (opt: [number, number], [a, b]: [number, number][]) =>
      Array.from({ length: 24 }, (_, i) => i / 23).some((t) => inTag(opt, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))
    const hits = (opt: [number, number]) =>
      pts.filter((pt) => inTag(opt, pt)).length +
      markers.filter((m) => inTag(opt, m)).length * 20 +
      leaders.filter((l) => onLeader(opt, l)).length * 10 +
      boxes.filter((b) => opt[0] < b.x1 && opt[0] + tw > b.x0 && opt[1] < b.y1 && opt[1] + th > b.y0).length * 50 +
      (opt[0] < pad || opt[0] + tw > W - pad ? 99 : 0)
    const [tx, ty] = options.reduce((best, opt) => (hits(opt) < hits(best) ? opt : best))
    ctx.fillStyle = 'rgba(11, 10, 15, 0.9)'
    ctx.beginPath()
    ctx.roundRect(tx, ty, tw, th, th / 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 0.1 * u
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(tag, tx + 0.8 * u, ty + th / 2 + 0.1 * u)
  }

  // ---------- Legend ----------
  let lx = pad
  let ly = mainBottom + 2.8 * u
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const legend = [
    // Only the artists with their own color on the record; everyone else is grey
    ...data.tracklist.slice(0, SLOT_OTHER).map((t, i) => ({ name: t.name, hours: t.ms / 3_600_000, color: data.recordColors[i] })),
    { name: 'Everyone else', hours: -1, color: otherColor },
  ]
  for (const item of legend) {
    ctx.font = font(650, 1.55 * u)
    const nameW = ctx.measureText(item.name).width
    ctx.font = font(500, 1.4 * u)
    const hrs = item.hours >= 0 ? ` ${formatNumber(item.hours)} h` : ''
    const hrsW = ctx.measureText(hrs).width
    const w = 1.8 * u + nameW + hrsW + 2.6 * u
    if (lx + w > W - pad) {
      lx = pad
      ly += 2.6 * u
    }
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(lx + 0.6 * u, ly - 0.5 * u, 0.6 * u, 0, TAU)
    ctx.fill()
    ctx.fillStyle = ink
    ctx.font = font(650, 1.55 * u)
    ctx.fillText(item.name, lx + 1.8 * u, ly)
    ctx.fillStyle = soft
    ctx.font = font(500, 1.4 * u)
    ctx.fillText(hrs, lx + 1.8 * u + nameW, ly)
    lx += w
  }

  // ---------- Three small charts ----------
  const panelTop = ly + 3.8 * u
  const gap = 3.5 * u
  const pw = (W - 2 * pad - 2 * gap) / 3
  const chartTop = panelTop + 4.4 * u
  const chartH = 9 * u
  const panel = (i: number, heading: string, sub: string) => {
    const x = pad + i * (pw + gap)
    ctx.textAlign = 'left'
    ctx.fillStyle = ink
    ctx.font = font(700, 1.9 * u)
    ctx.fillText(heading, x, panelTop)
    ctx.fillStyle = soft
    ctx.font = font(500, 1.35 * u)
    ctx.fillText(sub, x, panelTop + 2.2 * u)
    return x
  }

  // 1. Weekday × hour. Shades are by rank, not raw time: each step covers an equal share of the week's
  // hours, so a listener who's on all day still shows which hours are their heaviest
  {
    const x = panel(0, 'When I listen', 'By hour of the week')
    const grid = weekHour(model)
    const steps = 7
    const sorted = grid.flat().filter((v) => v > 0).sort((a, b) => a - b)
    const shade = (v: number) => {
      if (v <= 0) return mix(bg, accent, 0.04)
      let lo = 0
      let hi = sorted.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (sorted[mid] <= v) lo = mid + 1
        else hi = mid
      }
      return ramp(Math.min(steps - 1, Math.floor((lo / sorted.length) * steps)) / (steps - 1))
    }
    // Paper to accent, then on past it (lighter on midnight, deeper on cream) for the busiest hours
    const ramp = (f: number) => (f <= 0.75 ? mix(bg, accent, 0.14 + (f / 0.75) * 0.86) : mix(accent, dark ? '#ffffff' : '#000000', ((f - 0.75) / 0.25) * 0.45))

    // Key, right-aligned on the subtitle line
    const sq = 1.05 * u
    ctx.font = font(500, 1.2 * u)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'right'
    ctx.fillStyle = soft
    const keyY = panelTop + 2.2 * u
    ctx.fillText('more', x + pw, keyY)
    const keyRight = x + pw - ctx.measureText('more').width - 0.6 * u
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = ramp(i / (steps - 1))
      ctx.fillRect(keyRight - (steps - i) * sq, keyY - sq * 0.95, sq - 0.12 * u, sq - 0.12 * u)
    }
    ctx.fillStyle = soft
    ctx.fillText('less', keyRight - steps * sq - 0.5 * u, keyY)

    const labelW = 2.2 * u
    const cw = (pw - labelW) / 24
    const ch = (chartH - 2.2 * u) / 7
    ;['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d, row) => {
      ctx.fillStyle = soft
      ctx.font = font(500, 1.2 * u)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(d.slice(0, 2), x, chartTop + row * ch + ch / 2)
      for (let h = 0; h < 24; h++) {
        ctx.fillStyle = shade(grid[row][h])
        ctx.fillRect(x + labelW + h * cw + 0.08 * u, chartTop + row * ch + 0.08 * u, cw - 0.16 * u, ch - 0.16 * u)
      }
    })
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
    ctx.fillStyle = soft
    ctx.font = font(500, 1.2 * u)
    ;[['12a', 0], ['6a', 6], ['noon', 12], ['6p', 18]].forEach(([t, h]) => ctx.fillText(String(t), x + labelW + (Number(h) + 0.5) * cw, chartTop + chartH))
  }

  // 2. Hours per month, stacked by artist
  {
    const x = panel(1, 'Who I listened to', 'Hours per month, by artist')
    const max = Math.max(...months.map((m) => m.total), 1)
    const bh = chartH - 2.2 * u
    const bw = pw / months.length
    months.forEach((m, i) => {
      let top = chartTop + bh
      const parts = [...m.slots.map((v, s) => [v, data.recordColors[s]] as const), [Math.max(0, m.total - m.slots.reduce((a, b) => a + b, 0)), otherColor] as const]
      for (const [v, color] of parts) {
        const h = (v / max) * bh
        ctx.fillStyle = color
        ctx.fillRect(x + i * bw + bw * 0.08, top - h, bw * 0.84, h)
        top -= h
      }
    })
    ctx.fillStyle = soft
    ctx.font = font(500, 1.2 * u)
    ctx.textAlign = 'left'
    ctx.fillText(`${formatNumber(max / 60)} h`, x, chartTop - 0.6 * u)
    ctx.textAlign = 'center'
    let lastX = -Infinity
    months.forEach((m, i) => {
      const show = multiYear ? m.month === 0 : m.month % 3 === 0
      const lx = x + (i + 0.5) * bw
      const text = multiYear ? (years > 6 ? `’${String(m.year).slice(2)}` : String(m.year)) : m.label
      if (!show || lx - lastX < ctx.measureText(text).width + 1.2 * u) return
      ctx.fillText(text, lx, chartTop + chartH)
      lastX = lx
    })
  }

  // 3. How songs wear out: the skip rate by how many times I'd already heard the song, against my average.
  // It usually dips once a song is familiar, then climbs back as I tire of it
  {
    const x = panel(2, 'How songs wear out', 'Skip rate by times heard')
    const { rates, average, best, wornOut } = data.wearOut
    const bh = chartH - 2.2 * u
    const floor = chartTop + bh
    const n = rates.length
    ctx.textBaseline = 'alphabetic'

    if (n < 3) {
      ctx.fillStyle = soft
      ctx.font = font(500, 1.2 * u)
      ctx.textAlign = 'left'
      ctx.fillText('Not enough repeat plays yet', x, floor - 0.6 * u)
    } else {
      const px = (i: number) => x + (i / (n - 1)) * pw

      // The note goes in whichever top corner the curve leaves emptier
      const note: [string, number, number][] =
        wornOut !== null
          ? [['Tired of a song', 700, 1.3], [`by play ${wornOut}${wornOut === WEAR_MAX ? '+' : ''}`, 500, 1.2]]
          : [['Least skipped', 700, 1.3], [`on play ${best}`, 500, 1.2]]
      const noteW = Math.max(
        ...note.map(([text, weight, size]) => {
          ctx.font = font(weight, size * u)
          return ctx.measureText(text).width
        }),
      )
      const under = (i: number, left: number) => px(i) >= left - 0.6 * u && px(i) <= left + noteW + 0.6 * u
      const peakUnder = (left: number) => Math.max(0, ...rates.filter((_, i) => under(i, left)))
      const noteLeft = peakUnder(x) <= peakUnder(x + pw - noteW) ? x : x + pw - noteW

      // The rates sit in a narrow band, so the scale starts below the lowest one rather than at zero.
      // It's stretched so the curve passes under the note, with some headroom everywhere else
      const lowest = Math.min(...rates)
      const base = Math.max(0, lowest - 0.8 * (Math.max(average, ...rates) - lowest))
      const room = (floor - (chartTop + 3.4 * u)) / bh
      const top = Math.max(base + 0.01, base + (average - base) / 0.9, ...rates.map((r, i) => base + (r - base) / (under(i, noteLeft) ? room : 0.9)))
      const py = (r: number) => floor - ((r - base) / (top - base)) * bh

      // Sweet spot: the plays around the lowest point, where I almost never skip
      const bestRate = rates[best - 1]
      if (average > bestRate) {
        const limit = bestRate + 0.25 * (average - bestRate)
        let lo = best - 1
        let hi = best - 1
        while (lo > 0 && rates[lo - 1] <= limit) lo--
        while (hi < n - 1 && rates[hi + 1] <= limit) hi++
        const x0 = Math.max(x, px(lo - 0.5))
        const x1 = Math.min(x + pw, px(hi + 0.5))
        // Only drawn when its label fits under the curve
        ctx.font = font(500, 1.2 * u)
        if (ctx.measureText('sweet spot').width <= x1 - x0 + 1.6 * u && py(bestRate) < floor - 2 * u) {
          // Starts under the note when they share a corner
          const bandTop = x0 < noteLeft + noteW && x1 > noteLeft ? chartTop + 3.4 * u : chartTop
          ctx.fillStyle = mix(bg, accent, 0.14)
          ctx.fillRect(x0, bandTop, x1 - x0, floor - bandTop)
          ctx.fillStyle = soft
          ctx.textAlign = 'center'
          ctx.fillText('sweet spot', Math.min(Math.max((x0 + x1) / 2, x + 3 * u), x + pw - 3 * u), floor - 0.6 * u)
        }
      }

      ctx.fillStyle = faint
      ctx.fillRect(x, floor, pw, Math.max(1, 0.12 * u))

      // My average, labelled on the side of the line the curve's end leaves free
      const ay = py(average)
      ctx.strokeStyle = soft
      ctx.lineWidth = Math.max(1, 0.12 * u)
      ctx.setLineDash([0.45 * u, 0.45 * u])
      ctx.beginPath()
      ctx.moveTo(x, ay)
      ctx.lineTo(x + pw, ay)
      ctx.stroke()
      ctx.setLineDash([])
      const noteOnRight = noteLeft > x
      const below = (rates[n - 1] > average || (noteOnRight && ay < chartTop + 4.6 * u)) && ay + 1.6 * u < floor
      ctx.fillStyle = soft
      ctx.font = font(500, 1.2 * u)
      ctx.textAlign = 'right'
      ctx.fillText(`average ${Math.round(average * 100)}%`, x + pw, below ? ay + 1.5 * u : ay - 0.5 * u)

      ctx.strokeStyle = accent
      ctx.lineWidth = 0.32 * u
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      rates.forEach((r, i) => (i === 0 ? ctx.moveTo(px(i), py(r)) : ctx.lineTo(px(i), py(r))))
      ctx.stroke()

      // The play the note is about
      const mark = (wornOut ?? best) - 1
      ctx.beginPath()
      ctx.arc(px(mark), py(rates[mark]), 0.6 * u, 0, TAU)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.strokeStyle = bg
      ctx.lineWidth = 0.25 * u
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.fillStyle = ink
      note.forEach(([text, weight, size], j) => {
        ctx.font = font(weight, size * u)
        ctx.fillText(text, noteLeft, chartTop + (0.9 + j * 1.55) * u)
      })

      // Play numbers along the bottom
      const ordinal = (k: number) => {
        const teen = k % 100 >= 11 && k % 100 <= 13
        return `${k}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`
      }
      ctx.fillStyle = soft
      ctx.font = font(500, 1.2 * u)
      ctx.fillText('1st play', x, chartTop + chartH)
      ctx.textAlign = 'center'
      for (const k of [10, 20]) if (k < n - 3) ctx.fillText(ordinal(k), px(k - 1), chartTop + chartH)
      ctx.textAlign = 'right'
      ctx.fillText(n === WEAR_MAX ? `${WEAR_MAX}th+` : ordinal(n), x + pw, chartTop + chartH)
    }
  }

  // ---------- Your #1, year by year (month by month for a single year) ----------
  const stripTop = chartTop + chartH + 2.4 * u
  ctx.fillStyle = faint
  ctx.fillRect(pad, stripTop - 1.6 * u, W - 2 * pad, Math.max(1, 0.1 * u))
  const periods = multiYear ? monthly(model, 'year', true) : months
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.font = font(700, 1.9 * u)
  ctx.fillText(multiYear ? 'My #1 artist, year by year' : 'My #1 artist, month by month', pad, stripTop + 0.8 * u)
  const colW = (W - 2 * pad) / periods.length
  const maxTotal = Math.max(...periods.map((p) => p.total), 1)
  periods.forEach((p, i) => {
    const x = pad + i * colW
    const top = p.slots.indexOf(Math.max(...p.slots))
    const has = p.slots[top] > 0
    ctx.fillStyle = ink
    ctx.font = font(700, 1.45 * u)
    ctx.fillText(multiYear && periods.length > 8 ? `’${String(p.year).slice(2)}` : p.label, x, stripTop + 3.8 * u)
    const bh = (p.total / maxTotal) * 2.8 * u
    ctx.fillStyle = has ? data.recordColors[top] : otherColor
    ctx.fillRect(x, stripTop + 7.2 * u - bh, colW - 0.8 * u, bh)
    ctx.fillStyle = soft
    ctx.font = font(500, 1.25 * u)
    // Names break onto a second line rather than being cut off
    const name = has ? data.tracklist[top]?.name ?? '' : '–'
    const words = name.split(' ')
    // ...when there's room above the source line
    const roomFor2 = stripTop + 10.55 * u <= H - 3.4 * u
    const lines = !roomFor2 || ctx.measureText(name).width <= colW - 0.8 * u || words.length < 2 ? [name] : [words[0], words.slice(1).join(' ')]
    lines.forEach((line, j) => ctx.fillText(clip(ctx, line, colW - 0.8 * u), x, stripTop + (9 + j * 1.55) * u))
  })
  ctx.fillStyle = soft
  ctx.font = font(500, 1.25 * u)
  ctx.textAlign = 'left'
  ctx.fillText(`Data: my ${data.source}, ${formatDate(firstDate)} – ${formatDate(lastDate)}.`, pad, H - 1.8 * u)
  ctx.textAlign = 'right'
  ctx.fillText('Made using mylisteningrecord.com', W - pad, H - 1.8 * u)
  ctx.textAlign = 'left'
  ctx.restore()
}

// ---------- Helpers ----------

function placeCallouts(
  ctx: CanvasRenderingContext2D,
  items: Callout[],
  o: {
    cx: number
    cy: number
    rClear: number
    rLabel: number
    top: number
    bottom: number
    pad: number
    W: number
    u: number
    ink: string
    soft: string
    dark: boolean
    accent: string
    disc: number
    font: (w: number, px: number) => string
  },
): { markers: [number, number][]; leaders: [number, number][][]; boxes: { x0: number; y0: number; x1: number; y1: number }[] } {
  const { u } = o
  const blockH = 10 * u
  // Four slots a side; the third starts just under the 6 am / 6 pm labels
  const tops = [o.top, o.top + 13 * u, o.cy + 2.4 * u, o.bottom - blockH]
  const slots = [true, false].flatMap((left) =>
    tops.map((top) => {
      // Room between the page edge and the circle, at the block's tightest height
      const nearest = top < o.cy && top + blockH > o.cy ? 0 : Math.min(Math.abs(top - o.cy), Math.abs(top + blockH - o.cy))
      const reach = nearest >= o.rClear ? 0 : Math.sqrt(o.rClear * o.rClear - nearest * nearest)
      const width = Math.min(26 * u, o.cx - reach - o.pad - 1.2 * u)
      const edge = left ? o.pad + width : o.W - o.pad - width
      return { left, top, width, edge }
    }),
  )

  // How wide each callout's text runs in each slot. Left-side text is left-aligned from the page edge,
  // so its leader has to stop where the text actually ends, not at the far side of the slot
  const valueFont = (c: Callout, width: number) => {
    ctx.font = o.font(750, 2.4 * u)
    return ctx.measureText(c.value).width > width ? o.font(750, 1.9 * u) : o.font(750, 2.4 * u)
  }
  const textWidth = (c: Callout, width: number) => {
    ctx.font = o.font(600, 1.45 * u)
    const label = 2.2 * u + ctx.measureText(c.label).width
    ctx.font = valueFont(c, width)
    const value = ctx.measureText(c.value).width
    ctx.font = o.font(500, 1.35 * u)
    const detail = Math.max(...wrapLines(ctx, c.detail, width).map((l) => ctx.measureText(l).width))
    return Math.min(width, Math.max(label, value, detail))
  }
  // The detail gets as many lines as fit under the value before the block ends; more are cut short
  const detailLines = (c: Callout, width: number) => {
    ctx.font = o.font(500, 1.35 * u)
    const lines = wrapLines(ctx, c.detail, width)
    return lines.length <= DETAIL_LINES ? lines : [...lines.slice(0, DETAIL_LINES - 1), clip(ctx, lines.slice(DETAIL_LINES - 1).join(' '), width)]
  }
  const fits = (c: Callout, width: number) => {
    ctx.font = o.font(600, 1.45 * u)
    if (2.2 * u + ctx.measureText(c.label).width > width) return false
    ctx.font = o.font(500, 1.35 * u)
    return wrapLines(ctx, c.detail, width).length <= DETAIL_LINES
  }
  const endOf = (c: Callout, slot: (typeof slots)[number]): [number, number] => [
    slot.left ? o.pad + textWidth(c, slot.width) + 0.8 * u : slot.edge - 0.8 * u,
    slot.top + 2.4 * u,
  ]

  // Cost of each callout in each slot: its nearest anchor's leader length, a heavy penalty for crossing the label,
  // and a lighter one for a slot too narrow for its words
  const crossesLabel = (a: [number, number], b: [number, number]) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const t = Math.max(0, Math.min(1, ((o.cx - a[0]) * dx + (o.cy - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(a[0] + t * dx - o.cx, a[1] + t * dy - o.cy) < o.rLabel + u
  }
  // Moments with the fewest possible points go first, so one pinned to a single play keeps it and a
  // moment that can stand anywhere on a day moves aside rather than landing on the same spot
  const order = items.map((_, i) => i).sort((a, b) => items[a].anchors.length - items[b].anchors.length)
  const options = order.map((i) =>
    slots.map((slot) => {
      const c = items[i]
      const end = endOf(c, slot)
      const extra = fits(c, slot.width) ? 0 : 100 * u
      return c.anchors
        .map((a) => ({ anchor: a, end, cost: Math.hypot(a[0] - end[0], a[1] - end[1]) + (crossesLabel(a, end) ? 1000 * u : 0) + extra }))
        .sort((a, b) => a.cost - b.cost)
    }),
  )
  // Two numbered dots closer than this hide each other, so a dot that would land there costs as much as crossing the label
  const minGap = 2.6 * u
  type Pick = { slot: number; anchor: [number, number]; end: [number, number]; cost: number }
  const choose = (k: number, s: number, taken: Pick[]): Pick => {
    const list = options[k][s]
    const free = list.find((o) => taken.every((t) => Math.hypot(o.anchor[0] - t.anchor[0], o.anchor[1] - t.anchor[1]) >= minGap))
    return free ? { slot: s, ...free } : { slot: s, ...list[0], cost: list[0].cost + 1000 * u }
  }
  // Try every assignment of callouts to distinct slots (at most 8P5) and keep the cheapest
  let bestTotal = Infinity
  let bestPicks: Pick[] = []
  const used = new Array(slots.length).fill(false)
  const picks: Pick[] = []
  const search = (k: number, total: number) => {
    if (total >= bestTotal) return
    if (k === order.length) {
      bestTotal = total
      bestPicks = [...picks]
      return
    }
    for (let s = 0; s < slots.length; s++) {
      if (used[s]) continue
      const p = choose(k, s, picks)
      used[s] = true
      picks.push(p)
      search(k + 1, total + p.cost)
      picks.pop()
      used[s] = false
    }
  }
  search(0, 0)
  const placed = bestPicks
    .map((p, k) => ({ c: items[order[k]], slot: slots[p.slot], anchor: p.anchor, end: p.end }))
    .sort((a, b) => Number(b.slot.left) - Number(a.slot.left) || a.slot.top - b.slot.top)

  // Leaders: faint and dashed, so they read as pointers rather than data
  const leader = (p: (typeof placed)[number]) => {
    ctx.beginPath()
    ctx.moveTo(...p.anchor)
    ctx.lineTo(...p.end)
    ctx.stroke()
  }
  ctx.save()
  ctx.lineWidth = Math.max(1, 0.1 * u)
  ctx.setLineDash([0.45 * u, 0.4 * u])
  ctx.strokeStyle = o.dark ? 'rgba(244, 241, 234, 0.4)' : 'rgba(23, 20, 29, 0.4)'
  placed.forEach(leader)
  ctx.beginPath()
  ctx.arc(o.cx, o.cy, o.disc, 0, TAU)
  ctx.clip()
  ctx.strokeStyle = 'rgba(244, 241, 234, 0.55)'
  placed.forEach(leader)
  ctx.restore()

  // Numbered dots in the label color, matched by a badge on each callout
  const badge = (x: number, y: number, n: number, r: number) => {
    ctx.fillStyle = o.accent
    ctx.strokeStyle = '#0b0a0f'
    ctx.lineWidth = 0.15 * u
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#0b0a0f'
    ctx.font = o.font(800, r * 1.15)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), x, y + r * 0.08)
  }
  placed.forEach((p, i) => badge(p.anchor[0], p.anchor[1], i + 1, 1 * u))

  placed.forEach((p, i) => {
    const x = p.slot.left ? o.pad : p.slot.edge
    badge(x + 0.85 * u, p.slot.top + 0.95 * u, i + 1, 0.85 * u)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = o.soft
    ctx.font = o.font(600, 1.45 * u)
    ctx.fillText(clip(ctx, p.c.label, p.slot.width - 2.2 * u), x + 2.2 * u, p.slot.top + 1.4 * u)
    ctx.fillStyle = o.ink
    ctx.font = valueFont(p.c, p.slot.width)
    ctx.fillText(clip(ctx, p.c.value, p.slot.width), x, p.slot.top + 4.3 * u)
    ctx.fillStyle = o.soft
    detailLines(p.c, p.slot.width).forEach((line, j) => ctx.fillText(line, x, p.slot.top + (6.3 + j * 1.8) * u))
  })
  return {
    markers: placed.map((p) => p.anchor),
    leaders: placed.map((p) => [p.anchor, p.end]),
    boxes: placed.map((p) => {
      const x0 = p.slot.left ? o.pad : p.slot.edge
      return { x0, y0: p.slot.top, x1: x0 + p.slot.width, y1: p.slot.top + blockH }
    }),
  }
}

/** The lines wrap() would draw, without drawing them */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  lines.push(line)
  return lines
}

/** The biggest of your top artists that you haven't played for four months or more */
function goneQuiet(model: RecordModel): { slot: number; ring: number } | null {
  const last = Array(SLOT_OTHER).fill(-1)
  const total = Array(SLOT_OTHER).fill(0)
  let end = 0
  for (let k = 0; k < model.count; k++) {
    end = Math.max(end, model.ring[k])
    const s = model.slot[k]
    if (s >= SLOT_OTHER) continue
    last[s] = Math.max(last[s], model.ring[k])
    total[s] += model.to[k] - model.from[k]
  }
  let pick: { slot: number; ring: number } | null = null
  for (let s = 0; s < SLOT_OTHER; s++) {
    if (last[s] >= 0 && end - last[s] >= 120 && (!pick || total[s] > total[pick.slot])) pick = { slot: s, ring: last[s] }
  }
  return pick
}

function weekHour(model: RecordModel): number[][] {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
  const row = new Uint8Array(model.days)
  for (let r = 0; r < model.days; r++) row[r] = (fromDayNumber(model.firstDay + r).getDay() + 6) % 7
  for (let k = 0; k < model.count; k++) {
    const from = model.from[k]
    const to = model.to[k]
    for (let h = Math.floor(from / 60); h <= Math.min(23, Math.floor((to - 0.001) / 60)); h++) {
      grid[row[model.ring[k]]][h] += Math.min(to, (h + 1) * 60) - Math.max(from, h * 60)
    }
  }
  return grid
}
