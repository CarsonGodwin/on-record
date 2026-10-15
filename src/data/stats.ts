import type { Play } from '../types'

/*
 * Pure aggregation functions over Play[]. Everything time-based uses the
 * viewer's local time zone and the moment a play *started* (Spotify's
 * timestamp is when it ended, so a 40-minute podcast would otherwise land
 * in the wrong hour).
 */

/** Spotify only counts a stream after 30 seconds of listening. Plays counts use the same rule. */
export const COUNTED_PLAY_MS = 30_000

const DAY_MS = 86_400_000

export function startDate(p: Play): Date {
  return new Date(p.endTime - p.msPlayed)
}

/** Days since the epoch for a local calendar date, so consecutive days differ by exactly 1 */
export function dayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

export function fromDayNumber(n: number): Date {
  const d = new Date(n * DAY_MS)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function isSkip(p: Play): boolean {
  return p.skipped || p.reasonEnd === 'fwdbtn'
}

export function getYears(plays: Play[]): number[] {
  return [...new Set(plays.map((p) => startDate(p).getFullYear()))].sort((a, b) => a - b)
}

/** `year` of null means all time */
export function filterByYear(plays: Play[], year: number | null): Play[] {
  return year === null ? plays : plays.filter((p) => startDate(p).getFullYear() === year)
}

// ---------- Summary ----------

export interface Summary {
  totalMs: number
  musicMs: number
  podcastMs: number
  /** Plays of 30s or more */
  streams: number
  artists: number
  tracks: number
  activeDays: number
  /** Share of music plays that were skipped, 0–1 */
  skipRate: number
  /** Share of music plays with shuffle on, 0–1 */
  shuffleRate: number
  /** Share of listening time that was offline, 0–1 */
  offlineShare: number
}

export function summarize(plays: Play[]): Summary {
  let totalMs = 0
  let musicMs = 0
  let podcastMs = 0
  let offlineMs = 0
  let streams = 0
  let musicPlays = 0
  let skips = 0
  let shuffles = 0
  const artists = new Set<string>()
  const tracks = new Set<string>()
  const days = new Set<number>()

  for (const p of plays) {
    totalMs += p.msPlayed
    if (p.offline) offlineMs += p.msPlayed
    if (p.msPlayed >= COUNTED_PLAY_MS) streams++
    days.add(dayNumber(startDate(p)))

    if (p.kind === 'track') {
      musicMs += p.msPlayed
      musicPlays++
      if (isSkip(p)) skips++
      if (p.shuffle) shuffles++
      artists.add(p.artist)
      tracks.add(trackKey(p))
    } else if (p.kind === 'episode') {
      podcastMs += p.msPlayed
    }
  }

  return {
    totalMs,
    musicMs,
    podcastMs,
    streams,
    artists: artists.size,
    tracks: tracks.size,
    activeDays: days.size,
    skipRate: musicPlays ? skips / musicPlays : 0,
    shuffleRate: musicPlays ? shuffles / musicPlays : 0,
    offlineShare: totalMs ? offlineMs / totalMs : 0,
  }
}

// ---------- Rankings ----------

export type Category = 'artist' | 'track' | 'album' | 'show'
export type RankBy = 'time' | 'plays'

export interface Ranked {
  key: string
  label: string
  sublabel?: string
  ms: number
  plays: number
}

export function trackKey(p: Play): string {
  return p.uri || `${p.artist}|${p.title}`
}

export function topItems(plays: Play[], category: Category, rankBy: RankBy, limit: number): Ranked[] {
  const items = new Map<string, Ranked>()
  const wantKind = category === 'show' ? 'episode' : 'track'

  for (const p of plays) {
    if (p.kind !== wantKind) continue
    if (category === 'album' && !p.album) continue

    let key: string
    let label: string
    let sublabel: string | undefined
    if (category === 'artist' || category === 'show') {
      key = label = p.artist
    } else if (category === 'track') {
      key = trackKey(p)
      label = p.title
      sublabel = p.artist
    } else {
      key = `${p.artist}|${p.album}`
      label = p.album
      sublabel = p.artist
    }

    let item = items.get(key)
    if (!item) {
      item = { key, label, sublabel, ms: 0, plays: 0 }
      items.set(key, item)
    }
    item.ms += p.msPlayed
    if (p.msPlayed >= COUNTED_PLAY_MS) item.plays++
  }

  const metric = rankBy === 'time' ? (r: Ranked) => r.ms : (r: Ranked) => r.plays
  return [...items.values()].sort((a, b) => metric(b) - metric(a)).slice(0, limit)
}

export function platforms(plays: Play[]): Ranked[] {
  const totals = new Map<string, Ranked>()
  for (const p of plays) {
    const item = totals.get(p.platform) ?? { key: p.platform, label: p.platform, ms: 0, plays: 0 }
    item.ms += p.msPlayed
    if (p.msPlayed >= COUNTED_PLAY_MS) item.plays++
    totals.set(p.platform, item)
  }
  return [...totals.values()].sort((a, b) => b.ms - a.ms)
}

// ---------- Habits ----------

/** Listening time by [weekday][hour]. Weekday 0 is Monday. */
export function weekHourGrid(plays: Play[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const p of plays) {
    const d = startDate(p)
    grid[(d.getDay() + 6) % 7][d.getHours()] += p.msPlayed
  }
  return grid
}

// ---------- Fun stats ----------

export interface FunStats {
  longestStreak: { days: number; start: Date; end: Date } | null
  biggestDay: { date: Date; ms: number } | null
  onRepeat: { title: string; artist: string; date: Date; count: number } | null
}

export function funStats(plays: Play[]): FunStats {
  const msByDay = new Map<number, number>()
  const repeats = new Map<string, number>()
  let onRepeat: FunStats['onRepeat'] = null

  for (const p of plays) {
    const day = dayNumber(startDate(p))
    msByDay.set(day, (msByDay.get(day) ?? 0) + p.msPlayed)

    if (p.kind !== 'track' || p.msPlayed < COUNTED_PLAY_MS) continue
    const key = `${day}|${trackKey(p)}`
    const count = (repeats.get(key) ?? 0) + 1
    repeats.set(key, count)
    if (!onRepeat || count > onRepeat.count) {
      onRepeat = { title: p.title, artist: p.artist, date: fromDayNumber(day), count }
    }
  }

  let biggestDay: FunStats['biggestDay'] = null
  for (const [day, ms] of msByDay) {
    if (!biggestDay || ms > biggestDay.ms) biggestDay = { date: fromDayNumber(day), ms }
  }

  let longestStreak: FunStats['longestStreak'] = null
  const days = [...msByDay.keys()].sort((a, b) => a - b)
  let runStart = days[0]
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && days[i] !== days[i - 1] + 1) runStart = days[i]
    const length = days[i] - runStart + 1
    if (!longestStreak || length > longestStreak.days) {
      longestStreak = { days: length, start: fromDayNumber(runStart), end: fromDayNumber(days[i]) }
    }
  }

  return { longestStreak, biggestDay, onRepeat }
}

/** Artists whose first-ever counted play happened in `year` */
export function newArtistsIn(allPlays: Play[], year: number): number {
  const firstYear = new Map<string, number>()
  for (const p of allPlays) {
    // allPlays is sorted by time, so the first sighting is the earliest
    if (p.kind !== 'track' || p.msPlayed < COUNTED_PLAY_MS || firstYear.has(p.artist)) continue
    firstYear.set(p.artist, startDate(p).getFullYear())
  }
  let count = 0
  for (const y of firstYear.values()) if (y === year) count++
  return count
}
