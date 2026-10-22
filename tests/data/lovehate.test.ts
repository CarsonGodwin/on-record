import { describe, expect, it } from 'vitest'
import { formatSkipTime, hatedFact, loveHate, lovedFact, tallySongs, wilson } from '../../src/data/lovehate'
import type { Play } from '../../src/types'
import { at, play } from '../helpers'

/** A song started `starts` times and skipped `skips` of them, each skip after `skipMs` */
function song(title: string, starts: number, skips: number, skipMs = 5_000, overrides: Partial<Play> = {}): Play[] {
  return Array.from({ length: starts }, (_, i) =>
    play(at(2024, 1, 1 + (i % 28), 12, i % 60), {
      title,
      artist: `${title} band`,
      ...(i < skips ? { skipped: true, msPlayed: skipMs } : {}),
      ...overrides,
    }),
  )
}

/** Ten unremarkable songs with 30 starts each, so a 20-start threshold applies */
const filler = Array.from({ length: 10 }, (_, i) => song(`Filler ${i}`, 30, 10)).flat()

describe('tallySongs', () => {
  it('counts starts, skips and the median time before a skip, music only', () => {
    const plays = [
      ...song('A', 4, 0),
      play(at(2024, 1, 1), { title: 'B', artist: 'B band', skipped: true, msPlayed: 2_000 }),
      play(at(2024, 1, 2), { title: 'B', artist: 'B band', reasonEnd: 'fwdbtn', msPlayed: 4_000 }),
      play(at(2024, 1, 3), { title: 'B', artist: 'B band', skipped: true, msPlayed: 9_000 }),
      play(at(2024, 1, 4), { title: 'B', artist: 'B band' }),
      play(at(2024, 1, 5), { kind: 'episode', title: 'Ep', artist: 'Show', skipped: true }),
    ]
    const tallies = tallySongs(plays)
    expect(tallies.map((s) => [s.title, s.starts, s.skips, s.kept, s.skipMedianMs])).toEqual([
      ['A', 4, 0, 4, null],
      ['B', 4, 3, 1, 4_000],
    ])
  })
})

describe('loveHate', () => {
  it('picks the most kept of the rarely skipped, and the most skipped of the usually skipped', () => {
    const pick = loveHate([
      ...filler,
      ...song('Keeper', 100, 10), // 90 kept, 10% skipped
      ...song('Heavy', 200, 50), // 150 kept but 25% skipped: not loved
      ...song('Sure', 60, 0), // 60 kept, never skipped
      ...song('Nope', 50, 45), // 45 skips
      ...song('Meh', 120, 70), // 70 skips, 58%
      ...song('Rare', 19, 19), // under 20 starts: doesn't count
    ])
    expect(pick.minStarts).toBe(20)
    expect(pick.loved.map((s) => s.title)).toEqual(['Keeper', 'Sure'])
    expect(pick.hated.map((s) => s.title)).toEqual(['Meh', 'Nope'])
  })

  it('orders runners-up by how sure their rate is, not by a lucky small sample', () => {
    const pick = loveHate([
      ...filler,
      ...song('Hero', 300, 0),
      ...song('Habit', 250, 5),
      ...song('Fluke', 20, 0),
      ...song('Middling', 40, 6),
    ])
    expect(pick.loved.map((s) => s.title)).toEqual(['Hero', 'Habit', 'Fluke'])
  })

  it('lowers the start count for a short history', () => {
    const pick = loveHate([...song('One', 6, 0), ...song('Two', 8, 7), ...song('Three', 3, 3)])
    expect(pick.minStarts).toBe(5)
    expect(pick.loved.map((s) => s.title)).toEqual(['One'])
    expect(pick.hated.map((s) => s.title)).toEqual(['Two'])
  })

  it('leaves a side empty when no song qualifies', () => {
    const pick = loveHate([...filler, ...song('Fine', 40, 2)])
    expect(pick.hated).toEqual([])
    expect(pick.loved[0].title).toBe('Fine')
    expect(loveHate([]).loved).toEqual([])
  })

  it('never counts podcasts', () => {
    const pick = loveHate([...filler, ...song('Ep', 50, 50, 1_000, { kind: 'episode' })])
    expect(pick.hated).toEqual([])
  })
})

describe('wilson', () => {
  it('is wider for small samples', () => {
    expect(wilson(3, 3).lower).toBeLessThan(wilson(290, 300).lower)
    expect(wilson(0, 0)).toEqual({ lower: 0, upper: 1 })
    const { lower, upper } = wilson(50, 100)
    expect(lower).toBeCloseTo(0.404, 2)
    expect(upper).toBeCloseTo(0.596, 2)
  })
})

describe('facts', () => {
  it('says the plain numbers', () => {
    const [kept] = loveHate([...filler, ...song('K', 120, 3)]).loved
    expect(lovedFact(kept)).toBe('You let it play 117 of 120 times.')
    const [hated] = loveHate([...filler, ...song('H', 117, 93, 6_200)]).hated
    expect(hatedFact(hated)).toBe('Skipped 93 of 117 times, typically 6 s in.')
  })

  it('formats skip times', () => {
    expect(formatSkipTime(6_400)).toBe('6 s')
    expect(formatSkipTime(65_000)).toBe('1:05')
    expect(hatedFact({ key: 'k', title: 't', artist: 'a', starts: 10, skips: 9, kept: 1, skipMedianMs: 300 })).toBe(
      'Skipped 9 of 10 times, typically within a second.',
    )
  })
})
