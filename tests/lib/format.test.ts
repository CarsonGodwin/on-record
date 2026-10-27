import { describe, expect, it } from 'vitest'
import { equivalents, formatHour, historyName } from '../../src/lib/format'

describe('formatHour', () => {
  it('uses a 12-hour clock', () => {
    expect(formatHour(0)).toBe('12 AM')
    expect(formatHour(9)).toBe('9 AM')
    expect(formatHour(12)).toBe('12 PM')
    expect(formatHour(21)).toBe('9 PM')
  })
})

describe('equivalents', () => {
  it('converts listening time into yardsticks', () => {
    const e = equivalents(14 * 3_600_000)
    expect(e.flights).toBeCloseTo(1)
    expect(e.days).toBeCloseTo(14 / 24)
    expect(e.marathons).toBeCloseTo(840 / 1181)
  })

  it('is zero for no listening', () => {
    expect(equivalents(0)).toEqual({ days: 0, flights: 0, marathons: 0 })
  })
})

describe('historyName', () => {
  it('names the export the data came from', () => {
    expect(historyName(['spotify'])).toBe('Spotify Extended Streaming History')
    expect(historyName(['apple'])).toBe('Apple Music listening history')
    expect(historyName(['spotify', 'apple'])).toBe('Spotify and Apple Music listening history')
    expect(historyName([])).toBe('Spotify Extended Streaming History')
  })
})
