import { describe, expect, it } from 'vitest'
import { matches } from '../../src/lib/search'

describe('matches', () => {
  it('matches everything for an empty query', () => {
    expect(matches('', 'Anything')).toBe(true)
    expect(matches('   ', 'Anything')).toBe(true)
  })

  it('ignores case and accents', () => {
    expect(matches('beyonce', 'Beyoncé')).toBe(true)
    expect(matches('SIGUR', 'Sigur Rós')).toBe(true)
  })

  it('needs every word, in any order and anywhere', () => {
    expect(matches('rós sigur', 'Sigur Rós')).toBe(true)
    expect(matches('sigur xx', 'Sigur Rós')).toBe(false)
  })

  it('matches the start of a later word', () => {
    expect(matches('clock', 'B1 Around the Clock')).toBe(true)
  })

  it('doesn’t match the middle of a word', () => {
    // "Hide all matches" for "bina" must not sweep these up along with the Binaural artists
    expect(matches('bina', 'Robina')).toBe(false)
    expect(matches('bina', 'Ian Urbina')).toBe(false)
    expect(matches('bina', 'Orbinaural')).toBe(false)
    expect(matches('bina', 'Healing Sines Binaural')).toBe(true)
  })

  it('splits words at punctuation too', () => {
    expect(matches('dillard', 'Binary & Dillard')).toBe(true)
    expect(matches('love', 'Love/Hate')).toBe(true)
    expect(matches('hate', 'Love / Hate')).toBe(true)
  })
})
