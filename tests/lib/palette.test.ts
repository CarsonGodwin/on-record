import { describe, expect, it } from 'vitest'
import { HEAT, OTHER, SERIES, assignColors, colorFor, heatStep, quantileThresholds } from '../../src/lib/palette'

describe('assignColors', () => {
  it('keeps an artist on their all-time color', () => {
    const colors = assignColors(['b', 'a'], ['a', 'b', 'c'])
    expect(colors.get('a')).toBe(SERIES[0])
    expect(colors.get('b')).toBe(SERIES[1])
  })

  it('gives newcomers the first colors nobody kept', () => {
    const colors = assignColors(['x', 'a', 'y'], ['a'])
    expect(colors.get('a')).toBe(SERIES[0])
    expect(colors.get('x')).toBe(SERIES[1])
    expect(colors.get('y')).toBe(SERIES[2])
  })

  it('treats an all-time rank beyond the palette as a newcomer', () => {
    const allTop = Array.from({ length: 12 }, (_, i) => `artist${i}`)
    const colors = assignColors(['artist11'], allTop)
    expect(colors.get('artist11')).toBe(SERIES[0])
  })

  it('colors at most one artist per color', () => {
    const view = Array.from({ length: 15 }, (_, i) => `artist${i}`)
    const colors = assignColors(view, view)
    expect(colors.size).toBe(SERIES.length)
    expect(new Set(colors.values()).size).toBe(SERIES.length)
  })
})

describe('colorFor', () => {
  it('falls back to the neutral color', () => {
    const colors = new Map([['a', SERIES[3]]])
    expect(colorFor(colors, 'a')).toBe(SERIES[3])
    expect(colorFor(colors, 'missing')).toBe(OTHER)
  })
})

describe('heatStep', () => {
  const thresholds = [1, 2, 3, 4, 5, 6]

  it('walks up the ramp as the value passes each threshold', () => {
    expect(heatStep(0, thresholds)).toBe(HEAT[0])
    expect(heatStep(1, thresholds)).toBe(HEAT[0])
    expect(heatStep(1.1, thresholds)).toBe(HEAT[1])
    expect(heatStep(6, thresholds)).toBe(HEAT[5])
    expect(heatStep(100, thresholds)).toBe(HEAT[6])
  })

  it('uses the dimmest step without thresholds', () => {
    expect(heatStep(5, [])).toBe(HEAT[0])
  })
})

describe('quantileThresholds', () => {
  it('has one fewer threshold than ramp steps, ascending', () => {
    const t = quantileThresholds(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(t).toHaveLength(HEAT.length - 1)
    expect([...t].sort((a, b) => a - b)).toEqual(t)
  })

  it('ignores empty days', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(quantileThresholds([0, 0, ...values, 0])).toEqual(quantileThresholds(values))
  })

  it('has none for no listening', () => {
    expect(quantileThresholds([])).toEqual([])
    expect(quantileThresholds([0, 0])).toEqual([])
  })

  it('does not mutate its input', () => {
    const values = [5, 0, 3, 9]
    quantileThresholds(values)
    expect(values).toEqual([5, 0, 3, 9])
  })
})
