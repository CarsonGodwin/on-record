import type { Play } from '../types'
import { startDate } from './stats'

/*
 * Who you turn into at different times of day. Everyone's most-played artist
 * tends to top every part of the day, so instead each part names the artist
 * who stands out there: the one whose share of that part's music is biggest
 * next to their share of all your music.
 *
 * Day is 6 AM to 6 PM and night the other twelve hours, everywhere the clock
 * card draws or says it: the dial's halves, the timeline and the copy.
 */

export const DAY_START = 6
export const NIGHT_START = 18

export interface Window {
  label: string
  /** How a sentence opens for this part of the day */
  when: string
  /** What to say when there's no music in it */
  empty: string
  /** Hour it starts, and the hour after it ends */
  from: number
  to: number
}

/** In timeline order: the day starts at 6 AM, so the night is one block at the end */
export const WINDOWS: readonly Window[] = [
  { label: 'Mornings', when: 'In the mornings', empty: 'No music in the mornings.', from: 6, to: 12 },
  { label: 'Afternoons', when: 'In the afternoons', empty: 'No music in the afternoons.', from: 12, to: 18 },
  { label: 'Evenings', when: 'In the evenings', empty: 'No music in the evenings.', from: 18, to: 24 },
  { label: 'Late nights', when: 'Late at night', empty: 'No music late at night.', from: 0, to: 6 },
]

/** An artist has to be at least this much of a window's music to count as standing out in it */
export const MIN_SHARE = 0.02
/** Fewer plays than this in a window and a "stands out" claim would be noise */
export const MIN_WINDOW_PLAYS = 20
/** Nor can one or two plays make an artist stand out */
export const MIN_ARTIST_PLAYS = 3
/** Below this (versus the rest of the day) the card just names the window's most-played artist */
export const MIN_LEAN = 1.25

export function isDaytime(hour: number): boolean {
  return hour >= DAY_START && hour < NIGHT_START
}

export function windowOf(hour: number): number {
  return WINDOWS.findIndex((w) => hour >= w.from && hour < w.to)
}

/** Share of listening by day and by night, from listening time per hour (0 to 23) */
export function dayNight(msByHour: readonly number[]): { day: number; night: number } {
  const total = msByHour.reduce((s, ms) => s + ms, 0)
  if (total === 0) return { day: 0, night: 0 }
  const day = msByHour.reduce((s, ms, h) => s + (isDaytime(h) ? ms : 0), 0) / total
  return { day, night: 1 - day }
}

export interface DaypartLean extends Window {
  /** Music in this window */
  ms: number
  plays: number
  artist: string | null
  /** The artist's music in this window */
  artistMs: number
  /** Their share of this window's music */
  share: number
  /**
   * Their share of this window's music over their share of the rest of the day's.
   * Infinity when they never play outside it. Ranking by this is the same as ranking
   * by share here over share of all music, since one rises with the other.
   */
  vsRest: number
  /** 'leans': the artist stands out here. 'top': they're simply the most played. 'none': no music. */
  kind: 'leans' | 'top' | 'none'
}

interface Tally {
  ms: number
  plays: number
}

/** For each part of the day, the music artist who stands out most (music only, local time) */
export function daypartLeans(plays: Play[]): DaypartLean[] {
  const per = WINDOWS.map(() => new Map<string, Tally>())
  const totals = WINDOWS.map(() => ({ ms: 0, plays: 0 }))
  const everywhere = new Map<string, number>()
  let allMs = 0
  for (const p of plays) {
    if (p.kind !== 'track' || p.msPlayed <= 0) continue
    const i = windowOf(startDate(p).getHours())
    const t = per[i].get(p.artist)
    if (t) {
      t.ms += p.msPlayed
      t.plays++
    } else per[i].set(p.artist, { ms: p.msPlayed, plays: 1 })
    totals[i].ms += p.msPlayed
    totals[i].plays++
    everywhere.set(p.artist, (everywhere.get(p.artist) ?? 0) + p.msPlayed)
    allMs += p.msPlayed
  }

  return WINDOWS.map((w, i) => {
    const { ms, plays: count } = totals[i]
    const none: DaypartLean = { ...w, ms, plays: count, artist: null, artistMs: 0, share: 0, vsRest: 0, kind: 'none' }
    if (ms === 0) return none
    const restMs = allMs - ms
    const describe = (artist: string, t: Tally, kind: DaypartLean['kind']): DaypartLean => {
      const elsewhere = (everywhere.get(artist) ?? 0) - t.ms
      const share = t.ms / ms
      const vsRest = restMs === 0 ? 1 : elsewhere === 0 ? Infinity : share / (elsewhere / restMs)
      return { ...w, ms, plays: count, artist, artistMs: t.ms, share, vsRest, kind }
    }
    const entries = [...per[i].entries()]

    if (count >= MIN_WINDOW_PLAYS && restMs > 0) {
      let best: [string, Tally] | null = null
      let bestLift = 0
      for (const entry of entries) {
        const [artist, t] = entry
        if (t.ms / ms < MIN_SHARE || t.plays < MIN_ARTIST_PLAYS) continue
        const lift = t.ms / ms / ((everywhere.get(artist) ?? 0) / allMs)
        if (!best || lift > bestLift || (lift === bestLift && (t.ms > best[1].ms || (t.ms === best[1].ms && artist < best[0])))) {
          best = entry
          bestLift = lift
        }
      }
      if (best) {
        const lean = describe(best[0], best[1], 'leans')
        if (lean.vsRest >= MIN_LEAN) return lean
      }
    }

    // Not enough to say anyone stands out: name the most played instead, and say only that
    const [artist, t] = entries.reduce((a, b) => (b[1].ms > a[1].ms || (b[1].ms === a[1].ms && b[0] < a[0]) ? b : a))
    return describe(artist, t, 'top')
  })
}

/** The window where someone stands out the most, for the card to lead with */
export function strongestLean(leans: readonly DaypartLean[]): DaypartLean | null {
  let best: DaypartLean | null = null
  for (const l of leans) {
    if (l.kind !== 'leans') continue
    if (!best || l.vsRest > best.vsRest || (l.vsRest === best.vsRest && l.artistMs > best.artistMs)) best = l
  }
  return best
}

const times = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

/** "3×", "2.4×", "12×" */
export function formatTimes(x: number): string {
  return `${times.format(x >= 10 ? Math.round(x) : Math.round(x * 10) / 10)}×`
}

/** One plain sentence about a window, true to how its artist was picked */
export function leanSentence(l: DaypartLean): string {
  if (l.kind === 'none' || !l.artist) return l.empty
  if (l.kind === 'top') return `${l.when} you play ${l.artist} most.`
  if (l.vsRest === Infinity) return `${l.when} you lean on ${l.artist}, and you never play them the rest of the day.`
  return `${l.when} you lean on ${l.artist}: ${formatTimes(l.vsRest)} more than the rest of the day.`
}
