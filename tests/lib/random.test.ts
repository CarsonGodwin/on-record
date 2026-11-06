import { describe, expect, it } from 'vitest'
import { hashString, mulberry32 } from '../../src/lib/random'

describe('hashString', () => {
  it('matches the FNV-1a reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5)
    expect(hashString('a')).toBe(0xe40c292c)
    expect(hashString('foobar')).toBe(0xbf9cf968)
  })
})

describe('mulberry32', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b))
  })

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('stays within [0, 1) and spreads out', () => {
    const next = mulberry32(7)
    const values = Array.from({ length: 2000 }, next)
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
  })
})
