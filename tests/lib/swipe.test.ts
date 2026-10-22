import { describe, expect, it } from 'vitest'
import { swipeDirection } from '../../src/lib/swipe'

describe('swipeDirection', () => {
  it('reads a quick leftward swipe as the next card and a rightward one as the previous', () => {
    expect(swipeDirection(-120, 10, 200)).toBe(1)
    expect(swipeDirection(120, -10, 200)).toBe(-1)
  })

  it('ignores taps, slow drags and mostly vertical moves', () => {
    expect(swipeDirection(-20, 0, 100)).toBe(0)
    expect(swipeDirection(-200, 0, 1200)).toBe(0)
    expect(swipeDirection(-100, 90, 200)).toBe(0)
  })
})
