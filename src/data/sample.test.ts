import { describe, expect, it } from 'vitest'
import { binArtistTotals, dailyTotals, findEras, hourProfile, makeBins, raceFrames, records, sessions } from './insights'
import { loadSample } from './load'
import { filterByYear, getYears, summarize, topItems, weekHourGrid } from './stats'

/*
 * Runs the demo record through the whole pipeline and checks that the numbers
 * agree with each other. Catches regressions the unit tests' tiny inputs can't,
 * and is a template for checking any new data source (e.g. Apple Music) end to end.
 */

const { plays, skippedRows, duplicateRows } = loadSample()
const total = summarize(plays).totalMs
const sumOf = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0)

describe('sample history', () => {
  it('loads cleanly, sorted by end time', () => {
    expect(plays.length).toBeGreaterThan(10_000)
    expect(skippedRows).toBe(0)
    expect(duplicateRows).toBe(0)
    for (let i = 1; i < plays.length; i++) expect(plays[i].endTime).toBeGreaterThanOrEqual(plays[i - 1].endTime)
  })

  it('is deterministic', () => {
    expect(loadSample().plays).toEqual(plays)
  })

  it('accounts for every millisecond the same way in every aggregation', () => {
    expect(sumOf(weekHourGrid(plays).flat())).toBe(total)
    expect(sumOf(hourProfile(plays).map((h) => h.ms))).toBe(total)
    expect(sumOf([...dailyTotals(plays).values()].map((d) => d.ms))).toBe(total)
    expect(sumOf(sessions(plays).map((s) => s.ms))).toBe(total)
  })

  it('splits cleanly into years', () => {
    const years = getYears(plays)
    expect(years.length).toBeGreaterThan(1)
    expect(sumOf(years.map((y) => filterByYear(plays, y).length))).toBe(plays.length)
  })

  it('gives every chart something to show', () => {
    const totals = binArtistTotals(plays, makeBins(plays, null))
    expect(findEras(totals, 'month').length).toBeGreaterThan(0)
    expect(raceFrames(totals, 10).names.length).toBeGreaterThanOrEqual(10)
    expect(topItems(plays, 'show', 'time', 5).length).toBeGreaterThan(0)

    const r = records(plays, sessions(plays))
    expect(r.firstPlay).not.toBeNull()
    expect(r.marathon).not.toBeNull()
    expect(r.evergreen).not.toBeNull()
  })
})
