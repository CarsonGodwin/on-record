import { describe, expect, it } from 'vitest'
import { csvReader, readCsv } from '../../src/data/csv'
import { mulberry32 } from '../../src/lib/random'

function rows<C extends string>(text: string, columns: readonly C[]) {
  const out: Record<C, string>[] = []
  const found = readCsv(text, columns, (r) => out.push(r))
  return { out, found: [...found].sort() }
}

describe('readCsv', () => {
  it('finds columns by header name, in any order', () => {
    const { out, found } = rows('b,a,c\n2,1,3\n5,4,6\n', ['a', 'c'])
    expect(out).toEqual([
      { a: '1', c: '3' },
      { a: '4', c: '6' },
    ])
    expect(found).toEqual(['a', 'c'])
  })

  it('reads a missing column as empty and reports it missing', () => {
    const { out, found } = rows('a\n1\n', ['a', 'z'])
    expect(out).toEqual([{ a: '1', z: '' }])
    expect(found).toEqual(['a'])
  })

  it('handles quoted commas, doubled quotes and line breaks', () => {
    const text = 'title,artist\n"Hello, Goodbye","The ""Fab"" Four"\n"Two\nLines",X\n'
    expect(rows(text, ['title', 'artist']).out).toEqual([
      { title: 'Hello, Goodbye', artist: 'The "Fab" Four' },
      { title: 'Two\nLines', artist: 'X' },
    ])
  })

  it('handles CRLF and lone CR line endings, and a missing final newline', () => {
    expect(rows('a,b\r\n1,2\r\n3,4', ['a', 'b']).out).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
    expect(rows('a,b\r1,2\r', ['b']).out).toEqual([{ b: '2' }])
  })

  it('matches headers whatever their case, spacing or punctuation', () => {
    const { out, found } = rows('MEDIA TYPE,song_name,\u200bArtist-Name\n1,2,3\n', ['Media Type', 'Song Name', 'Artist Name'])
    expect(out).toEqual([{ 'Media Type': '1', 'Song Name': '2', 'Artist Name': '3' }])
    expect(found).toEqual(['Artist Name', 'Media Type', 'Song Name'])
  })

  it('strips a byte order mark and trims headers and values', () => {
    expect(rows('﻿ Song Name ,x\n  Blue  ,1\n', ['Song Name']).out).toEqual([{ 'Song Name': 'Blue' }])
  })

  it('skips blank lines but keeps rows of empty fields', () => {
    expect(rows('a,b\n\n1,2\n\n,\n', ['a', 'b']).out).toEqual([
      { a: '1', b: '2' },
      { a: '', b: '' },
    ])
  })

  it('skips blank lines before the header without shifting the columns', () => {
    expect(rows('\nSong Name,Album Name\nA,B\n', ['Song Name', 'Album Name']).out).toEqual([{ 'Song Name': 'A', 'Album Name': 'B' }])
    expect(rows('\r\n\r\nSong Name,Album Name\r\nA,B\r\n', ['Song Name', 'Album Name']).out).toEqual([{ 'Song Name': 'A', 'Album Name': 'B' }])
  })

  it('copes with short rows, long rows and a trailing comma', () => {
    expect(rows('a,b,c\n1\n1,2,3,4\n1,2,', ['a', 'c']).out).toEqual([
      { a: '1', c: '' },
      { a: '1', c: '3' },
      { a: '1', c: '' },
    ])
  })

  it('is lenient about stray quotes', () => {
    expect(rows('a,b\nsay "hi",2\n"x"y,3\n"open', ['a', 'b']).out).toEqual([
      { a: 'say "hi"', b: '2' },
      { a: 'xy', b: '3' },
      { a: 'open', b: '' },
    ])
  })

  it('uses the first of two columns with the same name', () => {
    expect(rows('a,a\n1,2\n', ['a']).out).toEqual([{ a: '1' }])
  })

  it('reads nothing from an empty file or a header alone', () => {
    expect(rows('', ['a'])).toEqual({ out: [], found: [] })
    expect(rows('a,b\n', ['a'])).toEqual({ out: [], found: ['a'] })
  })
})

describe('csvReader', () => {
  const COLUMNS = ['a', 'b', 'c'] as const

  function read(pieces: string[]) {
    const out: Record<(typeof COLUMNS)[number], string>[] = []
    const reader = csvReader(COLUMNS, (r) => out.push(r))
    for (const piece of pieces) reader.push(piece)
    return { out, found: [...reader.end()].sort() }
  }

  it('reads the same wherever the text is cut', () => {
    const texts = [
      'a,b,c\n1,2,3\n4,5,6\n',
      'a,b,c\r\n1,2,3\r\n4,5,6',
      'a,b,c\r1,2,3\r\r\n\n4,5,6\r',
      '﻿ a ,b,c\n  1  ,2,3\n',
      '\n\r\n a,b\n\n1,2\n\n,\n',
      'a,b\n"Hello, Goodbye","The ""Fab"" Four"\n"Two\r\nLines",X\n',
      'a,b\nsay "hi",2\n"x"y,3\n""\n"",\n"open',
      'a,b\n"closes at the very end"',
      'a,b\n"doubled at the very end"""',
      'a,b,c\n1,2,',
      'd,a\n"not asked for ""at all""\nstill",1\n',
      '',
      'a',
      ',',
      '"',
    ]
    for (const text of texts) {
      const whole = read([text])
      for (let cut = 0; cut <= text.length; cut++) {
        expect(read([text.slice(0, cut), text.slice(cut)]), JSON.stringify({ text, cut })).toEqual(whole)
      }
      expect(read([...text]), JSON.stringify(text)).toEqual(whole)
    }
  })

  it('reads the same however messy files are cut into pieces', () => {
    const random = mulberry32(20261104)
    const pick = (s: readonly string[]) => s[Math.floor(random() * s.length)]
    const parts = ['"', '""', ',', ',', '\n', '\r', '\r\n', 'x', ' ', '﻿', 'é', '𝄞']
    for (let run = 0; run < 400; run++) {
      let text = pick(['a,b,c\n', '"a",b,c\r\n', 'c,x,a\n', '\n\na,b\n'])
      const length = Math.floor(random() * 40)
      for (let k = 0; k < length; k++) text += pick(parts)

      const pieces: string[] = []
      for (let at = 0; at < text.length; ) {
        const size = Math.floor(random() * 6)
        pieces.push(text.slice(at, at + size))
        at += size
      }
      expect(read(pieces), JSON.stringify(text)).toEqual(read([text]))
    }
  })

  it('only skips a byte order mark at the very start, even after an empty piece', () => {
    expect(read(['', '﻿a\n1\n']).out).toEqual([{ a: '1', b: '', c: '' }])
    expect(read(['a\nx', '﻿y\n']).out).toEqual([{ a: 'x﻿y', b: '', c: '' }])
  })

  it('doesn’t let a broken quote grow a field without end', () => {
    const piece = 'x'.repeat(1024 * 1024)
    const { out } = read(['a,b\n"open', piece, piece, piece, piece])
    expect(out).toHaveLength(1)
    expect(out[0].a.length).toBeLessThan(2.5 * 1024 * 1024)
    // Over the limit, doubled quotes are dropped like everything else
    expect(read(['a\n"', piece, piece, '""""""']).out[0].a.endsWith('"')).toBe(false)
  })
})
