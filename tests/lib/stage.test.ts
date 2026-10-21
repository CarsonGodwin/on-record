import { describe, expect, it } from 'vitest'
import { resolveStop } from '../../src/lib/stage'

const ORDER = ['intro', 'record', 'eras', 'race', 'charts', 'notes', 'poster']

describe('resolveStop', () => {
  it('finds a stop the tour has', () => {
    expect(resolveStop(['intro', 'record', 'eras'], 'eras', ORDER)).toBe(2)
  })

  it('moves on to the next stop when the shorter tour lacks it', () => {
    // A period with no music keeps only charts, notes and the poster
    expect(resolveStop(['intro', 'charts', 'notes', 'poster'], 'race', ORDER)).toBe(1)
  })

  it('falls back to the last stop when nothing comes after', () => {
    expect(resolveStop(['intro', 'record'], 'poster', ORDER)).toBe(1)
  })
})
