import type { Play } from '../types'

/*
 * Builders for tests. Times are local, like the app's own aggregations, so the
 * tests pass in any time zone (CI runs them in several).
 */

/** A local date and time; month is 1-based to keep test tables readable */
export function at(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute)
}

/** A three-minute music play that started at `start` */
export function play(start: Date, overrides: Partial<Omit<Play, 'endTime'>> = {}): Play {
  const msPlayed = overrides.msPlayed ?? 180_000
  return {
    msPlayed,
    kind: 'track',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    uri: '',
    platform: 'iOS',
    country: 'US',
    reasonStart: 'trackdone',
    reasonEnd: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    incognito: false,
    ...overrides,
    endTime: start.getTime() + msPlayed,
  }
}

/** Sorts by endTime, the order the loader hands plays to every chart */
export function sorted(plays: Play[]): Play[] {
  return [...plays].sort((a, b) => a.endTime - b.endTime)
}
