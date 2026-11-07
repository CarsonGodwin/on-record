const QUOTE = 34
const COMMA = 44
const LF = 10
const CR = 13

/**
 * A broken quote runs to the end of the file, and a file read in pieces can be far
 * longer than any string can be, so a field stops growing here. No real field comes close.
 */
const MAX_FIELD_CHARS = 1024 * 1024

/** Where a reader is when one piece of text ends, since the next can pick up anywhere */
type Position =
  | 'start' // about to read a field
  | 'plain' // inside an unquoted field
  | 'quoted' // inside quotes
  | 'quote' // just read a quote inside quotes: the next character says if it's doubled or closing
  | 'closed' // past the closing quote, where stray text up to the next break is kept
  | 'cr' // just read a CR, and an LF right after it belongs to it

export interface CsvReader<C extends string> {
  /** Reads the next piece of the file, which can end anywhere, even inside a field */
  push(text: string): void
  /** Finishes the last record and returns the asked-for columns the header actually had */
  end(): Set<C>
}

export interface CsvOptions {
  /** The file has no header, so `columns` name its fields in order. Fields past them are still never copied. */
  headerless?: boolean
}

/** Reads a whole CSV file at once. See csvReader. */
export function readCsv<C extends string>(
  text: string,
  columns: readonly C[],
  onRow: (row: Record<C, string>) => void,
  options: CsvOptions = {},
): Set<C> {
  const reader = csvReader(columns, onRow, options)
  reader.push(text)
  return reader.end()
}

/**
 * Reads a CSV file (RFC 4180: quoted fields can hold commas, doubled quotes and
 * line breaks) piece by piece, calling `onRow` with the asked-for columns of each
 * record. Nothing is kept between pieces but the field being read, so a file can be
 * longer than any one string could hold.
 *
 * Columns are found by their header, since Apple adds and reorders columns
 * between export versions, and a header matches whatever its case, spacing or
 * punctuation ("Media Type", "Media type", "media_type"), since Apple's own files
 * don't agree on those. Only the columns asked for are ever copied out of
 * the text, so the rest of a row (an IP address, an account number) never
 * becomes a string the app holds on to. A column missing from the file reads
 * as ''.
 */
export function csvReader<C extends string>(columns: readonly C[], onRow: (row: Record<C, string>) => void, { headerless = false }: CsvOptions = {}): CsvReader<C> {
  const header: string[] = []
  let inHeader = !headerless
  // Which asked-for column each field position holds, once the header has been read
  const slots: (C | undefined)[] = headerless ? [...columns] : []
  const found = new Set<C>(headerless ? columns : [])
  const blank = () => Object.fromEntries(columns.map((c) => [c, ''])) as Record<C, string>
  const byKey = new Map(columns.map((c) => [headerKey(c), c]))

  let row = blank()
  let field = 0
  let inRecord = false
  let at: Position = 'start'
  let started = false
  // The field being read: whether it's asked for, what's been read of it, and
  // whether it's unquoted with nothing in it so far
  let wanted = false
  let value = ''
  let empty = true

  const add = (text: string, from: number, to: number) => {
    if (wanted && value.length < MAX_FIELD_CHARS) value += text.slice(from, to)
  }

  const endField = () => {
    if (inHeader) header.push(value.trim())
    else {
      const slot = slots[field]
      if (slot !== undefined) row[slot] = value.trim()
    }
    value = ''
  }

  // A blank line is a record of one unquoted, empty field, and is skipped
  const endRecord = (blankLine: boolean) => {
    if (inHeader && !blankLine) {
      header.forEach((name, h) => {
        const col = byKey.get(headerKey(name))
        // The first column with a name wins, if a header ever repeats one
        if (col !== undefined && !found.has(col)) {
          slots[h] = col
          found.add(col)
        }
      })
      inHeader = false
    } else if (inHeader) {
      // A blank line before the header stored one empty name, which would shift every column
      header.length = 0
    } else if (!blankLine) {
      onRow(row)
    }
    row = blank()
    field = 0
    inRecord = false
  }

  const push = (text: string) => {
    const n = text.length
    let i = 0
    if (!started && n > 0) {
      started = true
      if (text.charCodeAt(0) === 0xfeff) i = 1
    }

    while (i < n) {
      switch (at) {
        case 'cr':
          if (text.charCodeAt(i) === LF) i++
          at = 'start'
          break

        case 'start':
          inRecord = true
          wanted = inHeader || slots[field] !== undefined
          empty = text.charCodeAt(i) !== QUOTE
          if (empty) {
            at = 'plain'
          } else {
            at = 'quoted'
            i++
          }
          break

        case 'quoted': {
          // An unclosed quote runs to the end of the file
          const q = text.indexOf('"', i)
          add(text, i, q === -1 ? n : q)
          if (q === -1) {
            i = n
          } else {
            at = 'quote'
            i = q + 1
          }
          break
        }

        case 'quote':
          if (text.charCodeAt(i) === QUOTE) {
            add(text, i, i + 1)
            at = 'quoted'
            i++
          } else {
            // Be lenient about stray text between a closing quote and the next comma
            at = 'closed'
          }
          break

        case 'plain':
        case 'closed': {
          const end = nextBreak(text, i)
          if (end > i) {
            empty = false
            add(text, i, end)
          }
          i = end
          if (i === n) break

          const c = text.charCodeAt(i)
          i++
          endField()
          if (c === COMMA) {
            field++
            at = 'start'
          } else {
            endRecord(field === 0 && empty)
            at = c === CR ? 'cr' : 'start'
          }
          break
        }
      }
    }
  }

  const end = () => {
    // A file that ends just after a comma still has one last (empty) field
    if (at === 'start' ? inRecord : at !== 'cr') {
      endField()
      endRecord(false)
    }
    return found
  }

  return { push, end }
}

/** Index of the next comma or line break at or after `i`, or the end of the text */
function nextBreak(text: string, i: number): number {
  const n = text.length
  while (i < n) {
    const c = text.charCodeAt(i)
    if (c === COMMA || c === LF || c === CR) return i
    i++
  }
  return n
}

/** A header with case, spacing, punctuation and invisible characters left out */
export function headerKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}
