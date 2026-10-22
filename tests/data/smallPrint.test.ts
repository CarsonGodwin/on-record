import { describe, expect, it } from 'vitest'
import type { Records } from '../../src/data/insights'
import { clipName, factText, NAME_MAX, smallPrint } from '../../src/data/smallPrint'
import { WEAR_MAX, type FunStats, type WearOut } from '../../src/data/stats'
import { at } from '../helpers'

const HOUR = 3_600_000

const noFun: FunStats = { longestStreak: null, biggestDay: null, onRepeat: null, topWeek: null }
const noRecords: Records = { firstPlay: null, marathon: null, avgSessionMs: 0, evergreen: null, forgotten: null }

const fun: FunStats = {
  ...noFun,
  longestStreak: { days: 77, start: at(2025, 3, 22), end: at(2025, 6, 6) },
  onRepeat: { title: 'Tides Fade', artist: 'Velvet Harbor', date: at(2024, 8, 24), count: 21 },
}
const rec: Records = {
  ...noRecords,
  firstPlay: { title: 'Neon', artist: 'Rook Avenue', date: at(2023, 1, 1).getTime() },
  evergreen: { title: 'Summer Dust', artist: 'Velvet Harbor', months: 43, activeMonths: 46 },
  forgotten: { artist: 'Juniper Vale', lastPlayed: at(2025, 5, 31).getTime(), ms: 75 * HOUR },
}
const wear: WearOut = { rates: [], average: 0.27, best: 5, wornOut: 24 }

describe('smallPrint', () => {
  it('ranks the facts, most surprising first', () => {
    const facts = smallPrint(fun, rec, wear, true)
    expect(facts.map((f) => f.key)).toEqual(['repeat', 'evergreen', 'wear', 'dropped', 'streak', 'first'])
    expect(factText(facts[0]).replace(/\u00a0/g, ' ')).toBe('Tides Fade, 21 times in one day.')
    expect(facts[0].line[0]).toEqual({ name: 'Tides Fade' })
    expect(factText(facts[1])).toBe('Summer Dust played in 43 of the 46 months you listened.')
    expect(factText(facts[2])).toBe('You tire of a song by about play 24.')
    expect(facts[2].proof).toContain('play 5')
    expect(factText(facts[3])).toBe('75 hrs of Juniper Vale, then nothing.')
    expect(factText(facts[4])).toBe('You pressed play 77 days in a row.')
  })

  it('only says an artist was dropped over all time', () => {
    expect(smallPrint(fun, rec, wear, false).some((f) => f.key === 'dropped')).toBe(false)
  })

  it('leaves out what is too small to be a surprise', () => {
    const quiet = smallPrint(
      { ...noFun, longestStreak: { days: 3, start: at(2024, 1, 1), end: at(2024, 1, 3) }, onRepeat: { title: 'A', artist: 'B', date: at(2024, 1, 1), count: 2 } },
      { ...noRecords, evergreen: { title: 'A', artist: 'B', months: 2, activeMonths: 3 }, forgotten: { artist: 'B', lastPlayed: 0, ms: HOUR } },
      { rates: [], average: 0.2, best: 1, wornOut: null },
      true,
    )
    expect(quiet).toEqual([])
  })

  it('falls back on the first play when nothing else qualifies', () => {
    const facts = smallPrint(noFun, { ...noRecords, firstPlay: rec.firstPlay }, null, false)
    expect(facts).toHaveLength(1)
    expect(factText(facts[0])).toBe('The year started with Neon.')
  })

  it('says "all" when a song played in every month', () => {
    const facts = smallPrint(noFun, { ...noRecords, evergreen: { title: 'A', artist: 'B', months: 12, activeMonths: 12 } }, null, false)
    expect(factText(facts[0])).toBe('A played in all 12 months you listened.')
  })

  it('words a wear-out past the last counted play as "after about"', () => {
    const facts = smallPrint(noFun, noRecords, { rates: [], average: 0.3, best: 1, wornOut: WEAR_MAX }, true)
    expect(factText(facts[0])).toBe(`You tire of a song after about ${WEAR_MAX} plays.`)
    expect(facts[0].proof.startsWith('Fewest skips the first time')).toBe(true)
  })

  it('only counts a long session', () => {
    const session = (ms: number): Records => ({ ...noRecords, marathon: { start: at(2024, 3, 1, 20).getTime(), end: at(2024, 3, 2, 4).getTime(), ms, plays: 90 } })
    expect(smallPrint(noFun, session(2 * HOUR), null, true)).toEqual([])
    expect(smallPrint(noFun, session(6 * HOUR), null, true)[0].key).toBe('session')
  })

  it('clips long names inside the sentence', () => {
    const long = 'A Very Long Song Title That Goes On (feat. Somebody Else) - 2011 Remaster'
    const facts = smallPrint({ ...noFun, onRepeat: { title: long, artist: 'B', date: at(2024, 1, 1), count: 9 } }, noRecords, null, true)
    const part = facts[0].line[0] as { name: string }
    expect(part.name.length).toBeLessThanOrEqual(NAME_MAX)
    expect(part.name.endsWith('…')).toBe(true)
  })
})

describe('clipName', () => {
  it('keeps short names as they are', () => {
    expect(clipName('  Neon ')).toBe('Neon')
  })

  it('cuts at a word break when that keeps most of the name', () => {
    expect(clipName('Alpha Beta Gamma Delta', 15)).toBe('Alpha Beta…')
  })

  it('cuts mid-word when the only break is too early', () => {
    expect(clipName('Supercalifragilistic', 10)).toBe('Supercali…')
  })

  it('drops dangling punctuation before the ellipsis', () => {
    expect(clipName('Song (feat. Somebody)', 7)).toBe('Song…')
  })
})
