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
  /** Different songs with a play of 30s or more, the same rule as `streams` */
  tracks: number
  activeDays: number
  /** Share of music plays that were skipped, 0–1 */
  skipRate: number
  /** Share of music plays with shuffle on, 0–1, out of the plays that say; null when none do (Apple Music) */
  shuffleRate: number | null
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
  let shuffleKnown = 0
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
      if (p.shuffle !== null) shuffleKnown++
      if (p.shuffle) shuffles++
      artists.add(p.artist)
      if (p.msPlayed >= COUNTED_PLAY_MS) tracks.add(trackKey(p))
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
    // With no music at all there's nothing unknown about it, so that stays 0 as it always was
    shuffleRate: shuffleKnown ? shuffles / shuffleKnown : musicPlays ? null : 0,
    offlineShare: totalMs ? offlineMs / totalMs : 0,
  }
}

// ---------- Song wear-out ----------

/** How many plays of a song wearOut follows; later plays pool into the last step */
export const WEAR_MAX = 30
/** Only songs started at least this often count, so the first steps all follow the same songs */
export const WEAR_MIN_SONG_PLAYS = 8
/** A step is only drawn with at least this many plays behind it, after pooling */
const WEAR_MIN_STEP = 30

export interface WearOut {
  /** Skip rate (0–1) on the nth play of a song, from the 1st. Later steps pool their neighbours; ends where plays run thin */
  rates: number[]
  /** Skip rate over every play counted */
  average: number
  /** The play (1-based) with the lowest skip rate */
  best: number
  /** The first play after `best` where the skip rate is back up to the average, or null if it never gets there */
  wornOut: number | null
}

/**
 * How the skip rate changes the more times you've heard a song. Plays are
 * numbered across the whole history, so a year's view still knows a song was
 * on its 40th play. `allPlays` must be sorted by time, as the loader hands them over.
 */
export function wearOut(allPlays: Play[], year: number | null): WearOut {
  const totals = new Map<string, number>()
  for (const p of allPlays) if (p.kind === 'track') totals.set(trackKey(p), (totals.get(trackKey(p)) ?? 0) + 1)

  const plays = Array(WEAR_MAX).fill(0)
  const skips = Array(WEAR_MAX).fill(0)
  const heard = new Map<string, number>()
  for (const p of allPlays) {
    if (p.kind !== 'track') continue
    const key = trackKey(p)
    const n = (heard.get(key) ?? 0) + 1
    heard.set(key, n)
    if ((totals.get(key) ?? 0) < WEAR_MIN_SONG_PLAYS) continue
    if (year !== null && startDate(p).getFullYear() !== year) continue
    const step = Math.min(n, WEAR_MAX) - 1
    plays[step]++
    if (isSkip(p)) skips[step]++
  }

  // Fewer songs reach each later play, so later steps borrow from their neighbours.
  // The last step already pools every play past WEAR_MAX, so it stays on its own.
  const last = WEAR_MAX - 1
  const rates: number[] = []
  for (let i = 0; i < WEAR_MAX; i++) {
    const r = Math.floor((i + 1) / 5)
    const lo = i === last ? last : Math.max(0, i - r)
    const hi = i === last ? last : Math.min(last - 1, i + r)
    let n = 0
    let k = 0
    for (let j = lo; j <= hi; j++) {
      n += plays[j]
      k += skips[j]
    }
    // Stop at the first play number nobody reached, or once there's too little to go on
    if (plays[i] === 0 || n < WEAR_MIN_STEP) break
    rates.push(k / n)
  }

  const counted = plays.reduce((a, b) => a + b, 0)
  const average = counted ? skips.reduce((a, b) => a + b, 0) / counted : 0
  let bestIndex = 0
  rates.forEach((r, i) => {
    if (r < rates[bestIndex]) bestIndex = i
  })
  const back = rates[bestIndex] < average ? rates.findIndex((r, i) => i > bestIndex && r >= average) : -1
  return { rates, average, best: bestIndex + 1, wornOut: back === -1 ? null : back + 1 }
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
  /** The song played most within any seven days in a row, with when each of those plays started */
  topWeek: { title: string; artist: string; start: Date; end: Date; count: number; plays: Date[] } | null
}

export function funStats(plays: Play[]): FunStats {
  const msByDay = new Map<number, number>()
  const repeats = new Map<string, number>()
  let onRepeat: FunStats['onRepeat'] = null
  const songPlays = new Map<string, Play[]>()

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
    const list = songPlays.get(trackKey(p))
    if (list) list.push(p)
    else songPlays.set(trackKey(p), [p])
  }

  // Slide a seven-day window along each song's plays, in the order they started
  let topWeek: FunStats['topWeek'] = null
  for (const list of songPlays.values()) {
    if (topWeek && list.length <= topWeek.count) continue
    list.sort((a, b) => a.endTime - a.msPlayed - (b.endTime - b.msPlayed))
    const days = list.map((p) => dayNumber(startDate(p)))
    let lo = 0
    for (let hi = 0; hi < list.length; hi++) {
      while (days[hi] - days[lo] >= 7) lo++
      const count = hi - lo + 1
      if (!topWeek || count > topWeek.count) {
        const window = list.slice(lo, hi + 1)
        topWeek = { title: list[hi].title, artist: list[hi].artist, start: fromDayNumber(days[lo]), end: fromDayNumber(days[hi]), count, plays: window.map(startDate) }
      }
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

  return { longestStreak, biggestDay, onRepeat, topWeek }
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
