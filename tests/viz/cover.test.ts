import { describe, expect, it } from 'vitest'
import { STOCKS, designCover, graphemes, type Mark, type Measure } from '../../src/viz/cover'

/** Roughly how wide type runs, with no fonts to measure against */
const measure: Measure = (text, voice) => graphemes(text).length * (voice === 'display' ? 0.66 : 0.46)

const NAMES = [
  'Velvet Harbor',
  'The Paper Moons',
  'Ivy & The Echoes',
  'A',
  '?',
  'BTS',
  'Björk',
  'Rachmaninoff',
  '宇多田ヒカル',
  '🎵',
  'The The',
  'Godspeed You! Black Emperor',
  'Salt on the Dial|Velvet Harbor',
  'Piano Concerto No. 2 in C Minor, Op. 18: I. Moderato|Sergei Rachmaninoff',
  '|Nobody',
  '   ',
]

function flatten(marks: Mark[]): Mark[] {
  return marks.flatMap((m) => (m.kind === 'clip' ? flatten(m.marks) : [m]))
}

function texts(name: string) {
  return flatten(designCover(name, measure).marks).filter((m) => m.kind === 'text')
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('designCover', () => {
  it('gives a name the same cover every time', () => {
    for (const name of NAMES) expect(designCover(name, measure)).toEqual(designCover(name, measure))
  })

  it('sets every name as text, with no impossible numbers', () => {
    for (const name of NAMES) {
      const marks = texts(name)
      expect(marks.length).toBeGreaterThan(0)
      for (const mark of marks) {
        expect(mark.text.length).toBeGreaterThan(0)
        expect(Number.isFinite(mark.size) && mark.size > 0).toBe(true)
        expect(Number.isFinite(mark.x) && Number.isFinite(mark.y)).toBe(true)
      }
    }
  })

  it('survives a measurement of nothing, like text in a font with no such glyphs', () => {
    for (const name of NAMES) {
      for (const mark of flatten(designCover(name, () => 0).marks)) {
        if (mark.kind === 'text') expect(Number.isFinite(mark.size)).toBe(true)
      }
    }
  })

  it('keeps every letter of the name on the cover, whatever the layout breaks it into', () => {
    // Enough names to land on each layout. The cropped layout repeats the whole name in small type.
    for (let i = 0; i < 200; i++) {
      const name = `Marlowe${i} Fox`
      const all = texts(name).map((m) => m.text).join('').replace(/\s/g, '').toUpperCase()
      for (const letter of name.replace(/\s/g, '').toUpperCase()) expect(all).toContain(letter)
    }
  })

  it('never breaks a word across rows unless the name is one word', () => {
    for (let i = 0; i < 200; i++) {
      const name = `Slow${i} Parade`
      const lines = texts(name).map((m) => m.text.toUpperCase())
      expect(lines.every((line) => /SLOW|PARADE/.test(line) || line.length <= 3)).toBe(true)
    }
  })

  it('puts the artist in small type under a title', () => {
    const marks = texts('Salt on the Dial|Velvet Harbor')
    const artist = marks.filter((m) => /Velvet Harbor/.test(m.text))
    expect(artist.length).toBe(1)
    expect(artist[0].size).toBeLessThan(10)
  })

  it('uses all the paper stocks and more than one voice across a library', () => {
    const papers = new Set<string>()
    const voices = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const design = designCover(`Artist number ${i}`, measure)
      papers.add(design.paper)
      for (const m of flatten(design.marks)) if (m.kind === 'text') voices.add(m.voice)
    }
    expect(papers.size).toBe(STOCKS.length)
    expect(voices.size).toBe(2)
  })
})

describe('designCover legibility', () => {
  const many = (make: (i: number) => string) => Array.from({ length: 300 }, (_, i) => make(i))

  /** The covers whose biggest type runs off the right edge: the giant cropped word */
  const crops = (names: string[]) =>
    names
      .map((name) => texts(name).find((m) => !m.rotate && m.size * measure(m.text, m.voice) > 100))
      .filter((m) => m !== undefined)

  it('shows the first letter of a cropped word whole', () => {
    const marks = crops(many((i) => `Mirabel${i} Castell`))
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThanOrEqual(0)
      expect(mark.x + mark.size * measure(graphemes(mark.text)[0], mark.voice)).toBeLessThanOrEqual(100)
      // Its top clears the small line above it
      expect(mark.y - mark.size * 0.7).toBeGreaterThan(0)
    }
  })

  it('never leaves a near-blank sleeve for a long single word', () => {
    for (const name of many((i) => `Rachmaninoff${i}`)) {
      const inked = texts(name).reduce((sum, m) => sum + m.size * 0.7, 0)
      expect(inked).toBeGreaterThan(25)
    }
  })

  it('takes emoji out of the art', () => {
    for (const name of ['🎵', 'Love 💔 Song', '👩🏽‍🎤|🎵', '🇺🇸 Anthem']) {
      for (const mark of texts(name)) expect(mark.text).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u)
    }
    expect(texts('🎵').some((m) => m.text === '?')).toBe(true)
    expect(texts('Love 💔 Song').map((m) => m.text).join(' ').toUpperCase()).toContain('LOVE')
  })

  it('keeps a lone narrow letter inside the top of the sleeve', () => {
    for (const name of [...many((i) => `I${'\u200d'.repeat(i % 2)}`), ...many((i) => `${'\ufe0f'.repeat(i)}?`), '🎵', 'I', '!']) {
      for (const mark of texts(name)) {
        expect(mark.rotate).toBeUndefined()
        expect(mark.y - mark.size * (mark.voice === 'serif' ? 0.8 : 0.73)).toBeGreaterThanOrEqual(-0.01)
      }
    }
  })

  it('only cuts a line of type big enough to survive it', () => {
    for (let i = 0; i < 400; i++) {
      const design = designCover(`Midnight Atlas ${i}`, measure)
      if (!design.marks.some((m) => m.kind === 'clip')) continue
      const size = Math.max(...flatten(design.marks).filter((m) => m.kind === 'text').map((m) => m.size))
      expect(size * 0.7).toBeGreaterThanOrEqual(25 * 0.99)
    }
  })

  it('never turns Chinese, Japanese or Korean on its side', () => {
    for (const name of many((i) => `東京事変${i}`)) {
      expect(texts(name).some((m) => m.rotate)).toBe(false)
    }
  })

  it('never sets the small line below a readable size', () => {
    const long = 'Piano Concerto No. 2 in C Minor, Op. 18: I. Moderato, performed at very great length'
    for (const name of many((i) => `${long} ${i}|Sergei Rachmaninoff and the Philadelphia Orchestra under Eugene Ormandy ${i}`)) {
      for (const mark of texts(name)) expect(mark.size).toBeGreaterThanOrEqual(1)
      const small = texts(name).filter((m) => m.size < 8)
      for (const mark of small) expect(mark.size).toBeGreaterThanOrEqual(5)
    }
  })

  it('leaves room over a line of accented capitals', () => {
    const gaps = (name: string) => {
      const lines = texts(name).filter((m) => !m.rotate && m.fit)
      return lines.length === 2 ? (lines[1].y - lines[0].y - lines[1].size * 0.7) / lines[1].size : null
    }
    for (let i = 0; i < 300; i++) {
      const gap = gaps(`Sigur${i} Rós`)
      if (gap !== null) expect(gap).toBeGreaterThan(0.25)
    }
  })
})

describe('STOCKS', () => {
  it('prints readable type: ink on paper, and the second ink as display type', () => {
    for (const stock of STOCKS) {
      expect(contrast(stock.paper, stock.ink)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(stock.paper, stock.alt)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('graphemes', () => {
  it('keeps accents and emoji whole', () => {
    expect(graphemes('éa')).toEqual(['é', 'a'])
    expect(graphemes('👩🏽‍🎤!')).toEqual(['👩🏽‍🎤', '!'])
  })
})
