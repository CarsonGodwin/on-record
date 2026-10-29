import { formatNumber } from '../lib/format'
import type { Play } from '../types'
import { isSkip, trackKey } from './stats'

/*
 * Love / Hate as two songs instead of a cloud of them.
 *
 * Most loved: of the songs you skip 1 time in 5 or less, the one you let
 * play the most times. Most skipped: of the songs you skip more often than
 * not, the one with the most skips. Only songs you started often enough count
 * (20 times, or fewer for a short history), so one bad afternoon can't make
 * a song "hated".
 */

/** Start counts a song needs, tried in order: the first one enough songs reach is used */
export const MIN_STARTS = [20, 10, 5] as const
/** How many songs have to reach a start count for it to be used */
export const MIN_POOL = 10
/** A loved song is skipped at most this often */
export const LOVED_MAX_SKIP_RATE = 0.2

export interface SongTally {
  key: string
  title: string
  artist: string
  /** Every start, however short */
  starts: number
  skips: number
  /** Starts that weren't skipped */
  kept: number
  /** Median time played before a skip, or null if it was never skipped */
  skipMedianMs: number | null
}

export interface LoveHatePick {
  /** The start count a song needed to count */
  minStarts: number
  /** Most loved first, then the runners-up */
  loved: SongTally[]
  /** Most skipped first, then the runners-up */
  hated: SongTally[]
}

/**
 * Wilson score interval for a rate of `hits` in `n`: a rate that takes the
 * sample size into account, so 3 of 3 doesn't beat 290 of 300.
 */
export function wilson(hits: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 }
  const p = hits / n
  const z2 = z * z
  const center = p + z2 / (2 * n)
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  const denom = 1 + z2 / n
  return { lower: Math.max(0, (center - spread) / denom), upper: Math.min(1, (center + spread) / denom) }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Every song's starts and skips (music only) */
export function tallySongs(plays: Play[]): SongTally[] {
  const songs = new Map<string, { tally: SongTally; skipMs: number[] }>()
  for (const p of plays) {
    if (p.kind !== 'track') continue
    const key = trackKey(p)
    let s = songs.get(key)
    if (!s) {
      s = { tally: { key, title: p.title, artist: p.artist, starts: 0, skips: 0, kept: 0, skipMedianMs: null }, skipMs: [] }
      songs.set(key, s)
    }
    s.tally.starts++
    if (isSkip(p)) {
      s.tally.skips++
      s.skipMs.push(p.msPlayed)
    } else s.tally.kept++
  }
  return [...songs.values()].map(({ tally, skipMs }) => ({ ...tally, skipMedianMs: median(skipMs) }))
}

/** Picks the most loved and most skipped songs, each with up to `runnersUp` more */
export function loveHate(plays: Play[], runnersUp = 2): LoveHatePick {
  const songs = tallySongs(plays)
  const minStarts = MIN_STARTS.find((n) => songs.filter((s) => s.starts >= n).length >= MIN_POOL) ?? MIN_STARTS[MIN_STARTS.length - 1]
  const pool = songs.filter((s) => s.starts >= minStarts)
  const byName = (a: SongTally, b: SongTally) => a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist)

  const loved = pool.filter((s) => s.skips <= LOVED_MAX_SKIP_RATE * s.starts)
  const hated = pool.filter((s) => s.skips * 2 > s.starts)

  // The headliners go by the plain counts the card states
  const lovedHero = loved.reduce<SongTally | null>((b, s) => (!b || s.kept > b.kept || (s.kept === b.kept && (s.skips < b.skips || (s.skips === b.skips && byName(s, b) < 0))) ? s : b), null)
  const hatedHero = hated.reduce<SongTally | null>((b, s) => (!b || s.skips > b.skips || (s.skips === b.skips && (s.kept < b.kept || (s.kept === b.kept && byName(s, b) < 0))) ? s : b), null)

  // The runners-up go by how sure the rate is, so a song with a handful of starts can't outrank a habit
  const keptSure = (s: SongTally) => wilson(s.kept, s.starts).lower
  const skipSure = (s: SongTally) => wilson(s.skips, s.starts).lower
  const lovedRest = loved
    .filter((s) => s !== lovedHero)
    .sort((a, b) => keptSure(b) - keptSure(a) || b.kept - a.kept || byName(a, b))
    .slice(0, runnersUp)
  const hatedRest = hated
    .filter((s) => s !== hatedHero)
    .sort((a, b) => skipSure(b) - skipSure(a) || b.skips - a.skips || byName(a, b))
    .slice(0, runnersUp)

  return {
    minStarts,
    loved: lovedHero ? [lovedHero, ...lovedRest] : [],
    hated: hatedHero ? [hatedHero, ...hatedRest] : [],
  }
}

/** "6 s", "1:05" */
export function formatSkipTime(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The sentence under the most loved song */
export function lovedFact(s: SongTally): string {
  return `You let it play ${formatNumber(s.kept)} of ${formatNumber(s.starts)} times.`
}

/** The sentence under the most skipped song */
export function hatedFact(s: SongTally): string {
  const ms = s.skipMedianMs
  // A median, so "typically" rather than "usually": half the skips come sooner, half later
  const when = ms === null ? '' : ms < 1000 ? ', typically within a second' : `, typically ${formatSkipTime(ms)} in`
  return `Skipped ${formatNumber(s.skips)} of ${formatNumber(s.starts)} times${when}.`
}
