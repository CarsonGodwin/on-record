import JSZip from 'jszip'
import type { DataSource, LoadResult, Play } from '../types'
import { appleFileKind, isAppleArchiveName, type AppleFile } from './appleFiles'
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
  apple: AppleFile[]
  /** An Apple Music file or archive couldn't be used, which has already been explained */
  appleSkipped: boolean
  /** The warnings about files that could have held history but weren't read */
  failures: string[]
}

function nothing(): Found {
  return { spotify: [], apple: [], appleSkipped: false, failures: [] }
}

/** A file that could have held history but wasn't read: a warning, and one the dashboard says up front */
function failed(message: string, warnings: string[], appleSkipped = false): Found {
  warnings.push(message)
  return { ...nothing(), appleSkipped, failures: [message] }
}

/**
 * What one dropped zip may still open, shared with the zips nested in it, so nesting
 * can't multiply the caps: a zip of 200 zips of 200 zips would otherwise read 200³ entries.
 */
interface ZipBudget {
  entries: number
  archives: number
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
 * exports are far smaller: a decade of extended history is a few dozen MB. The
 * exception is Apple's play activity, which has limits of its own below.
 */
const MAX_FILE_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_ENTRIES = 200
const MAX_FILES = 500
/** Apple nests zips two deep: the download, Apple_Media_Services.zip, then the zipped library file */
const MAX_ZIP_DEPTH = 2
/** Zips opened inside one dropped zip. Apple's download needs two (Apple_Media_Services.zip and the zipped library). */
const MAX_NESTED_ZIPS = 4
/**
 * Apple keeps every play in one file, which a heavy listener can push past both
 * MAX_FILE_BYTES and the longest string a browser will hold (about 512 MiB, past which
 * Chrome's file.text() quietly returns ''). So that file is read piece by piece, with
 * limits of its own, which every play activity in an upload shares so that many files
 * can't multiply them. Holding the plays is what costs memory, so very short rows are
 * capped by count: years of daily listening come to a fraction of either limit.
 */
const PLAY_ACTIVITY_LIMITS: PlayActivityBudget = { bytes: 4 * 1024 * 1024 * 1024, events: 5_000_000 }

/** What an upload's play activities may still read */
export interface PlayActivityBudget {
  bytes: number
  events: number
}

/** Hands a file's text to `onText` piece by piece. If `onText` throws, reading stops and the promise rejects with that error. */
export type TextStream = (onText: (text: string) => void) => Promise<void>

/** Whichever way a browser refuses to read a file, it says so with a DOMException. What a file holds never raises one. */
function isReadError(err: unknown): boolean {
  return err instanceof DOMException
}

/** A file the browser refused to read, usually an online-only iCloud, Dropbox or OneDrive file. Unless it's plainly Spotify's, it could have held the play activity. */
function unreadable(name: string, warnings: string[]): Found {
  const message = `${name}: couldn't be read from your computer. If it's in iCloud, Dropbox or OneDrive, make sure it's downloaded, then add it again`
  return failed(message, warnings, !isHistoryFileName(name))
}

/**
 * Reads dropped or picked files (.zip, .json or Apple's .csv) entirely in the browser.
 * `unreadableNames` are files a dropped folder listed but the browser wouldn't hand over.
 */
export async function loadFiles(files: File[], unreadableNames: string[] = []): Promise<LoadResult> {
  const warnings: string[] = []
  if (files.length > MAX_FILES) {
    warnings.push(`Only the first ${MAX_FILES} of ${files.length} files were read`)
    files = files.slice(0, MAX_FILES)
  }
  const activity = { ...PLAY_ACTIVITY_LIMITS }
  const found = await Promise.all(
    files.map((f) =>
      readFile(f, warnings, activity).catch((err) => {
        // A file the browser won't read shouldn't sink the rest of the upload. Anything
        // else is a bug or a failed import, which the page's own error reports as it is.
        if (!isReadError(err)) throw err
        return unreadable(f.name, warnings)
      }),
    ),
  )
  for (const name of unreadableNames) found.push(unreadable(name, warnings))
  const spotify = readSpotify(
    found.flatMap((f) => f.spotify),
    warnings,
  )
  const appleFiles = found.flatMap((f) => f.apple)
  // The Apple parser only downloads for people who drop an Apple export
  const apple =
    appleFiles.length > 0
      ? (await import('./apple')).loadApple(appleFiles, warnings, { spotify: spotify.plays, skippedFiles: found.some((f) => f.appleSkipped) })
      : null
  return collect({ spotify, apple }, warnings, found.flatMap((f) => f.failures))
}

/** Builds the same LoadResult from generated data, for visitors without an export. */
export function loadSample(): LoadResult {
  return collect({ spotify: readSpotify([{ name: 'Sample data', rows: generateSampleRecords() }], []), apple: null }, [], [])
}

async function readFile(file: File, warnings: string[], activity: PlayActivityBudget): Promise<Found> {
  const lower = file.name.toLowerCase()
  const found = nothing()
  const appleKind = appleFileKind(file.name)
  const isJson = lower.endsWith('.json')
  const isVideo = /video/i.test(lower)

  // A large file that could never have held history gets the warning below like any other, not a report of history going missing
  const couldHoldHistory = appleKind !== null || lower.endsWith('.zip') || (isJson && !isVideo)
  if (couldHoldHistory && file.size > (appleKind === 'playActivity' ? PLAY_ACTIVITY_LIMITS.bytes : MAX_FILE_BYTES)) {
    return failed(`${file.name}: skipped (too large to open safely in the browser)`, warnings, appleKind !== null)
  }

  if (lower.endsWith('.zip')) {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(file)
    } catch (err) {
      // A file the browser can't read isn't a bad zip; loadFiles explains that one
      if (isReadError(err)) throw err
      return failed(`${file.name}: couldn't open this zip file`, warnings)
    }
    const inside = await readZip(zip, warnings, 0, { entries: MAX_ENTRIES, archives: MAX_NESTED_ZIPS }, activity)
    if (inside.spotify.length === 0 && inside.apple.length === 0 && inside.failures.length === 0) {
      warnings.push(`${file.name}: no streaming history files found inside`)
    }
    return inside
  }

  if (appleKind === 'playActivity') return readPlayActivity(file.name, fileText(file), warnings, activity)
  if (appleKind) {
    found.apple.push({ kind: appleKind, name: file.name, text: await file.text() })
    return found
  }

  if (isJson) {
    if (isVideo) {
      warnings.push(`${file.name}: skipped (video history isn't supported yet)`)
      return found
    }
    return spotifyFile(file.name, await file.text(), warnings)
  }

  warnings.push(
    lower.endsWith('.csv')
      ? `${file.name}: skipped (not one of Apple Music’s history files)`
      : `${file.name}: skipped (not a .zip or .json file)`,
  )
  return found
}

/** Reads the history files in a zip, opening the zips Apple nests inside its export */
async function readZip(zip: JSZip, warnings: string[], depth: number, budget: ZipBudget, activity: PlayActivityBudget): Promise<Found> {
  const found = nothing()
  const entries: JSZip.JSZipObject[] = []
  for (const e of Object.values(zip.files)) {
    if (budget.entries === 0) break
    if (e.dir) continue
    const kind = isHistoryFileName(e.name) ? 'spotify' : appleFileKind(e.name)
    const archive = kind === null && depth < MAX_ZIP_DEPTH && isAppleArchiveName(e.name)
    if (kind === null && !archive) continue
    if (archive && budget.archives === 0) continue
    budget.entries--
    if (archive) budget.archives--

    // The declared size isn't in JSZip's public types, and a lying header only
    // delays the check, so treat a missing value as unknown rather than unsafe.
    const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    const limit = kind === 'playActivity' ? PLAY_ACTIVITY_LIMITS.bytes : archive ? MAX_FILE_BYTES : MAX_ENTRY_BYTES
    if (typeof size === 'number' && size > limit) {
      const skipped = failed(`${baseName(e.name)}: skipped (unusually large once unzipped)`, warnings, kind !== 'spotify')
      found.failures.push(...skipped.failures)
      found.appleSkipped ||= skipped.appleSkipped
      continue
    }
    entries.push(e)
  }

  // Each entry gives its own Found, so results keep the zip's order however the reads finish
  const results = await Promise.all(
    entries.map(async (e): Promise<Found> => {
      const name = baseName(e.name)
      try {
        if (isHistoryFileName(e.name)) return spotifyFile(name, await e.async('string'), warnings)
        const kind = appleFileKind(e.name)
        if (kind === 'playActivity') return await readPlayActivity(name, entryText(e), warnings, activity)
        if (kind) return { ...nothing(), apple: [{ kind, name, text: await e.async('string') }] }

        const bytes = await e.async('uint8array')
        if (bytes.byteLength > MAX_FILE_BYTES) return failed(`${name}: skipped (unusually large once unzipped)`, warnings, true)
        let inner: JSZip
        try {
          inner = await JSZip.loadAsync(bytes)
        } catch {
          return failed(`${name}: couldn't open this zip file`, warnings)
        }
        return await readZip(inner, warnings, depth + 1, budget, activity)
      } catch (err) {
        // A bug or a failed import, not a bad entry: the page's own error reports it as it is
        if (err instanceof TypeError) throw err
        // The zip's already in memory, so the browser isn't what stopped this. The other entries are still good.
        return failed(`${name}: couldn't be unzipped, so the zip may be damaged. Try downloading it again`, warnings, !isHistoryFileName(e.name))
      }
    }),
  )
  return {
    spotify: results.flatMap((r) => r.spotify),
    apple: results.flatMap((r) => r.apple),
    appleSkipped: found.appleSkipped || results.some((r) => r.appleSkipped),
    failures: [...found.failures, ...results.flatMap((r) => r.failures)],
  }
}

/**
 * Parses a play activity as it's read, so it never has to fit in one string. The limits
 * are checked on what actually arrives, since a zip's stated size can be a lie, and what's
 * read comes out of `budget`, which the upload's other play activities are drawing on too.
 */
export async function readPlayActivity(name: string, stream: TextStream, warnings: string[], budget: PlayActivityBudget): Promise<Found> {
  const reader = (await import('./apple')).playActivityReader()
  const tooLarge = new Error('too large')
  let counted = 0
  try {
    await stream((text) => {
      budget.bytes -= text.length
      budget.events -= reader.events() - counted
      counted = reader.events()
      if (budget.bytes < 0 || budget.events < 0) throw tooLarge
      reader.push(text)
    })
  } catch (err) {
    if (err !== tooLarge) throw err
    return failed(`${name}: skipped (too large to open safely in the browser)`, warnings, true)
  }
  return { ...nothing(), apple: [{ kind: 'playActivity', name, activity: reader.end() }] }
}

export function fileText(file: File): TextStream {
  return async (onText) => {
    const reader = file.stream().getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        onText(decoder.decode(value, { stream: true }))
      }
      onText(decoder.decode())
    } finally {
      // Stopping early mustn't leave the rest of the file open. Cancelling a stream that
      // already failed rejects with the error being thrown here anyway, so that's ignored.
      reader.cancel().catch(() => {})
    }
  }
}

/** The stream behind JSZip's async(), which its types leave out */
interface EntryStream {
  on(event: 'data', listener: (text: string) => void): EntryStream
  on(event: 'end', listener: () => void): EntryStream
  on(event: 'error', listener: (err: Error) => void): EntryStream
  pause(): EntryStream
  resume(): EntryStream
}

export function entryText(entry: JSZip.JSZipObject): TextStream {
  return (onText) =>
    new Promise((resolve, reject) => {
      const stream = (entry as unknown as { internalStream(type: 'string'): EntryStream }).internalStream('string')
      stream
        .on('data', (text) => {
          // JSZip calls this from its own timer, where nothing would catch an error
          try {
            onText(text)
          } catch (err) {
            stream.pause()
            reject(err)
          }
        })
        .on('error', reject)
        .on('end', resolve)
        .resume()
    })
}

function spotifyFile(name: string, text: string, warnings: string[]): Found {
  try {
    return { ...nothing(), spotify: [{ name, rows: JSON.parse(text) }] }
  } catch {
    return failed(`${name}: isn't valid JSON`, warnings)
  }
}

/** Validates Spotify's rows and turns them into plays */
function readSpotify(batches: Batch[], warnings: string[]): Part {
  const plays: Play[] = []
  const filesRead: string[] = []
  let skippedRows = 0

  for (const { name, rows } of batches) {
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
function collect(parts: Record<DataSource, Part | null>, warnings: string[], failures: string[]): LoadResult {
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
  return { plays, filesRead, sources, skippedRows, duplicateRows, unmatchedArtists, warnings, failures }
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
