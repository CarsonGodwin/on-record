import JSZip from 'jszip'
import type { DataSource, LoadResult, Play } from '../types'
import { appleFileKind, isAppleArchiveName, type AppleText } from './appleFiles'
import { isBasicHistoryRecord, isStreamRecord, toPlay } from './parse'
import { generateSampleRecords } from './sample'

/** One parsed Spotify JSON file, before its rows are validated */
interface Batch {
  name: string
  rows: unknown
}

/** The history files found in what was dropped, by service, in the order they were found */
interface Found {
  spotify: Batch[]
  apple: AppleText[]
}

/** Plays from one service, before they're merged, deduped and sorted with the rest */
interface Part {
  plays: Play[]
  filesRead: string[]
  skippedRows: number
  duplicateRows: number
  unmatchedArtists: number
}

/**
 * True for Spotify files worth opening. Spotify's zip also holds a PDF readme, and the
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

/** True for any file worth keeping from a dropped folder, from either service */
export function isImportFileName(path: string): boolean {
  return isHistoryFileName(path) || appleFileKind(path) !== null || isAppleArchiveName(path)
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
/** Apple nests zips two deep: the download, Apple_Media_Services.zip, then the zipped library file */
const MAX_ZIP_DEPTH = 2

/** Reads dropped or picked files (.zip, .json or Apple's .csv) entirely in the browser. */
export async function loadFiles(files: File[]): Promise<LoadResult> {
  const warnings: string[] = []
  if (files.length > MAX_FILES) {
    warnings.push(`Only the first ${MAX_FILES} of ${files.length} files were read`)
    files = files.slice(0, MAX_FILES)
  }
  const found = await Promise.all(files.map((f) => readFile(f, warnings)))
  const spotify = readSpotify(
    found.flatMap((f) => f.spotify),
    warnings,
  )
  const appleFiles = found.flatMap((f) => f.apple)
  // The Apple parser only downloads for people who drop an Apple export
  const apple = appleFiles.length > 0 ? (await import('./apple')).loadApple(appleFiles, warnings) : null
  return collect({ spotify, apple }, warnings)
}

/** Builds the same LoadResult from generated data, for visitors without an export. */
export function loadSample(): LoadResult {
  return collect({ spotify: readSpotify([{ name: 'Sample data', rows: generateSampleRecords() }], []), apple: null }, [])
}

async function readFile(file: File, warnings: string[]): Promise<Found> {
  const lower = file.name.toLowerCase()
  const found: Found = { spotify: [], apple: [] }

  if (file.size > MAX_FILE_BYTES) {
    warnings.push(`${file.name}: skipped (too large to open safely in the browser)`)
    return found
  }

  if (lower.endsWith('.zip')) {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(file)
    } catch {
      warnings.push(`${file.name}: couldn't open this zip file`)
      return found
    }
    const inside = await readZip(zip, warnings, 0)
    if (inside.spotify.length === 0 && inside.apple.length === 0) {
      warnings.push(`${file.name}: no streaming history files found inside`)
    }
    return inside
  }

  const appleKind = appleFileKind(file.name)
  if (appleKind) {
    found.apple.push({ kind: appleKind, name: file.name, text: await file.text() })
    return found
  }

  if (lower.endsWith('.json')) {
    if (/video/i.test(lower)) {
      warnings.push(`${file.name}: skipped (video history isn't supported yet)`)
      return found
    }
    found.spotify.push({ name: file.name, rows: parseJson(await file.text(), file.name, warnings) })
    return found
  }

  warnings.push(
    lower.endsWith('.csv')
      ? `${file.name}: skipped (not one of Apple Music’s history files)`
      : `${file.name}: skipped (not a .zip or .json file)`,
  )
  return found
}

/** Reads the history files in a zip, opening the zips Apple nests inside its export */
async function readZip(zip: JSZip, warnings: string[], depth: number): Promise<Found> {
  const entries = Object.values(zip.files)
    .filter((e) => !e.dir && (isHistoryFileName(e.name) || appleFileKind(e.name) !== null || (depth < MAX_ZIP_DEPTH && isAppleArchiveName(e.name))))
    .slice(0, MAX_ENTRIES)
    .filter((e) => {
      // The declared size isn't in JSZip's public types, and a lying header only
      // delays the check, so treat a missing value as unknown rather than unsafe
      const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
      const limit = isAppleArchiveName(e.name) ? MAX_FILE_BYTES : MAX_ENTRY_BYTES
      if (typeof size === 'number' && size > limit) {
        warnings.push(`${baseName(e.name)}: skipped (unusually large once unzipped)`)
        return false
      }
      return true
    })

  // Each entry gives its own Found, so results keep the zip's order however the reads finish
  const results = await Promise.all(
    entries.map(async (e): Promise<Found> => {
      const name = baseName(e.name)
      if (isHistoryFileName(e.name)) {
        return { spotify: [{ name, rows: parseJson(await e.async('string'), name, warnings) }], apple: [] }
      }
      const kind = appleFileKind(e.name)
      if (kind) return { spotify: [], apple: [{ kind, name, text: await e.async('string') }] }

      const bytes = await e.async('uint8array')
      if (bytes.byteLength > MAX_FILE_BYTES) {
        warnings.push(`${name}: skipped (unusually large once unzipped)`)
        return { spotify: [], apple: [] }
      }
      let inner: JSZip
      try {
        inner = await JSZip.loadAsync(bytes)
      } catch {
        warnings.push(`${name}: couldn't open this zip file`)
        return { spotify: [], apple: [] }
      }
      return readZip(inner, warnings, depth + 1)
    }),
  )
  return { spotify: results.flatMap((r) => r.spotify), apple: results.flatMap((r) => r.apple) }
}

function parseJson(text: string, name: string, warnings: string[]): unknown {
  try {
    return JSON.parse(text)
  } catch {
    warnings.push(`${name}: isn't valid JSON`)
    return null
  }
}

/** Validates Spotify's rows and turns them into plays */
function readSpotify(batches: Batch[], warnings: string[]): Part {
  const plays: Play[] = []
  const filesRead: string[] = []
  let skippedRows = 0

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
      if (play) plays.push(play)
      else skippedRows++
    }
  }
  return { plays, filesRead, skippedRows, duplicateRows: 0, unmatchedArtists: 0 }
}

/** Merges each service's plays, drops repeats and sorts the lot by end time */
function collect(parts: Record<DataSource, Part | null>, warnings: string[]): LoadResult {
  const plays: Play[] = []
  const filesRead: string[] = []
  const sources: DataSource[] = []
  const seen = new Set<string>()
  let skippedRows = 0
  let duplicateRows = 0
  let unmatchedArtists = 0

  // Spotify first, so its plays win any tie exactly as they did before Apple Music was supported
  for (const source of ['spotify', 'apple'] as const) {
    const part = parts[source]
    if (!part) continue
    filesRead.push(...part.filesRead)
    skippedRows += part.skippedRows
    duplicateRows += part.duplicateRows
    unmatchedArtists += part.unmatchedArtists
    let added = 0
    for (const play of part.plays) {
      // Same end time + item + duration means the same stream
      const key = `${play.endTime}|${play.uri || play.title}|${play.msPlayed}`
      if (seen.has(key)) {
        duplicateRows++
        continue
      }
      seen.add(key)
      plays.push(play)
      added++
    }
    if (added > 0) sources.push(source)
  }

  plays.sort((a, b) => a.endTime - b.endTime)
  return { plays, filesRead, sources, skippedRows, duplicateRows, unmatchedArtists, warnings }
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
