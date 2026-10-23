import { describe, expect, it } from 'vitest'
import { eraLength, longestEra, pickEras, spreadLabels } from '../../src/data/eraTimeline'
import type { Era } from '../../src/data/insights'

const era = (artist: string, start: number, end: number, ms = 100): Era => ({ artist, start, end, ms, share: 0.2 })

describe('eraLength', () => {
  it('counts both ends', () => {
    expect(eraLength(era('A', 3, 3))).toBe(1)
    expect(eraLength(era('A', 3, 8))).toBe(6)
  })
})

describe('pickEras', () => {
  it('keeps every era when there is room', () => {
    const eras = [era('A', 0, 2), era('B', 3, 5)]
    expect(pickEras(eras, 8)).toEqual({ shown: eras, hidden: 0 })
  })

  it('leaves out the shortest and keeps time order', () => {
    const eras = [era('A', 0, 5), era('B', 6, 7), era('C', 8, 15), era('D', 16, 18)]
    const { shown, hidden } = pickEras(eras, 2)
    expect(shown.map((e) => e.artist)).toEqual(['A', 'C'])
    expect(hidden).toBe(2)
  })

  it('breaks a tie in length by listening', () => {
    const eras = [era('A', 0, 2, 50), era('B', 3, 5, 80), era('C', 6, 20)]
    expect(pickEras(eras, 2).shown.map((e) => e.artist)).toEqual(['B', 'C'])
  })
})

describe('longestEra', () => {
  it('picks the longest, the earlier on a tie', () => {
    expect(longestEra([era('A', 0, 3), era('B', 4, 7), era('C', 8, 9)])?.artist).toBe('A')
    expect(longestEra([era('A', 0, 1), era('B', 2, 9)])?.artist).toBe('B')
    expect(longestEra([])).toBeNull()
  })
})

describe('spreadLabels', () => {
  it('leaves labels that fit where they want to be', () => {
    expect(spreadLabels([0, 50, 120], 40, 4, 300)).toEqual([0, 50, 120])
  })

  it('moves a colliding pair apart around their middle', () => {
    // Both want 100: they share the push, one up and one down
    expect(spreadLabels([100, 100], 40, 0, 300)).toEqual([80, 120])
  })

  it('never overlaps and keeps the order', () => {
    const out = spreadLabels([10, 12, 14, 200, 201], 30, 4, 400)
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(34)
    expect(out[0]).toBeGreaterThanOrEqual(0)
    expect(out[out.length - 1] + 30).toBeLessThanOrEqual(400)
  })

  it('stays inside the axis at both ends', () => {
    expect(spreadLabels([-20], 40, 4, 300)).toEqual([0])
    expect(spreadLabels([290], 40, 4, 300)).toEqual([260])
    const out = spreadLabels([280, 285, 290], 40, 4, 300)
    expect(out).toEqual([172, 216, 260])
  })

  it('packs from the top when there is no room', () => {
    expect(spreadLabels([50, 50, 50], 40, 10, 100)).toEqual([0, 50, 100])
  })

  it('handles nothing', () => {
    expect(spreadLabels([], 40, 4, 300)).toEqual([])
  })
})
