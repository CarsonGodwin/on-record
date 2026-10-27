import type { Play } from '../types'
import { formatDate, formatDuration, formatHour, formatNumber, formatTime } from '../lib/format'
import { COUNTED_PLAY_MS, dayNumber, fromDayNumber, isSkip, startDate, trackKey, type FunStats, type Summary } from './stats'

/*
 * The more opinionated aggregations behind the visualizations: time bins,
 * eras, the artist race, sessions, the artist graph and the liner notes takes.
 * Like stats.ts, everything uses local time and when a play started.
 */

const DAY_MS = 86_400_000
const SESSION_GAP_MS = 20 * 60_000
/** Back-to-back plays further apart than this don't count as one leading to the other */
const TRANSITION_GAP_MS = 15 * 60_000

// ---------- Time bins ----------

export type BinSize = 'week' | 'month'

export interface Bins {
  size: BinSize
  /** Start of each bin, epoch ms */
  starts: number[]
  /** The last day in range, epoch ms */
  end: number
  /** Bin index for a start time; may be out of range */
  indexOf: (t: number) => number
}

/** Weekly bins for a single year or a short history, monthly otherwise */
export function makeBins(plays: Play[], year: number | null): Bins {
  const first = year === null ? startDate(plays[0]) : new Date(year, 0, 1)
  const last = year === null ? startDate(plays[plays.length - 1]) : new Date(year, 11, 31)
  const spanDays = (last.getTime() - first.getTime()) / DAY_MS

  if (year !== null || spanDays < 450) {
    // Weeks start on Monday
    const firstMonday = dayNumber(first) - ((first.getDay() + 6) % 7)
    const count = Math.floor((dayNumber(last) - firstMonday) / 7) + 1
    return {
      size: 'week',
      end: last.getTime(),
      starts: Array.from({ length: count }, (_, i) => fromDayNumber(firstMonday + i * 7).getTime()),
      indexOf: (t) => Math.floor((dayNumber(new Date(t)) - firstMonday) / 7),
    }
  }

  const firstMonth = first.getFullYear() * 12 + first.getMonth()
  const count = last.getFullYear() * 12 + last.getMonth() - firstMonth + 1
  return {
    size: 'month',
    end: last.getTime(),
    starts: Array.from({ length: count }, (_, i) => new Date(Math.floor((firstMonth + i) / 12), (firstMonth + i) % 12, 1).getTime()),
    indexOf: (t) => {
      const d = new Date(t)
      return d.getFullYear() * 12 + d.getMonth() - firstMonth
    },
  }
}

/** Music listening per artist in each bin. The building block for eras, the race and the river. */
export function binArtistTotals(plays: Play[], bins: Bins): Map<string, number>[] {
  const totals = bins.starts.map(() => new Map<string, number>())
  for (const p of plays) {
    if (p.kind !== 'track') continue
    const i = bins.indexOf(p.endTime - p.msPlayed)
    const bin = totals[i]
    if (!bin) continue
    bin.set(p.artist, (bin.get(p.artist) ?? 0) + p.msPlayed)
  }
  return totals
}

/** Per-bin series for a few artists, lightly smoothed so the shapes read as trends */
export function artistSeries(totals: Map<string, number>[], artists: string[], radius: number): Map<string, number[]> {
  return new Map(artists.map((a) => [a, smooth(totals.map((bin) => bin.get(a) ?? 0), radius)]))
}

export function smooth(values: number[], radius: number): number[] {
  if (radius <= 0) return values
  return values.map((_, i) => {
    let sum = 0
    let weight = 0
    for (let k = -radius; k <= radius; k++) {
      const v = values[i + k]
      if (v === undefined) continue
      const w = radius + 1 - Math.abs(k)
      sum += v * w
      weight += w
    }
    return sum / weight
  })
}

// ---------- Eras ----------

export interface Era {
  artist: string
  /** First and last bin, inclusive */
  start: number
  end: number
  ms: number
  /** Share of music time during the era, 0–1 */
  share: number
}

/**
 * Stretches where one artist led your listening. Each bin's leader is decided
 * over a small window so a single odd week doesn't break an era in two.
 */
export function findEras(totals: Map<string, number>[], size: BinSize): Era[] {
  const window = size === 'month' ? 1 : 2
  const minLength = size === 'month' ? 2 : 3
  const binMusic = totals.map((bin) => sum(bin.values()))

  const leaders = totals.map((_, i) => {
    const scores = new Map<string, number>()
    let total = 0
    for (let k = i - window; k <= i + window; k++) {
      const bin = totals[k]
      if (!bin) continue
      total += binMusic[k]
      for (const [artist, ms] of bin) scores.set(artist, (scores.get(artist) ?? 0) + ms)
    }
    let best: string | null = null
    let bestMs = 0
    for (const [artist, ms] of scores) {
      if (ms > bestMs) {
        best = artist
        bestMs = ms
      }
    }
    // A leader with a sliver of the time isn't an era
    return best && bestMs / total >= 0.08 && binMusic[i] > 0 ? best : null
  })

  const eras: Era[] = []
  let runStart = 0
  for (let i = 1; i <= leaders.length; i++) {
    if (i < leaders.length && leaders[i] === leaders[runStart]) continue
    const artist = leaders[runStart]
    if (artist && i - runStart >= minLength) {
      const previous = eras[eras.length - 1]
      // Same artist again after a short interruption: one era, not two
      if (previous && previous.artist === artist && runStart - previous.end <= minLength) {
        previous.end = i - 1
      } else {
        eras.push({ artist, start: runStart, end: i - 1, ms: 0, share: 0 })
      }
    }
    runStart = i
  }

  for (const era of eras) {
    let music = 0
    for (let k = era.start; k <= era.end; k++) {
      era.ms += totals[k].get(era.artist) ?? 0
      music += binMusic[k]
    }
    era.share = music ? era.ms / music : 0
  }

  // Keep it readable: the 12 biggest, back in time order
  return eras
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12)
    .sort((a, b) => a.start - b.start)
}

// ---------- Race ----------

export interface RaceData {
  /** Every artist that is ever in the top N */
  names: string[]
  /** Cumulative ms: values[frame * names.length + i] */
  values: Float64Array
  frames: number
}

export function raceFrames(totals: Map<string, number>[], topN: number): RaceData {
  const running = new Map<string, number>()
  // When each artist was first heard, so ties rank the same way a stable sort of `running` would
  const order = new Map<string, number>()
  const candidates = new Set<string>()
  const rank = (a: string, b: string) => running.get(b)! - running.get(a)! || order.get(a)! - order.get(b)!
  let top: string[] = []
  for (const bin of totals) {
    for (const [artist, ms] of bin) {
      if (!order.has(artist)) order.set(artist, order.size)
      running.set(artist, (running.get(artist) ?? 0) + ms)
    }
    // Totals only grow, so nobody outside the last top N can pass it without playing in this bin.
    // Ranking just those keeps a long history with thousands of artists from sorting all of them every bin.
    top = [...new Set([...top, ...bin.keys()])].sort(rank).slice(0, topN)
    for (const artist of top) candidates.add(artist)
  }

  const names = [...candidates]
  const values = new Float64Array(totals.length * names.length)
  const cumulative = new Float64Array(names.length)
  totals.forEach((bin, f) => {
    names.forEach((name, i) => {
      cumulative[i] += bin.get(name) ?? 0
      values[f * names.length + i] = cumulative[i]
    })
  })
  return { names, values, frames: totals.length }
}

// ---------- Clock ----------

export interface HourSlot {
  hour: number
  ms: number
  /** Top artist (or show) that hour */
  top: string | null
}

export function hourProfile(plays: Play[]): HourSlot[] {
  const byHour = Array.from({ length: 24 }, () => new Map<string, number>())
  const ms = new Array<number>(24).fill(0)
  for (const p of plays) {
    const h = startDate(p).getHours()
    ms[h] += p.msPlayed
    byHour[h].set(p.artist, (byHour[h].get(p.artist) ?? 0) + p.msPlayed)
  }
  return ms.map((total, hour) => ({ hour, ms: total, top: topEntries(byHour[hour], 1)[0]?.[0] ?? null }))
}

export interface Daypart {
  label: string
  hours: string
  /** Hour the part starts, and the hour after it ends */
  from: number
  to: number
  artist: string | null
  ms: number
}

const DAYPARTS = [
  { label: 'After hours', hours: '12–5 AM', from: 0, to: 5 },
  { label: 'Mornings', hours: '5 AM–12 PM', from: 5, to: 12 },
  { label: 'Afternoons', hours: '12–5 PM', from: 12, to: 17 },
  { label: 'Evenings', hours: '5 PM–12 AM', from: 17, to: 24 },
]

/** The artist you reach for at each part of the day */
export function dayparts(plays: Play[]): Daypart[] {
  const maps = DAYPARTS.map(() => new Map<string, number>())
  for (const p of plays) {
    if (p.kind !== 'track') continue
    const h = startDate(p).getHours()
    const i = DAYPARTS.findIndex((d) => h >= d.from && h < d.to)
    maps[i].set(p.artist, (maps[i].get(p.artist) ?? 0) + p.msPlayed)
  }
  return DAYPARTS.map((d, i) => {
    const [top] = topEntries(maps[i], 1)
    return { label: d.label, hours: d.hours, from: d.from, to: d.to, artist: top?.[0] ?? null, ms: top?.[1] ?? 0 }
  })
}

// ---------- Calendar ----------

export interface DayTotal {
  ms: number
  plays: number
  top: string
}

export function dailyTotals(plays: Play[]): Map<number, DayTotal> {
  const days = new Map<number, { ms: number; plays: number; artists: Map<string, number> }>()
  for (const p of plays) {
    const day = dayNumber(startDate(p))
    let d = days.get(day)
    if (!d) {
      d = { ms: 0, plays: 0, artists: new Map() }
      days.set(day, d)
    }
    d.ms += p.msPlayed
    if (p.msPlayed >= COUNTED_PLAY_MS) d.plays++
    d.artists.set(p.artist, (d.artists.get(p.artist) ?? 0) + p.msPlayed)
  }
  const out = new Map<number, DayTotal>()
  for (const [day, d] of days) out.set(day, { ms: d.ms, plays: d.plays, top: topEntries(d.artists, 1)[0][0] })
  return out
}

export interface DayDetail {
  /** Every play that started that day, in order */
  plays: Play[]
  ms: number
  /** Plays of 30s or more */
  streams: number
  skips: number
  /** Listening time by hour of day */
  hours: number[]
  artists: { name: string; ms: number; plays: number }[]
  songs: { key: string; title: string; artist: string; ms: number; plays: number }[]
  /** Artists heard for the first time ever that day */
  firstTimers: string[]
}

/** Longest a single play could plausibly run; bounds the search for plays that started on a day */
const LONGEST_PLAY_MS = DAY_MS

/**
 * What happened on one day. `plays` must be sorted by endTime (as loaded), so
 * this finds the day's plays with a binary search instead of scanning them all.
 */
export function dayDetail(plays: Play[], day: number, firstHeard: Map<string, number>): DayDetail {
  const from = fromDayNumber(day).getTime()
  const to = fromDayNumber(day + 1).getTime()
  let lo = 0
  let hi = plays.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (plays[mid].endTime < from) lo = mid + 1
    else hi = mid
  }

  const out: Play[] = []
  for (let i = lo; i < plays.length && plays[i].endTime < to + LONGEST_PLAY_MS; i++) {
    const start = plays[i].endTime - plays[i].msPlayed
    if (start >= from && start < to) out.push(plays[i])
  }
  out.sort((a, b) => a.endTime - a.msPlayed - (b.endTime - b.msPlayed))

  let ms = 0
  let streams = 0
  let skips = 0
  const hours = new Array<number>(24).fill(0)
  const artists = new Map<string, DayDetail['artists'][number]>()
  const songs = new Map<string, DayDetail['songs'][number]>()
  for (const p of out) {
    ms += p.msPlayed
    const counted = p.msPlayed >= COUNTED_PLAY_MS
    if (counted) streams++
    if (p.kind === 'track' && isSkip(p)) skips++
    hours[startDate(p).getHours()] += p.msPlayed

    const a = artists.get(p.artist) ?? { name: p.artist, ms: 0, plays: 0 }
    a.ms += p.msPlayed
    if (counted) a.plays++
    artists.set(p.artist, a)

    const key = trackKey(p)
    const s = songs.get(key) ?? { key, title: p.title, artist: p.artist, ms: 0, plays: 0 }
    s.ms += p.msPlayed
    if (counted) s.plays++
    songs.set(key, s)
  }

  const firstTimers = [...artists.keys()].filter((name) => {
    const first = firstHeard.get(name)
    return first !== undefined && first >= from && first < to
  })

  return {
    plays: out,
    ms,
    streams,
    skips,
    hours,
    artists: [...artists.values()].sort((a, b) => b.ms - a.ms),
    songs: [...songs.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms),
    firstTimers,
  }
}

// ---------- Songs: love / hate ----------

export interface SongStat {
  key: string
  title: string
  artist: string
  /** Every start, however short, since skips are short by nature */
  plays: number
  skips: number
  ms: number
}

/** The most-played songs, with how often each got skipped */
export function songStats(plays: Play[], limit: number): SongStat[] {
  const songs = new Map<string, SongStat>()
  for (const p of plays) {
    if (p.kind !== 'track') continue
    const key = trackKey(p)
    let s = songs.get(key)
    if (!s) {
      s = { key, title: p.title, artist: p.artist, plays: 0, skips: 0, ms: 0 }
      songs.set(key, s)
    }
    s.plays++
    s.ms += p.msPlayed
    if (isSkip(p)) s.skips++
  }
  return [...songs.values()]
    .filter((s) => s.plays >= 4)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit)
}

// ---------- Constellation ----------

export interface GraphNode {
  id: string
  ms: number
}

export interface GraphLink {
  source: string
  target: string
  /** Times one artist led straight into the other, either direction */
  count: number
}

/**
 * Artists linked by what you play back to back. Each artist keeps only its
 * strongest few links, which is what makes it read as a constellation, not a hairball.
 */
export function artistGraph(plays: Play[], topN: number, perNode: number): { nodes: GraphNode[]; links: GraphLink[] } {
  const ms = new Map<string, number>()
  const pairs = new Map<string, number>()
  let prev: Play | null = null

  for (const p of plays) {
    if (p.kind !== 'track') continue
    ms.set(p.artist, (ms.get(p.artist) ?? 0) + p.msPlayed)
    if (prev && prev.artist !== p.artist && p.endTime - p.msPlayed - prev.endTime < TRANSITION_GAP_MS) {
      const key = prev.artist < p.artist ? `${prev.artist}\u0000${p.artist}` : `${p.artist}\u0000${prev.artist}`
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
    prev = p
  }

  const nodes = topEntries(ms, topN).map(([id, total]) => ({ id, ms: total }))
  const inGraph = new Set(nodes.map((n) => n.id))
  const candidates: GraphLink[] = []
  for (const [key, count] of pairs) {
    const [source, target] = key.split('\u0000')
    if (count >= 2 && inGraph.has(source) && inGraph.has(target)) candidates.push({ source, target, count })
  }
  candidates.sort((a, b) => b.count - a.count)

  const kept = new Set<GraphLink>()
  for (const node of nodes) {
    candidates
      .filter((l) => l.source === node.id || l.target === node.id)
      .slice(0, perNode)
      .forEach((l) => kept.add(l))
  }
  return { nodes, links: [...kept] }
}

// ---------- Ridgelines ----------

/** When each artist was first heard (a counted play) */
export function firstListens(plays: Play[]): Map<string, number> {
  const first = new Map<string, number>()
  for (const p of plays) {
    if (p.kind === 'track' && p.msPlayed >= COUNTED_PLAY_MS && !first.has(p.artist)) first.set(p.artist, p.endTime - p.msPlayed)
  }
  return first
}

// ---------- Sessions ----------

export interface Session {
  start: number
  end: number
  ms: number
  plays: number
}

/** Runs of listening with no break longer than 20 minutes */
export function sessions(plays: Play[]): Session[] {
  const out: Session[] = []
  let current: Session | null = null
  for (const p of plays) {
    const start = p.endTime - p.msPlayed
    if (!current || start - current.end > SESSION_GAP_MS) {
      current = { start, end: p.endTime, ms: 0, plays: 0 }
      out.push(current)
    }
    current.end = Math.max(current.end, p.endTime)
    current.ms += p.msPlayed
    current.plays++
  }
  return out
}

// ---------- Records ----------

export interface Records {
  firstPlay: { title: string; artist: string; date: number } | null
  marathon: Session | null
  avgSessionMs: number
  /** Played in the most different months, out of the months with any music */
  evergreen: { title: string; artist: string; months: number; activeMonths: number } | null
  /** A former favorite you haven't touched in a while */
  forgotten: { artist: string; lastPlayed: number; ms: number } | null
}

export function records(plays: Play[], sessionList: Session[]): Records {
  const firstTrack = plays.find((p) => p.kind === 'track' && p.msPlayed >= COUNTED_PLAY_MS)
  const marathon = sessionList.reduce<Session | null>((best, s) => (!best || s.ms > best.ms ? s : best), null)
  const avgSessionMs = sessionList.length ? sum(sessionList.map((s) => s.ms)) / sessionList.length : 0

  const songMonths = new Map<string, { title: string; artist: string; months: Set<number> }>()
  const activeMonths = new Set<number>()
  const artistMs = new Map<string, number>()
  const artistLast = new Map<string, number>()
  for (const p of plays) {
    if (p.kind !== 'track') continue
    artistMs.set(p.artist, (artistMs.get(p.artist) ?? 0) + p.msPlayed)
    artistLast.set(p.artist, p.endTime)
    if (p.msPlayed < COUNTED_PLAY_MS) continue
    const d = startDate(p)
    const key = trackKey(p)
    let s = songMonths.get(key)
    if (!s) {
      s = { title: p.title, artist: p.artist, months: new Set() }
      songMonths.set(key, s)
    }
    s.months.add(d.getFullYear() * 12 + d.getMonth())
    activeMonths.add(d.getFullYear() * 12 + d.getMonth())
  }

  let evergreen: Records['evergreen'] = null
  for (const s of songMonths.values()) {
    if (!evergreen || s.months.size > evergreen.months) {
      evergreen = { title: s.title, artist: s.artist, months: s.months.size, activeMonths: activeMonths.size }
    }
  }

  // Among your top 20 artists, the biggest one you've gone quiet on for 4+ months
  let forgotten: Records['forgotten'] = null
  if (plays.length > 0) {
    const end = plays[plays.length - 1].endTime
    for (const [artist, ms] of topEntries(artistMs, 20)) {
      const last = artistLast.get(artist) ?? end
      if (end - last > 120 * DAY_MS && (!forgotten || ms > forgotten.ms)) forgotten = { artist, lastPlayed: last, ms }
    }
  }

  return {
    firstPlay: firstTrack ? { title: firstTrack.title, artist: firstTrack.artist, date: firstTrack.endTime - firstTrack.msPlayed } : null,
    marathon,
    avgSessionMs,
    evergreen,
    forgotten,
  }
}

// ---------- Liner notes headline ----------

export interface Take {
  /** The line itself, said plainly */
  text: string
  /** What it rests on, in small print */
  proof: string
  /** 0–1, how unusual it is */
  score: number
}

/**
 * The most telling things in the data, as one-liners that could only be
 * about you, most unusual first. Each candidate scores 0–1 on how far it
 * sits from the ordinary, so a contradiction or an obsession beats a total.
 */
export function takes(plays: Play[], summary: Summary, rec: Records, fun: FunStats, hours: HourSlot[], isAllTime: boolean): Take[] {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const pct = (f: number) => `${Math.round(f * 100)}%`
  const out: Take[] = []

  const artists = new Map<string, { ms: number; starts: number; skips: number }>()
  for (const p of plays) {
    if (p.kind !== 'track') continue
    let a = artists.get(p.artist)
    if (!a) {
      a = { ms: 0, starts: 0, skips: 0 }
      artists.set(p.artist, a)
    }
    a.ms += p.msPlayed
    a.starts++
    if (isSkip(p)) a.skips++
  }

  // A heavy skipper with one artist they let play out
  if (summary.skipRate >= 0.15) {
    let spared: [string, { starts: number; skips: number }] | null = null
    for (const entry of artists) {
      const [, a] = entry
      if (a.starts < 20) continue
      const rate = a.skips / a.starts
      const best = spared ? spared[1].skips / spared[1].starts : Infinity
      if (rate < best || (rate === best && a.starts > spared![1].starts)) spared = entry
    }
    // Only a contrast if they get skipped at half the usual rate or less
    if (spared && spared[1].skips / spared[1].starts <= summary.skipRate / 2) {
      const [name, a] = spared
      const rate = a.skips / a.starts
      out.push({
        text:
          a.skips === 0
            ? `Skips ${pct(summary.skipRate)} of everything. Never skipped ${name}, not once.`
            : `Skips ${pct(summary.skipRate)} of everything, but only ${pct(rate)} of ${name}.`,
        proof: `${formatNumber(a.starts)} plays of ${name}, ${formatNumber(a.skips)} skipped`,
        score: clamp((summary.skipRate - rate) / 0.35) * 0.95,
      })
    }
  }

  if (rec.evergreen && rec.evergreen.activeMonths >= 6) {
    const e = rec.evergreen
    out.push({
      text: `Played “${e.title}” in ${e.months} of the ${e.activeMonths} months you listened.`,
      proof: `${e.artist}. No song turned up in more months`,
      score: clamp((e.months / e.activeMonths - 0.35) / 0.5),
    })
  }

  if (fun.onRepeat && fun.onRepeat.count >= 6) {
    const r = fun.onRepeat
    out.push({
      text: `Played “${r.title}” ${r.count} times in one day.`,
      proof: `${r.artist}, ${formatDate(r.date)}`,
      score: clamp((r.count - 5) / 20),
    })
  }

  const total = sum(hours.map((h) => h.ms)) || 1
  const night = sum(hours.filter((h) => h.hour >= 21 || h.hour < 5).map((h) => h.ms)) / total
  const morning = sum(hours.filter((h) => h.hour >= 5 && h.hour < 10).map((h) => h.ms)) / total
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])
  if (night >= 0.3) {
    out.push({
      text: `${pct(night)} of it was played after 9 PM.`,
      proof: `Between 9 PM and 5 AM. Busiest hour: ${formatHour(peak.hour)}`,
      score: clamp((night - 0.25) / 0.35),
    })
  } else if (morning >= 0.25) {
    const early = hours.filter((h) => h.hour >= 5 && h.hour < 10).reduce((best, h) => (h.ms > best.ms ? h : best))
    out.push({
      text: `Already listening by ${formatHour(early.hour)}, most days.`,
      proof: `${pct(morning)} of your listening happens between 5 and 10 AM`,
      score: clamp((morning - 0.2) / 0.3) * 0.8,
    })
  }

  const [top] = topEntries(new Map([...artists].map(([name, a]) => [name, a.ms])), 1)
  if (top && summary.musicMs > 0) {
    const share = top[1] / summary.musicMs
    if (share >= 0.12) {
      // "One in every N" only reads true while N rounds honestly; past that, count in tens
      const often =
        share >= 0.95
          ? 'Nearly every minute'
          : share >= 0.4
            ? `${Math.round(share * 10)} of every 10 minutes`
            : `One in every ${Math.round(1 / share)} minutes`
      out.push({
        text: `${often} was ${top[0]}.`,
        proof: `${formatDuration(top[1])} of ${top[0]}, ${pct(share)} of your music`,
        score: clamp((share - 0.1) / 0.3),
      })
    } else if (share < 0.06 && summary.artists >= 300) {
      out.push({
        text: `${formatNumber(summary.artists)} artists, and not one of them more than ${pct(share) === '0%' ? '1%' : pct(share)} of it.`,
        proof: `Your top artist, ${top[0]}, is ${pct(share)} of your music`,
        score: clamp((0.07 - share) / 0.05) * 0.8,
      })
    }
  }

  if (rec.marathon && rec.marathon.ms >= 5 * 3_600_000) {
    const m = rec.marathon
    out.push({
      text: `Once listened for ${formatDuration(m.ms)} without stopping.`,
      proof: `From ${formatTime(m.start)} on ${formatDate(m.start)}, ${formatNumber(m.plays)} plays`,
      score: clamp((m.ms / 3_600_000 - 4) / 8),
    })
  }

  if (fun.longestStreak && fun.longestStreak.days >= 30) {
    const s = fun.longestStreak
    out.push({
      text: `Played music ${formatNumber(s.days)} days in a row.`,
      proof: `${formatDate(s.start)} to ${formatDate(s.end)}`,
      score: clamp((s.days - 20) / 200),
    })
  }

  if (isAllTime && rec.forgotten && rec.forgotten.ms >= 20 * 3_600_000) {
    const f = rec.forgotten
    out.push({
      text: `Spent ${formatDuration(f.ms)} with ${f.artist}. Then stopped.`,
      proof: `Nothing since ${formatDate(f.lastPlayed)}`,
      score: 0.55,
    })
  }

  // Older Apple Music plays don't record shuffle, so there may be nothing to say
  const shuffle = summary.shuffleRate
  if (shuffle !== null && (shuffle >= 0.85 || (shuffle <= 0.1 && summary.musicMs > 0))) {
    const on = shuffle >= 0.85
    out.push({
      text: on ? `Lets shuffle pick ${pct(shuffle)} of the time.` : `Shuffle? Only ${pct(shuffle)} of the time. You pick the order.`,
      proof: `Shuffle was on for ${pct(shuffle)} of songs`,
      score: 0.4,
    })
  }

  out.push({
    text: `${formatNumber(summary.totalMs / 3_600_000)} hours, ${formatNumber(summary.artists)} artists.`,
    proof: `${formatNumber(summary.streams)} plays of 30 seconds or more`,
    score: 0,
  })

  return out.sort((a, b) => b.score - a.score)
}

// ---------- Helpers ----------

function sum(values: Iterable<number>): number {
  let total = 0
  for (const v of values) total += v
  return total
}

/** The n largest entries of a map, largest first */
export function topEntries(map: Map<string, number>, n: number): [string, number][] {
  if (n === 1) {
    let best: [string, number] | null = null
    for (const entry of map) if (!best || entry[1] > best[1]) best = entry
    return best ? [best] : []
  }
  return [...map].sort((a, b) => b[1] - a[1]).slice(0, n)
}
