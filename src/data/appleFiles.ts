/*
 * Which files in an Apple privacy export (privacy.apple.com, "Apple Media Services
 * information") hold Apple Music history. Kept apart from data/apple.ts, which
 * does the parsing, so the loader can recognise Apple files without downloading
 * the parser until someone actually drops one.
 *
 * The export holds a lot more than music (purchases, Apple Pay activity, account
 * details), so files are matched by exact name and nothing else is ever opened.
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
  'apple music play activity.csv': 'playActivity',
  // These three describe tracks as "Artist - Title", which is where artists come from
  'apple music - play history daily tracks.csv': 'dailyTracks',
  'apple music - recently played tracks.csv': 'recentlyPlayed',
  'apple music - track play history.csv': 'trackHistory',
  // Songs saved to the library, with separate title, artist and album
  'apple music library tracks.json': 'library',
}

/**
 * Zips worth opening inside the export: Apple ships the music files in a zip
 * inside the zip you download, and sometimes zips the library file again.
 */
const ARCHIVES = new Set(['apple_media_services.zip', 'apple music library tracks.json.zip'])

export function appleFileKind(path: string): AppleFileKind | null {
  if (isJunk(path)) return null
  return FILES[baseName(path).toLowerCase()] ?? null
}

export function isAppleArchiveName(path: string): boolean {
  return !isJunk(path) && ARCHIVES.has(baseName(path).toLowerCase())
}

/** macOS resource forks and hidden files, which share real files' names */
function isJunk(path: string): boolean {
  return path.includes('__MACOSX/') || baseName(path).startsWith('.')
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
