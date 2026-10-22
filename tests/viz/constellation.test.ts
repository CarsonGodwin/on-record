import { describe, expect, it } from 'vitest'
import { nearestStar } from '../../src/viz/constellation'

describe('nearestStar', () => {
  const stars = [
    { id: 'big', x: 100, y: 100, r: 20 },
    { id: 'small', x: 160, y: 100, r: 4 },
  ]

  it('takes a star tapped dead on', () => {
    expect(nearestStar(stars, 160, 100, 0)).toBe('small')
    expect(nearestStar(stars, 100, 100, 0)).toBe('big')
  })

  it('goes by distance to the edge, so a big star wins a tap that lands nearer its rim', () => {
    // 25 from the big star's center (5 past its edge), 35 from the small one's (31 past its edge)
    expect(nearestStar(stars, 125, 100, 30)).toBe('big')
  })

  it('reaches a little past a small star', () => {
    expect(nearestStar(stars, 160, 125, 30)).toBe('small')
  })

  it('takes nothing when the tap is out of reach of every star', () => {
    expect(nearestStar(stars, 160, 140, 30)).toBeNull()
    expect(nearestStar([], 0, 0, 30)).toBeNull()
  })
})
