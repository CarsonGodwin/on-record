import { describe, expect, it } from 'vitest'
import { boxTouchesDisc, linkEnds, nearestStar } from '../../src/viz/constellation'

describe('boxTouchesDisc', () => {
  const box = { x0: 0, x1: 100, y0: 0, y1: 16 }

  it('catches a star under the box', () => {
    expect(boxTouchesDisc(box, { x: 50, y: 8, r: 2 }, 0)).toBe(true)
  })

  it('counts the clearance around a star', () => {
    expect(boxTouchesDisc(box, { x: 50, y: 25, r: 5 }, 0)).toBe(false)
    expect(boxTouchesDisc(box, { x: 50, y: 25, r: 5 }, 5)).toBe(true)
  })

  it('goes by the round edge, so a star just off a corner is clear', () => {
    // 7 right and 7 below the corner: inside a square of radius 8, but about 9.9 from the star's center
    expect(boxTouchesDisc(box, { x: 107, y: 23, r: 8 }, 0)).toBe(false)
  })
})

describe('linkEnds', () => {
  it('stops the gap short of each star, along the line between them', () => {
    const ends = linkEnds({ x: 0, y: 0, r: 5 }, { x: 100, y: 0, r: 10 }, 3)
    expect(ends).toEqual({ x1: 8, y1: 0, x2: 87, y2: 0 })
  })

  it('follows a diagonal', () => {
    const ends = linkEnds({ x: 0, y: 0, r: 2 }, { x: 30, y: 40, r: 2 }, 3)
    expect(ends).toEqual({ x1: 3, y1: 4, x2: 27, y2: 36 })
  })

  it('draws nothing when the stars leave no room for a line', () => {
    expect(linkEnds({ x: 0, y: 0, r: 10 }, { x: 25, y: 0, r: 10 }, 3)).toBeNull()
    expect(linkEnds({ x: 5, y: 5, r: 1 }, { x: 5, y: 5, r: 1 }, 0)).toBeNull()
  })
})

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
