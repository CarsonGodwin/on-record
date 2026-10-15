import JSZip from 'jszip'
import type { LoadResult, Play } from '../types'
import { isBasicHistoryRecord, isStreamRecord, toPlay } from './parse'
import { generateSampleRecords } from './sample'

/** One parsed JSON file, before its rows are validated */
interface Batch {
  name: string
  rows: unknown
}

/**
 * True for files worth opening. Spotify's zip also holds a PDF readme, and the
 * basic "Account data" export holds many unrelated JSON files.
 * Video history isn't supported yet.
 */
export function isHistoryFileName(path: string): boolean {
  const name = baseName(path)
  return (
    !path.includes('__MACOSX/') &&
    !name.startsWith('.') &&
    name.toLowerCase().endsWith('.json') &&
    /streaming_?history/i.test(name) &&
    !/video/i.test(name)
  )
}

/**
 * Everything is parsed in the visitor's own tab, so these caps guard against a
 * malicious or corrupt archive (a zip bomb) freezing or crashing it. Real
 * exports are far smaller: a decade of extended history is a few dozen MB.
 */
const MAX_FILE_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_ENTRIES = 200
const MAX_FILES = 500

/** Reads dropped or picked files (.zip or .json) entirely in the browser. */
export async function loadFiles(files: File[]): Promise<LoadResult> {
  const warnings: string[] = []
  if (files.length > MAX_FILES) {
    warnings.push(`Only the first ${MAX_FILES} of ${files.length} files were read`)
    files = files.slice(0, MAX_FILES)
  }
  const batches = (await Promise.all(files.map((f) => readFile(f, warnings)))).flat()
  return collect(batches, warnings)
}

/** Builds the same LoadResult from generated data, for visitors without an export. */
export function loadSample(): LoadResult {
  return collect([{ name: 'Sample data', rows: generateSampleRecords() }], [])
}

async function readFile(file: File, warnings: string[]): Promise<Batch[]> {
  const lower = file.name.toLowerCase()

  if (file.size > MAX_FILE_BYTES) {
    warnings.push(`${file.name}: skipped (too large to open safely in the browser)`)
    return []
  }

  if (lower.endsWith('.zip')) {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(file)
    } catch {
      warnings.push(`${file.name}: couldn't open this zip file`)
      return []
    }
    const entries = Object.values(zip.files)
      .filter((e) => !e.dir && isHistoryFileName(e.name))
      .slice(0, MAX_ENTRIES)
      .filter((e) => {
        // The declared size isn't in JSZip's public types, and a lying header only
        // delays the check, so treat a missing value as unknown rather than unsafe
        const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
        if (typeof size === 'number' && size > MAX_ENTRY_BYTES) {
          warnings.push(`${baseName(e.name)}: skipped (unusually large once unzipped)`)
          return false
        }
        return true
      })
    if (entries.length === 0) {
      warnings.push(`${file.name}: no streaming history files found inside`)
    }
    return Promise.all(
      entries.map(async (e) => ({
        name: baseName(e.name),
        rows: parseJson(await e.async('string'), baseName(e.name), warnings),
      })),
    )
  }

  if (lower.endsWith('.json')) {
    if (/video/i.test(lower)) {
      warnings.push(`${file.name}: skipped (video history isn't supported yet)`)
      return []
    }
    return [{ name: file.name, rows: parseJson(await file.text(), file.name, warnings) }]
  }

  warnings.push(`${file.name}: skipped (not a .zip or .json file)`)
  return []
}

function parseJson(text: string, name: string, warnings: string[]): unknown {
  try {
    return JSON.parse(text)
  } catch {
    warnings.push(`${name}: isn't valid JSON`)
    return null
  }
}

function collect(batches: Batch[], warnings: string[]): LoadResult {
  const plays: Play[] = []
  const filesRead: string[] = []
  const seen = new Set<string>()
  let skippedRows = 0
  let duplicateRows = 0

  for (const { name, rows } of batches) {
    if (rows === null) continue // parseJson already warned
    if (!Array.isArray(rows)) {
      warnings.push(`${name}: doesn't look like a streaming history file`)
      continue
    }
    if (rows.length > 0 && isBasicHistoryRecord(rows[0])) {
      warnings.push(
        `${name}: this is the basic "Account data" history, which is missing the detail this app needs. Request "Extended streaming history" instead.`,
      )
      continue
    }
    if (rows.length > 0 && !isStreamRecord(rows[0])) {
      warnings.push(`${name}: doesn't look like a streaming history file`)
      continue
    }

    filesRead.push(name)
    for (const row of rows) {
      const play = isStreamRecord(row) ? toPlay(row) : null
      if (!play) {
        skippedRows++
        continue
      }
      // Same end time + item + duration means the same stream
      const key = `${play.endTime}|${play.uri || play.title}|${play.msPlayed}`
      if (seen.has(key)) {
        duplicateRows++
        continue
      }
      seen.add(key)
      plays.push(play)
    }
  }

  plays.sort((a, b) => a.endTime - b.endTime)
  return { plays, filesRead, skippedRows, duplicateRows, warnings }
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
