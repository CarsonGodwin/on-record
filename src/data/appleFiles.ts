/*
 * Which files in an Apple privacy export (privacy.apple.com, "Apple Media Services
 * information") hold Apple Music history. Kept apart from data/apple.ts, which
 * does the parsing, so the loader can recognise Apple files without downloading
 * the parser until someone actually drops one.
 *
 * The export holds a lot more than music (purchases, Apple Pay activity, account
 * details), so files are matched by name against the list below and nothing else
 * is ever opened. Only the spelling of a name is forgiven (see nameKey), never a
 * different name.
 */

export type AppleFileKind = 'playActivity' | 'dailyTracks' | 'recentlyPlayed' | 'trackHistory' | 'library'

/** An Apple Music file, read but not yet parsed: the files only make sense together */
export interface AppleText {
  kind: AppleFileKind
  name: string
  text: string
}

const FILES: Record<string, AppleFileKind> = {
  // One row per playback event: the plays themselves
  [nameKey('Apple Music Play Activity.csv')]: 'playActivity',
  // These three describe tracks as "Artist - Title", which is where artists come from
  [nameKey('Apple Music - Play History Daily Tracks.csv')]: 'dailyTracks',
  [nameKey('Apple Music - Recently Played Tracks.csv')]: 'recentlyPlayed',
  [nameKey('Apple Music - Track Play History.csv')]: 'trackHistory',
  // Songs saved to the library, with separate title, artist and album
  [nameKey('Apple Music Library Tracks.json')]: 'library',
}

/**
 * Zips worth opening inside the export: Apple ships the music files in a zip
 * inside the zip you download, and sometimes zips the library file again.
 */
const ARCHIVES = new Set(['Apple_Media_Services.zip', 'Apple Music Library Tracks.json.zip'].map(nameKey))

export function appleFileKind(path: string): AppleFileKind | null {
  if (isJunk(path)) return null
  return FILES[nameKey(baseName(path))] ?? null
}

export function isAppleArchiveName(path: string): boolean {
  return !isJunk(path) && ARCHIVES.has(nameKey(baseName(path)))
}

/** macOS resource forks and hidden files, which share real files' names */
function isJunk(path: string): boolean {
  return path.includes('__MACOSX/') || baseName(path).startsWith('.')
}

/**
 * A file name with what an unzip tool, a download or a different export version
 * might change taken out: case, spaces, underscores and dashes ("Apple_Media_Services"
 * and "Apple Media Services"), and the number a copy gets ("… (1).csv", "… 2.csv").
 * The extensions stay, so "….json.zip" is still told from "….json".
 */
function nameKey(name: string): string {
  const lower = name.normalize('NFKC').toLowerCase().trim()
  const dot = lower.search(/(\.[a-z0-9]+)+$/)
  const stem = dot === -1 ? lower : lower.slice(0, dot)
  const ext = dot === -1 ? '' : lower.slice(dot)
  return stem.replace(/(\s*\(\d+\)|\s+\d+)$/, '').replace(/[^\p{L}\p{N}]+/gu, '') + ext
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
