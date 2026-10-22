import { describe, expect, it } from 'vitest'
import { peakBin } from '../../src/data/pulse'

describe('peakBin', () => {
  const totals = [new Map([['A', 5]]), new Map([['A', 9], ['B', 2]]), new Map([['A', 9], ['B', 7]]), new Map<string, number>()]

  it('finds the bin with the most listening', () => {
    expect(peakBin(totals, 'B')).toBe(2)
  })

  it('names the earliest of tied bins', () => {
    expect(peakBin(totals, 'A')).toBe(1)
  })

  it('is -1 for an artist with no listening in the period', () => {
    expect(peakBin(totals, 'C')).toBe(-1)
    expect(peakBin([], 'A')).toBe(-1)
  })
})
