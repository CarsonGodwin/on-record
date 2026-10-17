import type { Play } from '../types'
import { COUNTED_PLAY_MS, dayNumber, fromDayNumber, isSkip, startDate, trackKey } from './stats'

/*
 * The more opinionated aggregations behind the visualizations: time bins,
 * eras, the artist race, sessions, the artist graph and the listener profile.
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
  const candidates = new Set<string>()
  for (const bin of totals) {
    for (const [artist, ms] of bin) running.set(artist, (running.get(artist) ?? 0) + ms)
    for (const [artist] of topEntries(running, topN)) candidates.add(artist)
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
    return { label: d.label, hours: d.hours, artist: top?.[0] ?? null, ms: top?.[1] ?? 0 }
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

// ---------- Listener profile ----------

export interface Trait {
  label: string
  /** 0–1 */
  value: number
  detail: string
}

export interface Profile {
  title: string
  traits: Trait[]
}

/** Five habits, each placed on a 0–1 scale, plus a name for the combination */
export function listenerProfile(plays: Play[], hours: HourSlot[], skipRate: number, shuffleRate: number): Profile {
  const total = sum(hours.map((h) => h.ms)) || 1
  const night = sum(hours.filter((h) => h.hour >= 21 || h.hour < 5).map((h) => h.ms)) / total

  const artistMs = new Map<string, number>()
  let musicMs = 0
  for (const p of plays) {
    if (p.kind !== 'track') continue
    musicMs += p.msPlayed
    artistMs.set(p.artist, (artistMs.get(p.artist) ?? 0) + p.msPlayed)
  }
  const top5 = sum(topEntries(artistMs, 5).map(([, ms]) => ms)) / (musicMs || 1)
  const artistsPer100h = artistMs.size / Math.max(musicMs / 3_600_000 / 100, 0.01)

  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const traits: Trait[] = [
    {
      label: 'Night owl',
      value: clamp(night / 0.5),
      detail: `${Math.round(night * 100)}% of your listening happens between 9 PM and 5 AM`,
    },
    {
      label: 'Loyalty',
      value: clamp((top5 - 0.05) / 0.55),
      detail: `Your top 5 artists are ${Math.round(top5 * 100)}% of your music`,
    },
    {
      label: 'Discovery',
      value: clamp(Math.log10(Math.max(artistsPer100h, 1)) / Math.log10(150)),
      detail: `${Math.round(artistsPer100h)} different artists per 100 hours of music`,
    },
    {
      label: 'Patience',
      value: clamp(1 - skipRate / 0.5),
      detail: `You skip ${Math.round(skipRate * 100)}% of songs`,
    },
    {
      label: 'Chaos',
      value: clamp(shuffleRate),
      detail: `Shuffle is on for ${Math.round(shuffleRate * 100)}% of songs`,
    },
  ]

  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0]).hour
  const adjective =
    traits[0].value >= 0.7 ? 'Nocturnal' : peak < 12 && peak >= 5 ? 'Early-Rising' : peak < 17 && peak >= 12 ? 'Sunlit' : 'Twilight'

  const nouns: [string, number][] = [
    ['Loyalist', traits[1].value],
    ['Explorer', traits[2].value],
    ['Completionist', traits[3].value * 0.9],
    ['Skipper', 1 - traits[3].value],
    ['Shuffler', traits[4].value * 0.85],
    ['Purist', (1 - traits[4].value) * 0.85],
  ]
  const noun = nouns.reduce((best, n) => (n[1] > best[1] ? n : best))[0]

  return { title: `The ${adjective} ${noun}`, traits }
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
