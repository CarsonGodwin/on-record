import { describe, expect, it } from 'vitest'
import { isLaunchKey } from '../../src/lib/keys'

const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('isLaunchKey', () => {
  it('takes ⌘K and Ctrl K, either case', () => {
    expect(isLaunchKey(key('k', { metaKey: true }))).toBe(true)
    expect(isLaunchKey(key('K', { ctrlKey: true }))).toBe(true)
  })

  it('leaves K alone without ⌘ or Ctrl, or with another modifier', () => {
    expect(isLaunchKey(key('k'))).toBe(false)
    expect(isLaunchKey(key('k', { metaKey: true, shiftKey: true }))).toBe(false)
    expect(isLaunchKey(key('k', { ctrlKey: true, altKey: true }))).toBe(false)
    expect(isLaunchKey(key('j', { metaKey: true }))).toBe(false)
  })

  it('copes with a keydown that has no key', () => {
    expect(isLaunchKey(key(undefined as unknown as string))).toBe(false)
  })
})
