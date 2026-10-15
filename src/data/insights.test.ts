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
  listenerProfile,
  makeBins,
  raceFrames,
  records,
  sessions,
  smooth,
  songStats,
  topEntries,
} from './insights'
import { dayNumber } from './stats'
import { at, play, sorted } from './testing'

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
    expect(r.evergreen).toEqual({ title: 'Always', artist: 'Stays', months: 3 })
  })

  it('finds a big artist gone quiet for four months', () => {
    expect(r.forgotten).toMatchObject({ artist: 'Gone', ms: 3_600_000 })
  })

  it('handles no plays', () => {
    expect(records([], [])).toEqual({ firstPlay: null, marathon: null, avgSessionMs: 0, evergreen: null, forgotten: null })
  })
})

describe('listenerProfile', () => {
  it('keeps every trait on a 0–1 scale and names the listener', () => {
    const plays = Array.from({ length: 20 }, (_, i) => play(at(2024, 1, 1 + i, 23), { artist: 'Only' }))
    const profile = listenerProfile(plays, hourProfile(plays), 0, 1)
    for (const t of profile.traits) {
      expect(t.value).toBeGreaterThanOrEqual(0)
      expect(t.value).toBeLessThanOrEqual(1)
    }
    const value = (label: string) => profile.traits.find((t) => t.label === label)?.value
    expect(value('Night owl')).toBe(1)
    expect(value('Loyalty')).toBe(1)
    expect(value('Chaos')).toBe(1)
    expect(profile.title).toMatch(/^The Nocturnal /)
  })

  it('names a daytime listener by their peak hour', () => {
    const plays = [play(at(2024, 1, 1, 8))]
    expect(listenerProfile(plays, hourProfile(plays), 0.1, 0.1).title).toMatch(/^The Early-Rising /)
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
