import { describe, expect, it } from 'vitest'
import {
  dayNumber,
  filterByYear,
  filterPlays,
  fromDayNumber,
  funStats,
  getYears,
  isSkip,
  newArtistsIn,
  platforms,
  sameFilter,
  startDate,
  summarize,
  topItems,
  wearOut,
  WEAR_MAX,
  WEAR_MIN_SONG_PLAYS,
  weekHourGrid,
} from '../../src/data/stats'
import { at, play, sorted } from '../helpers'

describe('startDate', () => {
  it('works back from the end time', () => {
    const p = play(at(2024, 3, 1, 9), { msPlayed: 60_000 })
    expect(startDate(p)).toEqual(at(2024, 3, 1, 9))
  })
})

describe('dayNumber / fromDayNumber', () => {
  it('numbers consecutive local days one apart, across DST changes', () => {
    // US and EU daylight saving starts on these dates
    for (const [y, m, d] of [[2024, 3, 10], [2024, 3, 31], [2024, 11, 3]]) {
      expect(dayNumber(at(y, m, d, 0, 0)) - dayNumber(at(y, m, d - 1, 23, 59))).toBe(1)
    }
  })

  it('round-trips to local midnight', () => {
    const d = at(2024, 7, 4, 18, 30)
    expect(fromDayNumber(dayNumber(d))).toEqual(at(2024, 7, 4, 0, 0))
  })
})

describe('isSkip', () => {
  it('counts the skipped flag and the forward button', () => {
    const t = at(2024, 1, 1)
    expect(isSkip(play(t, { skipped: true }))).toBe(true)
    expect(isSkip(play(t, { reasonEnd: 'fwdbtn' }))).toBe(true)
    expect(isSkip(play(t))).toBe(false)
  })
})

describe('getYears / filterByYear', () => {
  // Starts on New Year's Eve, ends on New Year's Day
  const straddler = play(at(2023, 12, 31, 23, 58), { msPlayed: 300_000 })
  const plays = sorted([play(at(2022, 5, 1)), straddler, play(at(2024, 2, 1))])

  it('lists years by when plays started, sorted and unique', () => {
    expect(getYears([...plays, ...plays])).toEqual([2022, 2023, 2024])
  })

  it('filters by start year', () => {
    expect(filterByYear(plays, 2023)).toEqual([straddler])
    expect(filterByYear(plays, null)).toBe(plays)
  })
})

describe('summarize', () => {
  it('returns zeros for no plays', () => {
    expect(summarize([])).toEqual({
      totalMs: 0,
      musicMs: 0,
      podcastMs: 0,
      streams: 0,
      artists: 0,
      tracks: 0,
      activeDays: 0,
      skipRate: 0,
      shuffleRate: 0,
      offlineShare: 0,
    })
  })

  it('counts a song only once it has a play of 30s or more, like streams', () => {
    const s = summarize([
      play(at(2024, 1, 1, 8), { title: 'Kept' }),
      play(at(2024, 1, 1, 9), { title: 'Skipped', skipped: true, msPlayed: 5_000 }),
      play(at(2024, 1, 1, 10), { title: 'Skipped', skipped: true, msPlayed: 29_999 }),
    ])
    expect(s.streams).toBe(1)
    expect(s.tracks).toBe(1)
  })

  it('splits music from podcasts and counts rates over music plays only', () => {
    const s = summarize([
      play(at(2024, 1, 1, 8), { artist: 'A', title: 'One', shuffle: true }),
      play(at(2024, 1, 1, 9), { artist: 'A', title: 'One', skipped: true, msPlayed: 5_000 }),
      play(at(2024, 1, 2, 9), { artist: 'B', title: 'Two', offline: true, msPlayed: 120_000 }),
      play(at(2024, 1, 3, 9), { kind: 'episode', artist: 'Show', msPlayed: 600_000 }),
      play(at(2024, 1, 3, 10), { kind: 'audiobook', artist: 'Book', msPlayed: 95_000 }),
    ])
    expect(s.musicMs).toBe(180_000 + 5_000 + 120_000)
    expect(s.podcastMs).toBe(600_000)
    expect(s.totalMs).toBe(s.musicMs + s.podcastMs + 95_000)
    expect(s.streams).toBe(4) // the 5-second skip doesn't count
    expect(s.artists).toBe(2)
    expect(s.tracks).toBe(2)
    expect(s.activeDays).toBe(3)
    expect(s.skipRate).toBeCloseTo(1 / 3)
    expect(s.shuffleRate).toBeCloseTo(1 / 3)
    expect(s.offlineShare).toBeCloseTo(120_000 / s.totalMs)
  })
})

describe('wearOut', () => {
  // `count` plays of one song, a day apart from Jan 1, skipping the plays whose number is in `skipped`
  const song = (uri: string, count: number, skipped: (n: number) => boolean, year = 2024) =>
    Array.from({ length: count }, (_, i) => play(at(year, 1, 1 + i), { uri, skipped: skipped(i + 1) }))

  it('numbers plays per song and pools the late ones', () => {
    // 40 songs heard 35 times: skipped on the 1st play and from the 25th on
    const plays = sorted(Array.from({ length: 40 }, (_, k) => song(`s${k}`, 35, (n) => n === 1 || n >= 25)).flat())
    const w = wearOut(plays, null)
    expect(w.rates).toHaveLength(WEAR_MAX)
    expect(w.rates[0]).toBe(1)
    expect(w.rates[1]).toBe(0)
    expect(w.rates[WEAR_MAX - 1]).toBe(1) // plays 30 to 35 pool into the last step
    expect(w.average).toBeCloseTo(12 / 35)
    expect(w.best).toBe(2)
    // Play 20 borrows from plays 16 to 24, none skipped. Play 24 borrows from 20 to 28,
    // four of them skipped: the first step back above the average
    expect(w.rates[19]).toBe(0)
    expect(w.rates[23]).toBeCloseTo(4 / 9)
    expect(w.wornOut).toBe(24)
  })

  it('leaves out songs played only a few times', () => {
    const plays = sorted([...Array.from({ length: 40 }, (_, k) => song(`s${k}`, 10, () => false)).flat(), ...song('rare', WEAR_MIN_SONG_PLAYS - 1, () => true)])
    const w = wearOut(plays, null)
    expect(w.average).toBe(0)
    expect(w.wornOut).toBeNull()
  })

  it('stops where plays run thin', () => {
    const plays = sorted(Array.from({ length: 40 }, (_, k) => song(`s${k}`, 10, () => false)).flat())
    // Plays 1 to 10 have 40 each; past that there is nothing to borrow from
    expect(wearOut(plays, null).rates).toHaveLength(10)
  })

  it('counts earlier years toward the play number, but only rates plays in the year', () => {
    // Old songs: 10 plays in 2023, then 5 skipped ones in 2024. New songs: 15 plays in 2024, none skipped
    const old = Array.from({ length: 40 }, (_, k) => [...song(`old${k}`, 10, () => false, 2023), ...song(`old${k}`, 5, () => true, 2024)])
    const fresh = Array.from({ length: 40 }, (_, k) => song(`new${k}`, 15, () => false, 2024))
    const w = wearOut(sorted([...old, ...fresh].flat()), 2024)
    expect(w.rates).toHaveLength(15)
    expect(w.rates[0]).toBe(0) // the old songs' 2024 plays are their 11th to 15th, not their first
    expect(w.rates[14]).toBe(0.5)
    expect(w.average).toBe(200 / 800)
  })
})

describe('topItems', () => {
  const t = at(2024, 1, 1)
  const plays = [
    // A: one long listen. B: three short (but counted) plays.
    play(t, { artist: 'A', title: 'Epic', album: 'Long', msPlayed: 1_200_000 }),
    play(t, { artist: 'B', title: 'Hit', album: 'Single', msPlayed: 40_000 }),
    play(t, { artist: 'B', title: 'Hit', album: 'Single', msPlayed: 40_000 }),
    play(t, { artist: 'B', title: 'Other', album: '', msPlayed: 40_000 }),
    play(t, { artist: 'C', title: 'Blip', msPlayed: 10_000 }),
    play(t, { kind: 'episode', artist: 'Pod', title: 'Ep 1', album: '', msPlayed: 3_000_000 }),
  ]

  it('ranks artists by time or by counted plays', () => {
    expect(topItems(plays, 'artist', 'time', 10).map((r) => r.key)).toEqual(['A', 'B', 'C'])
    expect(topItems(plays, 'artist', 'plays', 10).map((r) => [r.key, r.plays])).toEqual([
      ['B', 3],
      ['A', 1],
      ['C', 0],
    ])
  })

  it('groups tracks and albums under their artist', () => {
    const tracks = topItems(plays, 'track', 'plays', 1)
    expect(tracks).toEqual([{ key: 'B|Hit', label: 'Hit', sublabel: 'B', ms: 80_000, plays: 2 }])

    const albums = topItems(plays, 'album', 'time', 10)
    expect(albums.map((r) => r.key)).not.toContain('B|') // no album name, no album
  })

  it('keeps shows separate from music', () => {
    expect(topItems(plays, 'show', 'time', 10).map((r) => r.key)).toEqual(['Pod'])
    expect(topItems(plays, 'artist', 'time', 10).map((r) => r.key)).not.toContain('Pod')
  })

  it('prefers the URI as a track key', () => {
    const remaster = [
      play(t, { title: 'Song', uri: 'spotify:track:1' }),
      play(t, { title: 'Song', uri: 'spotify:track:2' }),
    ]
    expect(topItems(remaster, 'track', 'plays', 10)).toHaveLength(2)
  })
})

describe('platforms', () => {
  it('totals listening per platform, biggest first', () => {
    const t = at(2024, 1, 1)
    const result = platforms([
      play(t, { platform: 'iOS' }),
      play(t, { platform: 'macOS', msPlayed: 600_000 }),
      play(t, { platform: 'iOS', msPlayed: 1_000 }),
    ])
    expect(result.map((r) => [r.key, r.ms, r.plays])).toEqual([
      ['macOS', 600_000, 1],
      ['iOS', 181_000, 1],
    ])
  })
})

describe('weekHourGrid', () => {
  it('puts Monday first and places plays by start hour', () => {
    // 2024-01-01 was a Monday, 2024-01-07 a Sunday
    const grid = weekHourGrid([play(at(2024, 1, 1, 7, 59)), play(at(2024, 1, 7, 23, 0))])
    expect(grid).toHaveLength(7)
    expect(grid[0][7]).toBe(180_000)
    expect(grid[6][23]).toBe(180_000)
    expect(grid.flat().reduce((a, b) => a + b)).toBe(360_000)
  })
})

describe('funStats', () => {
  it('returns nulls for no plays', () => {
    expect(funStats([])).toEqual({ longestStreak: null, biggestDay: null, onRepeat: null, topWeek: null })
  })

  it('finds the longest run of days, the biggest day and the most repeated song', () => {
    const plays = sorted([
      play(at(2024, 1, 1), { title: 'Loop' }),
      play(at(2024, 1, 2)),
      play(at(2024, 1, 3)),
      // gap on the 4th
      play(at(2024, 1, 5, 9), { title: 'Loop' }),
      play(at(2024, 1, 5, 10), { title: 'Loop' }),
      play(at(2024, 1, 5, 11), { title: 'Loop' }),
      play(at(2024, 1, 5, 12), { title: 'Loop', msPlayed: 5_000 }), // too short to count
    ])
    const s = funStats(plays)
    expect(s.longestStreak).toEqual({ days: 3, start: at(2024, 1, 1, 0), end: at(2024, 1, 3, 0) })
    expect(s.biggestDay).toEqual({ date: at(2024, 1, 5, 0), ms: 3 * 180_000 + 5_000 })
    expect(s.onRepeat).toEqual({ title: 'Loop', artist: 'Artist', date: at(2024, 1, 5, 0), count: 3 })
  })

  it('finds the song played most within seven days in a row', () => {
    const plays = sorted([
      play(at(2024, 1, 1), { title: 'Week' }),
      play(at(2024, 1, 4), { title: 'Week' }),
      play(at(2024, 1, 7), { title: 'Week' }),
      play(at(2024, 1, 8), { title: 'Week' }), // eight days after the first, so a new window
      play(at(2024, 1, 9), { title: 'Week' }),
      play(at(2024, 1, 9, 13), { title: 'Week' }),
      play(at(2024, 2, 1, 9), { title: 'Day' }),
      play(at(2024, 2, 1, 10), { title: 'Day' }),
      play(at(2024, 2, 1, 11), { title: 'Day' }),
    ])
    expect(funStats(plays).topWeek).toEqual({
      title: 'Week',
      artist: 'Artist',
      start: at(2024, 1, 4, 0),
      end: at(2024, 1, 9, 0),
      count: 5,
      plays: [at(2024, 1, 4), at(2024, 1, 7), at(2024, 1, 8), at(2024, 1, 9), at(2024, 1, 9, 13)],
    })
  })
})

describe('newArtistsIn', () => {
  it('counts artists whose first counted play was that year', () => {
    const plays = sorted([
      play(at(2023, 6, 1), { artist: 'Old' }),
      play(at(2024, 2, 1), { artist: 'Old' }),
      play(at(2024, 3, 1), { artist: 'New' }),
      play(at(2023, 1, 1), { artist: 'Teaser', msPlayed: 10_000 }), // doesn't count
      play(at(2024, 4, 1), { artist: 'Teaser' }),
    ])
    expect(newArtistsIn(plays, 2024)).toBe(2)
    expect(newArtistsIn(plays, 2023)).toBe(1)
  })
})

describe('filterPlays', () => {
  const song = play(at(2024, 1, 1), { artist: 'Kept' })
  const hiddenSong = play(at(2024, 1, 2), { artist: 'Gone' })
  const episode = play(at(2024, 1, 3), { kind: 'episode', artist: 'A Show' })
  const chapter = play(at(2024, 1, 4), { kind: 'audiobook', artist: 'A Book' })
  const all = [song, hiddenSong, episode, chapter]

  it('keeps everything with no filters on', () => {
    expect(filterPlays(all, { musicOnly: false, hidden: new Set() })).toEqual(all)
  })

  it('drops podcasts and audiobooks when music only', () => {
    expect(filterPlays(all, { musicOnly: true, hidden: new Set() })).toEqual([song, hiddenSong])
  })

  it('drops the songs of hidden artists', () => {
    expect(filterPlays(all, { musicOnly: true, hidden: new Set(['Gone']) })).toEqual([song])
  })

  it('only hides music, even when a show shares the name', () => {
    const sameName = play(at(2024, 1, 5), { kind: 'episode', artist: 'Gone' })
    expect(filterPlays([hiddenSong, sameName], { musicOnly: false, hidden: new Set(['Gone']) })).toEqual([sameName])
  })
})

describe('sameFilter', () => {
  it('compares what is hidden, not which set holds it', () => {
    expect(sameFilter({ musicOnly: true, hidden: new Set(['A', 'B']) }, { musicOnly: true, hidden: new Set(['B', 'A']) })).toBe(true)
    expect(sameFilter({ musicOnly: true, hidden: new Set() }, { musicOnly: true, hidden: new Set() })).toBe(true)
  })

  it('tells filters apart', () => {
    expect(sameFilter({ musicOnly: true, hidden: new Set(['A']) }, { musicOnly: false, hidden: new Set(['A']) })).toBe(false)
    expect(sameFilter({ musicOnly: true, hidden: new Set(['A']) }, { musicOnly: true, hidden: new Set(['B']) })).toBe(false)
    expect(sameFilter({ musicOnly: true, hidden: new Set(['A']) }, { musicOnly: true, hidden: new Set(['A', 'B']) })).toBe(false)
  })
})
