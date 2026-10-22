import { describe, expect, it } from 'vitest'
import { readCsv } from '../../src/data/csv'

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

  it('strips a byte order mark and trims headers and values', () => {
    expect(rows('﻿ Song Name ,x\n  Blue  ,1\n', ['Song Name']).out).toEqual([{ 'Song Name': 'Blue' }])
  })

  it('skips blank lines but keeps rows of empty fields', () => {
    expect(rows('a,b\n\n1,2\n\n,\n', ['a', 'b']).out).toEqual([
      { a: '1', b: '2' },
      { a: '', b: '' },
    ])
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

  it('never copies columns it wasn’t asked for', () => {
    const { out } = rows('Song Name,Client IP Address\nBlue,203.0.113.9\n', ['Song Name'])
    expect(JSON.stringify(out)).not.toContain('203.0.113.9')
  })
})
