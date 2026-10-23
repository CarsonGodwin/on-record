import { describe, expect, it } from 'vitest'
import type { Bins, RaceData } from '../../src/data/insights'
import { makeBins } from '../../src/data/insights'
import { makeRaceFilm, raceFrameMs, raceYears } from '../../src/viz/raceVideo'
import { at, play, sorted } from '../helpers'

function scene(frames: number) {
  const bins: Bins = {
    size: 'month',
    starts: Array.from({ length: frames }, (_, i) => new Date(2023, i, 1).getTime()),
    end: new Date(2023, frames, 0).getTime(),
    indexOf: () => 0,
  }
  const race: RaceData = { names: ['A', 'B'], values: new Float64Array(frames * 2), frames }
  return { bins, race, colors: new Map<string, string>(), covers: new Map() }
}

describe('raceFrameMs', () => {
  it('runs a race in about 25 seconds, whatever its length', () => {
    expect(raceFrameMs(100) * 100).toBe(25_000)
    expect(raceFrameMs(200) * 200).toBe(25_000)
  })

  it('keeps very short and very long races watchable', () => {
    expect(raceFrameMs(2)).toBe(450)
    expect(raceFrameMs(1000)).toBe(60)
  })
})

describe('makeRaceFilm', () => {
  it('plays the race at the page’s pace, plus a lead-in and a hold on the result', () => {
    for (const frames of [12, 52, 46, 160]) {
      const film = makeRaceFilm(scene(frames))
      const race = ((frames - 1) * raceFrameMs(frames)) / 1000
      // Lead-in 0.6 s, hold 3.5 s
      expect(film.duration).toBeCloseTo(race + 4.1, 6)
    }
  })
})

describe('raceYears', () => {
  it('counts a single year as that year, though its first week starts in December', () => {
    for (const year of [2024, 2025, 2026]) {
      const bins = makeBins(sorted([play(at(year, 1, 5)), play(at(year, 6, 1))]), year)
      expect(new Date(bins.starts[0]).getFullYear()).toBeLessThanOrEqual(year)
      expect(raceYears(bins)).toMatchObject({ first: year, last: year })
    }
  })

  it('spans the years of a longer history', () => {
    const bins = makeBins(sorted([play(at(2021, 3, 1)), play(at(2024, 2, 1))]), null)
    expect(raceYears(bins)).toEqual({ first: 2021, last: 2024, years: 3 })
  })
})
