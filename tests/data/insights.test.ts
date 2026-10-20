import { describe, expect, it } from 'vitest'
import {
  artistGraph,
  binArtistTotals,
  dailyTotals,
  dayDetail,
  dayparts,
  findEras,
  firstListens,
  hourProfile,
  makeBins,
  raceFrames,
  records,
  sessions,
  smooth,
  songStats,
  takes,
  topEntries,
  type Records,
} from '../../src/data/insights'
import { dayNumber, type FunStats, type Summary } from '../../src/data/stats'
import { at, play, sorted } from '../helpers'

const MIN = 60_000

/** Per-bin artist totals from a compact list like ['A', 'A', 'B'] (100 each) */
function binsOf(leaders: string[]): Map<string, number>[] {
  return leaders.map((artist) => new Map([[artist, 100]]))
}

describe('makeBins', () => {
  it('uses Monday-start weeks covering the whole year for a single year', () => {
    const bins = makeBins([play(at(2024, 6, 1))], 2024)
    expect(bins.size).toBe('week')
    // 2024-01-01 was a Monday; Dec 30–31 spill into a 53rd week
    expect(bins.starts[0]).toBe(at(2024, 1, 1, 0).getTime())
    expect(bins.starts).toHaveLength(53)
    expect(bins.indexOf(at(2024, 1, 7, 23).getTime())).toBe(0)
    expect(bins.indexOf(at(2024, 1, 8, 0).getTime())).toBe(1)
  })

  it('uses months for a long history', () => {
    const bins = makeBins(sorted([play(at(2021, 11, 15)), play(at(2024, 2, 3))]), null)
    expect(bins.size).toBe('month')
    expect(bins.starts).toHaveLength(2 + 12 * 2 + 2) // Nov 2021 through Feb 2024
    expect(bins.starts[0]).toBe(at(2021, 11, 1, 0).getTime())
    expect(bins.indexOf(at(2022, 1, 31).getTime())).toBe(2)
  })

  it('uses weeks for a short history', () => {
    const bins = makeBins(sorted([play(at(2024, 1, 1)), play(at(2024, 3, 1))]), null)
    expect(bins.size).toBe('week')
  })
})

describe('binArtistTotals', () => {
  it('totals music per artist per bin and ignores podcasts and out-of-range plays', () => {
    const bins = makeBins([], 2024)
    const totals = binArtistTotals(
      [
        play(at(2024, 1, 2), { artist: 'A' }),
        play(at(2024, 1, 3), { artist: 'A' }),
        play(at(2024, 1, 9), { artist: 'B' }),
        play(at(2024, 1, 2), { kind: 'episode', artist: 'Pod' }),
        play(at(2023, 6, 1), { artist: 'Old' }),
      ],
      bins,
    )
    expect(totals).toHaveLength(bins.starts.length)
    expect(totals[0]).toEqual(new Map([['A', 360_000]]))
    expect(totals[1]).toEqual(new Map([['B', 180_000]]))
  })
})

describe('smooth', () => {
  it('leaves values alone at radius 0', () => {
    const values = [1, 5, 2]
    expect(smooth(values, 0)).toBe(values)
  })

  it('takes a triangular-weighted average, renormalized at the edges', () => {
    expect(smooth([0, 3, 0], 1)).toEqual([1, 1.5, 1])
    expect(smooth([4, 4, 4, 4], 2)).toEqual([4, 4, 4, 4])
  })
})

describe('findEras', () => {
  it('finds back-to-back eras', () => {
    const eras = findEras(binsOf([...Array(6).fill('A'), ...Array(6).fill('B')]), 'week')
    expect(eras.map((e) => [e.artist, e.start, e.end, e.ms, e.share])).toEqual([
      ['A', 0, 5, 600, 1],
      ['B', 6, 11, 600, 1],
    ])
  })

  it("doesn't let one odd week split an era", () => {
    const leaders = Array(10).fill('A')
    leaders[5] = 'B'
    const eras = findEras(binsOf(leaders), 'week')
    expect(eras).toHaveLength(1)
    expect(eras[0]).toMatchObject({ artist: 'A', start: 0, end: 9 })
  })

  it('ignores runs too short to be an era', () => {
    expect(findEras(binsOf(['A', 'A']), 'week')).toEqual([])
  })

  it('needs no listening to find nothing', () => {
    expect(findEras(binsOf([]), 'month')).toEqual([])
    expect(findEras([new Map(), new Map(), new Map()], 'month')).toEqual([])
  })
})

describe('raceFrames', () => {
  it('stores cumulative totals for every artist that ever reaches the top N', () => {
    const totals = [new Map([['A', 10], ['B', 5]]), new Map([['B', 20], ['C', 1]])]
    const race = raceFrames(totals, 1)
    expect(race.names).toEqual(['A', 'B'])
    expect(race.frames).toBe(2)
    expect([...race.values]).toEqual([10, 5, 10, 25])
  })
})

describe('hourProfile', () => {
  it('returns 24 slots with the top artist per hour', () => {
    const slots = hourProfile([
      play(at(2024, 1, 1, 8), { artist: 'A' }),
      play(at(2024, 1, 2, 8), { artist: 'B', msPlayed: 600_000 }),
      play(at(2024, 1, 1, 22, 59), { artist: 'A' }),
    ])
    expect(slots).toHaveLength(24)
    expect(slots[8]).toEqual({ hour: 8, ms: 780_000, top: 'B' })
    expect(slots[22]).toEqual({ hour: 22, ms: 180_000, top: 'A' })
    expect(slots[3]).toEqual({ hour: 3, ms: 0, top: null })
  })
})

describe('dayparts', () => {
  it('picks the top music artist for each part of the day', () => {
    const parts = dayparts([
      play(at(2024, 1, 1, 2), { artist: 'Late' }),
      play(at(2024, 1, 1, 5), { artist: 'Early' }),
      play(at(2024, 1, 1, 11, 59), { artist: 'Early' }),
      play(at(2024, 1, 1, 12), { kind: 'episode', artist: 'Pod', msPlayed: 3_600_000 }),
    ])
    expect(parts.map((p) => [p.label, p.artist, p.ms])).toEqual([
      ['After hours', 'Late', 180_000],
      ['Mornings', 'Early', 360_000],
      ['Afternoons', null, 0],
      ['Evenings', null, 0],
    ])
  })
})

describe('dailyTotals', () => {
  it('totals each day by start time', () => {
    const totals = dailyTotals([
      play(at(2024, 1, 1, 23, 58), { artist: 'A' }), // ends on the 2nd
      play(at(2024, 1, 1, 9), { artist: 'B', msPlayed: 10_000 }),
      play(at(2024, 1, 2, 9), { artist: 'B' }),
    ])
    expect(totals.get(dayNumber(at(2024, 1, 1)))).toEqual({ ms: 190_000, plays: 1, top: 'A' })
    expect(totals.get(dayNumber(at(2024, 1, 2)))).toEqual({ ms: 180_000, plays: 1, top: 'B' })
  })
})

describe('dayDetail', () => {
  const plays = sorted([
    play(at(2024, 1, 1, 10), { artist: 'Old', title: 'Classic' }),
    play(at(2024, 1, 1, 23, 58), { artist: 'Old', title: 'Late' }), // started the day before
    play(at(2024, 1, 2, 9), { artist: 'New', title: 'Fresh' }),
    play(at(2024, 1, 2, 8), { artist: 'Old', title: 'Classic', skipped: true, msPlayed: 4_000 }),
    play(at(2024, 1, 2, 9, 3), { artist: 'New', title: 'Fresh' }),
    play(at(2024, 1, 3, 0, 1), { artist: 'Next' }),
  ])
  const detail = dayDetail(plays, dayNumber(at(2024, 1, 2)), firstListens(plays))

  it('finds only the plays that started that day, in start order', () => {
    expect(detail.plays.map((p) => p.title)).toEqual(['Classic', 'Fresh', 'Fresh'])
  })

  it('summarizes the day', () => {
    expect(detail.ms).toBe(4_000 + 2 * 180_000)
    expect(detail.streams).toBe(2)
    expect(detail.skips).toBe(1)
    expect(detail.hours[8]).toBe(4_000)
    expect(detail.hours[9]).toBe(360_000)
    expect(detail.artists.map((a) => a.name)).toEqual(['New', 'Old'])
    expect(detail.songs[0]).toMatchObject({ title: 'Fresh', plays: 2 })
  })

  it('names artists heard for the first time that day', () => {
    expect(detail.firstTimers).toEqual(['New'])
  })
})

describe('songStats', () => {
  it('keeps songs with at least four starts, counting skips', () => {
    const t = at(2024, 1, 1)
    const plays = [
      ...Array.from({ length: 5 }, (_, i) => play(t, { title: 'Keeper', skipped: i === 0 })),
      ...Array.from({ length: 4 }, () => play(t, { title: 'Skipped', reasonEnd: 'fwdbtn', msPlayed: 3_000 })),
      ...Array.from({ length: 3 }, () => play(t, { title: 'Rare' })),
      ...Array.from({ length: 6 }, () => play(t, { kind: 'episode', title: 'Ep' })),
    ]
    expect(songStats(plays, 10).map((s) => [s.title, s.plays, s.skips])).toEqual([
      ['Keeper', 5, 1],
      ['Skipped', 4, 4],
    ])
    expect(songStats(plays, 1)).toHaveLength(1)
  })
})

describe('artistGraph', () => {
  /** Plays artists back to back, a minute apart */
  function run(start: Date, artists: string[]) {
    return artists.map((artist, i) => play(new Date(start.getTime() + i * 4 * MIN), { artist }))
  }

  const plays = sorted([
    ...run(at(2024, 1, 1, 9), ['A', 'B', 'A', 'B', 'C']),
    ...run(at(2024, 1, 2, 9), ['A', 'C']),
    // Far apart: not a transition
    play(at(2024, 1, 3, 9), { artist: 'D' }),
    play(at(2024, 1, 3, 11), { artist: 'A' }),
    play(at(2024, 1, 3, 11, 30), { artist: 'D' }),
  ])

  it('links artists played back to back at least twice', () => {
    const { nodes, links } = artistGraph(plays, 10, 5)
    expect(nodes[0].id).toBe('A')
    // B→C and A→C happened once each, and the D plays were too far apart
    expect(links).toEqual([{ source: 'A', target: 'B', count: 3 }])
  })

  it('keeps only the strongest links per artist', () => {
    const triangle = sorted([
      ...run(at(2024, 2, 1, 9), ['A', 'B', 'A', 'B', 'A', 'B']), // A–B ×5
      ...run(at(2024, 2, 2, 9), ['A', 'C', 'A', 'C']), // A–C ×3
      ...run(at(2024, 2, 3, 9), ['B', 'C', 'B']), // B–C ×2
    ])
    expect(artistGraph(triangle, 10, 5).links).toHaveLength(3)
    // A and B both keep A–B, C keeps A–C; B–C is nobody's strongest
    const capped = artistGraph(triangle, 10, 1).links
    expect(capped.map((l) => `${l.source}–${l.target}`).sort()).toEqual(['A–B', 'A–C'])
  })

  it('only includes the top N artists', () => {
    const { nodes, links } = artistGraph(plays, 1, 5)
    expect(nodes.map((n) => n.id)).toEqual(['A'])
    expect(links).toEqual([])
  })
})

describe('firstListens', () => {
  it('records the start of the first counted music play per artist', () => {
    const first = firstListens(
      sorted([
        play(at(2024, 1, 1), { artist: 'A', msPlayed: 10_000 }),
        play(at(2024, 1, 2), { artist: 'A' }),
        play(at(2024, 1, 3), { artist: 'A' }),
        play(at(2024, 1, 1), { kind: 'episode', artist: 'Pod' }),
      ]),
    )
    expect(first).toEqual(new Map([['A', at(2024, 1, 2).getTime()]]))
  })
})

describe('sessions', () => {
  it('splits on gaps longer than 20 minutes', () => {
    const list = sessions(
      sorted([
        play(at(2024, 1, 1, 9, 0)),
        play(at(2024, 1, 1, 9, 23)), // 20 minutes after the first ended
        play(at(2024, 1, 1, 9, 47)), // 21 minutes after
      ]),
    )
    expect(list.map((s) => s.plays)).toEqual([2, 1])
    expect(list[0]).toEqual({
      start: at(2024, 1, 1, 9, 0).getTime(),
      end: at(2024, 1, 1, 9, 26).getTime(),
      ms: 360_000,
      plays: 2,
    })
  })
})

describe('records', () => {
  const plays = sorted([
    play(at(2024, 1, 1), { kind: 'episode', artist: 'Pod' }),
    play(at(2024, 1, 2), { artist: 'Gone', title: 'Then', msPlayed: 3_600_000 }),
    play(at(2024, 1, 3), { artist: 'Stays', title: 'Always' }),
    play(at(2024, 3, 3), { artist: 'Stays', title: 'Always' }),
    play(at(2024, 6, 3), { artist: 'Stays', title: 'Always' }),
  ])
  const r = records(plays, sessions(plays))

  it('finds the first song, the marathon and the evergreen', () => {
    expect(r.firstPlay).toEqual({ title: 'Then', artist: 'Gone', date: at(2024, 1, 2).getTime() })
    expect(r.marathon?.ms).toBe(3_600_000)
    expect(r.evergreen).toEqual({ title: 'Always', artist: 'Stays', months: 3, activeMonths: 3 })
  })

  it('finds a big artist gone quiet for four months', () => {
    expect(r.forgotten).toMatchObject({ artist: 'Gone', ms: 3_600_000 })
  })

  it('handles no plays', () => {
    expect(records([], [])).toEqual({ firstPlay: null, marathon: null, avgSessionMs: 0, evergreen: null, forgotten: null })
  })
})

describe('takes', () => {
  const NO_RECORDS: Records = { firstPlay: null, marathon: null, avgSessionMs: 0, evergreen: null, forgotten: null }
  const NO_FUN: FunStats = { longestStreak: null, biggestDay: null, onRepeat: null, topWeek: null }
  const summaryOf = (plays: ReturnType<typeof play>[], overrides: Partial<Summary> = {}): Summary => ({
    totalMs: plays.reduce((s, p) => s + p.msPlayed, 0),
    musicMs: plays.reduce((s, p) => s + p.msPlayed, 0),
    podcastMs: 0,
    streams: plays.length,
    artists: new Set(plays.map((p) => p.artist)).size,
    tracks: 1,
    activeDays: 1,
    skipRate: 0,
    shuffleRate: 0.5,
    offlineShare: 0,
    ...overrides,
  })
  const run = (plays: ReturnType<typeof play>[], overrides: Partial<Summary> = {}, rec = NO_RECORDS, isAllTime = true) =>
    takes(plays, summaryOf(plays, overrides), rec, NO_FUN, hourProfile(plays), isAllTime)
  /** `a` plays of A and `b` plays of other artists, one each, all at noon so no time-of-day take fires */
  const split = (a: number, b: number) => [
    ...Array.from({ length: a }, (_, i) => play(at(2024, 1, 1 + (i % 28)), { artist: 'A' })),
    ...Array.from({ length: b }, (_, i) => play(at(2024, 2, 1 + (i % 28)), { artist: `B${i}` })),
  ]

  it('sorts by score and always ends on the totals', () => {
    const out = run(split(9, 1))
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score)
    expect(out[out.length - 1]).toMatchObject({ score: 0, text: expect.stringMatching(/hours, 2 artists\.$/) })
  })

  it('words the top artist share so it stays true at any size', () => {
    const line = (a: number, b: number) => run(split(a, b)).find((t) => t.text.endsWith('was A.'))?.text
    expect(line(2, 6)).toBe('One in every 4 minutes was A.')
    expect(line(5, 5)).toBe('5 of every 10 minutes was A.')
    expect(line(9, 1)).toBe('9 of every 10 minutes was A.')
    expect(line(97, 3)).toBe('Nearly every minute was A.')
    expect(line(1, 19)).toBeUndefined()
  })

  it('contrasts a heavy skipper with the artist they never skip', () => {
    const plays = [
      ...Array.from({ length: 20 }, (_, i) => play(at(2024, 1, 1 + i), { artist: 'Loyal' })),
      ...Array.from({ length: 40 }, (_, i) => play(at(2024, 2, 1 + (i % 28)), { artist: 'Other', skipped: i % 2 === 0 })),
    ]
    expect(run(plays, { skipRate: 0.4 }).map((t) => t.text)).toContain('Skips 40% of everything. Never skipped Loyal, not once.')
    expect(run(plays, { skipRate: 0.1 }).some((t) => t.text.startsWith('Skips'))).toBe(false)
  })

  it('calls out late nights', () => {
    const plays = Array.from({ length: 10 }, (_, i) => play(at(2024, 1, 1 + i, 23)))
    expect(run(plays).map((t) => t.text)).toContain('100% of it was played after 9 PM.')
  })

  it('only mentions a dropped artist across all time', () => {
    const rec: Records = { ...NO_RECORDS, forgotten: { artist: 'Gone', lastPlayed: at(2022, 5, 1).getTime(), ms: 30 * 3_600_000 } }
    const plays = split(1, 1)
    expect(run(plays, {}, rec, true).some((t) => t.text.includes('with Gone. Then stopped.'))).toBe(true)
    expect(run(plays, {}, rec, false).some((t) => t.text.includes('Gone'))).toBe(false)
  })

  it('mentions shuffle only at the extremes', () => {
    const plays = split(1, 1)
    expect(run(plays, { shuffleRate: 0.5 }).some((t) => /shuffle/i.test(t.text))).toBe(false)
    expect(run(plays, { shuffleRate: 0.9 }).map((t) => t.text)).toContain('Lets shuffle pick 90% of the time.')
    expect(run(plays, { shuffleRate: 0.05 }).map((t) => t.text)).toContain('Shuffle? Only 5% of the time. You pick the order.')
  })
})

describe('topEntries', () => {
  const map = new Map([['a', 1], ['b', 3], ['c', 2]])

  it('returns the largest entries, largest first', () => {
    expect(topEntries(map, 2)).toEqual([['b', 3], ['c', 2]])
    expect(topEntries(map, 1)).toEqual([['b', 3]])
  })

  it('handles an empty map', () => {
    expect(topEntries(new Map(), 1)).toEqual([])
    expect(topEntries(new Map(), 3)).toEqual([])
  })
})
