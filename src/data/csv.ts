const QUOTE = 34
const COMMA = 44
const LF = 10
const CR = 13

/**
 * Reads a CSV file (RFC 4180: quoted fields can hold commas, doubled quotes and
 * line breaks), calling `onRow` with the asked-for columns of each record.
 *
 * Columns are found by their header, since Apple adds and reorders columns
 * between export versions, and a header matches whatever its case, spacing or
 * punctuation ("Media Type", "Media type", "media_type"), since Apple's own files
 * don't agree on those. Only the columns asked for are ever copied out of
 * the text, so the rest of a row (an IP address, an account number) never
 * becomes a string the app holds on to. A column missing from the file reads
 * as ''. Returns the asked-for columns the header actually had.
 */
export function readCsv<C extends string>(
  text: string,
  columns: readonly C[],
  onRow: (row: Record<C, string>) => void,
): Set<C> {
  const n = text.length
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0

  const header: string[] = []
  let inHeader = true
  // Which asked-for column each field position holds, once the header has been read
  const slots: (C | undefined)[] = []
  const found = new Set<C>()
  const blank = () => Object.fromEntries(columns.map((c) => [c, ''])) as Record<C, string>
  const byKey = new Map(columns.map((c) => [headerKey(c), c]))

  let row = blank()
  let field = 0
  let inRecord = false

  const store = (value: string | null) => {
    if (value === null) return
    if (inHeader) header.push(value.trim())
    else {
      const slot = slots[field]
      if (slot !== undefined) row[slot] = value.trim()
    }
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

  while (i < n) {
    inRecord = true
    const wanted = inHeader || slots[field] !== undefined
    let value: string | null
    let empty = false

    if (text.charCodeAt(i) === QUOTE) {
      let out = ''
      let start = i + 1
      i = start
      for (;;) {
        const q = text.indexOf('"', i)
        if (q === -1) {
          // An unclosed quote runs to the end of the file
          if (wanted) out += text.slice(start)
          i = n
          break
        }
        if (text.charCodeAt(q + 1) === QUOTE) {
          if (wanted) out += text.slice(start, q + 1)
          i = start = q + 2
          continue
        }
        if (wanted) out += text.slice(start, q)
        i = q + 1
        break
      }
      // Be lenient about stray text between a closing quote and the next comma
      const end = nextBreak(text, i)
      if (wanted && end > i) out += text.slice(i, end)
      i = end
      value = wanted ? out : null
    } else {
      const end = nextBreak(text, i)
      value = wanted ? text.slice(i, end) : null
      empty = end === i
      i = end
    }

    store(value)
    const c = text.charCodeAt(i)
    if (c === COMMA) {
      field++
      i++
      continue
    }
    endRecord(field === 0 && empty)
    i += c === CR && text.charCodeAt(i + 1) === LF ? 2 : 1
  }
  // A file that ends just after a comma still has one last (empty) field
  if (inRecord) {
    store('')
    endRecord(false)
  }

  return found
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
