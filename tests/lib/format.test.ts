import { describe, expect, it } from 'vitest'
import { formatDays, formatHour, formatNumber, formatPlays, historyName } from '../../src/lib/format'

const DAY = 86_400_000

describe('formatPlays', () => {
  it('pluralizes the count', () => {
    expect(formatPlays(0)).toBe('0 plays')
    expect(formatPlays(1)).toBe('1 play')
    expect(formatPlays(2)).toBe('2 plays')
    expect(formatPlays(1234)).toBe(`${formatNumber(1234)} plays`)
  })
})

describe('formatDays', () => {
  it('says "less than a day" where the count would round to 0', () => {
    expect(formatDays(0)).toBe('less than a day')
    expect(formatDays(5 * 3_600_000)).toBe('less than a day')
    expect(formatDays(0.49 * DAY)).toBe('less than a day')
  })

  it('uses the singular when the count rounds to 1', () => {
    expect(formatDays(DAY)).toBe('1 day')
    expect(formatDays(1.4 * DAY)).toBe('1 day')
    expect(formatDays(0.5 * DAY)).toBe('1 day')
  })

  it('pluralizes from 2 up', () => {
    expect(formatDays(1.6 * DAY)).toBe('2 days')
    expect(formatDays(30 * DAY)).toBe(`${formatNumber(30)} days`)
    expect(formatDays(1234 * DAY)).toBe(`${formatNumber(1234)} days`)
  })
})

describe('formatHour', () => {
  it('uses a 12-hour clock', () => {
    expect(formatHour(0)).toBe('12 AM')
    expect(formatHour(9)).toBe('9 AM')
    expect(formatHour(12)).toBe('12 PM')
    expect(formatHour(21)).toBe('9 PM')
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
