import type { AppleFileKind, AppleText } from '../src/data/appleFiles'
import { normalizePlatform } from '../src/data/parse'
import type { RawStreamRecord } from '../src/types'

/*
 * Builders for Apple Music export fixtures. Column names follow Apple's privacy
 * export; the real file has more columns, in an order that changes between
 * versions, so these are deliberately not in a tidy order.
 */

/** Values in the private columns, which must never turn up in a Play */
export const PRIVATE = {
  'Apple Id Number': '9876543210',
  'Client IP Address': '203.0.113.7',
  'Device Identifier': 'DEVICE-ID-SECRET',
  'Metrics Client Id': 'METRICS-ID-SECRET',
}

export const PLAY_ACTIVITY_COLUMNS = [
  'Apple Id Number',
  'Apple Music Subscription',
  'Build Version',
  'Client IP Address',
  'Device Identifier',
  'End Position In Milliseconds',
  'End Reason Type',
  'Event End Timestamp',
  'Event Received Timestamp',
  'Event Start Timestamp',
  'Event Type',
  'Feature Name',
  'Media Duration In Milliseconds',
  'Media Type',
  'Metrics Client Id',
  'Offline',
  'Play Duration Milliseconds',
  'Song Name',
  'Album Name',
  'Container Album Name',
  'Container Artist Name',
  'Artist Name',
  'Source Type',
  'Start Position In Milliseconds',
  'Store Front Name',
  'UTC Offset In Seconds',
]

type Row = Record<string, string | number>

/**
 * One full play: by default a three-minute song from the top that played to its end,
 * on an iPhone. `o` overrides any column by name; the end time follows the duration.
 */
export function playRow(start: Date | number, o: Row = {}): Row {
  const startMs = typeof start === 'number' ? start : start.getTime()
  const played = Number(o['Play Duration Milliseconds'] ?? 180_000)
  return {
    ...PRIVATE,
    'Apple Music Subscription': 'true',
    'Build Version': 'Music/1.4.5 iOS/17.4 model/iPhone15,2 build/21E219',
    'End Reason Type': 'NATURAL_END_OF_TRACK',
    'Event Start Timestamp': new Date(startMs).toISOString(),
    'Event End Timestamp': new Date(startMs + played).toISOString(),
    'Event Received Timestamp': new Date(startMs + played + 5_000).toISOString(),
    'Event Type': 'PLAY_END',
    'Feature Name': 'library / album-detail',
    'Media Duration In Milliseconds': 180_000,
    'Media Type': 'AUDIO',
    Offline: 'false',
    'Play Duration Milliseconds': played,
    'Song Name': 'Song',
    'Album Name': 'Album',
    'Source Type': 'ORIGINATING_DEVICE',
    'Start Position In Milliseconds': 0,
    'End Position In Milliseconds': played,
    'Store Front Name': '143441-1,29',
    'UTC Offset In Seconds': -25200,
    ...o,
  }
}

export function csv(columns: readonly string[], rows: Row[]): string {
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

export function playActivity(rows: Row[], columns: readonly string[] = PLAY_ACTIVITY_COLUMNS): string {
  return csv(columns, rows)
}

/** Daily Tracks: one row per track per day, describing it as "Artist - Title" */
export function dailyTracks(entries: { description: string; date: string }[]): string {
  return csv(
    ['Country', 'Date Played', 'Hours', 'Play Duration Milliseconds', 'Media type', 'Track Description', 'Track Identifier', 'Play Count', 'Skip Count'],
    entries.map((e) => ({
      Country: 'US',
      'Date Played': e.date,
      Hours: '9, 10',
      'Play Duration Milliseconds': 360_000,
      'Media type': 'AUDIO',
      'Track Description': e.description,
      'Track Identifier': 1,
      'Play Count': 2,
      'Skip Count': 0,
    })),
  )
}

export function recentlyPlayed(descriptions: string[]): string {
  return csv(
    ['Track Description', 'Container Description', 'Total plays'],
    descriptions.map((d) => ({ 'Track Description': d, 'Container Description': 'A playlist', 'Total plays': 3 })),
  )
}

export function trackPlayHistory(descriptions: string[]): string {
  return csv(
    ['Track Name', 'Last Played Date', 'Is User Initiated'],
    descriptions.map((d) => ({ 'Track Name': d, 'Last Played Date': 1_700_000_000_000, 'Is User Initiated': 'true' })),
  )
}

export function library(tracks: { Title: string; Artist: string; Album?: string }[]): string {
  return JSON.stringify(tracks.map((t, i) => ({ 'Track Identifier': i + 1, ...t, Genre: 'Pop', 'Date Added To Library': '2020-01-01T00:00:00Z' })))
}

export const FILE_NAMES: Record<AppleFileKind, string> = {
  playActivity: 'Apple Music Play Activity.csv',
  dailyTracks: 'Apple Music - Play History Daily Tracks.csv',
  recentlyPlayed: 'Apple Music - Recently Played Tracks.csv',
  trackHistory: 'Apple Music - Track Play History.csv',
  library: 'Apple Music Library Tracks.json',
}

export function appleText(kind: AppleFileKind, text: string): AppleText {
  return { kind, name: FILE_NAMES[kind], text }
}

/** A local date as Daily Tracks writes it: 20240314 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The same listening as a Spotify export, written out the way Apple's export
 * would have it: no artist in the play activity, artists only in the other files.
 * Some plays come from an album (its artist in Container Artist Name), some from
 * Apple's own playlists (its "artist" is Apple Music) and the rest have neither.
 * Songs played often are in the library.
 */
export function appleExportFrom(records: RawStreamRecord[]): AppleText[] {
  const tracks = records.filter((r) => r.master_metadata_track_name !== null)
  const lengths = new Map<string, number>()
  for (const r of tracks) lengths.set(r.spotify_track_uri ?? '', Math.max(lengths.get(r.spotify_track_uri ?? '') ?? 0, r.ms_played))

  const rows: Row[] = []
  const daily = new Map<string, { description: string; date: string }>()
  const counts = new Map<string, { Title: string; Artist: string; Album: string; plays: number }>()
  tracks.forEach((r, i) => {
    const title = r.master_metadata_track_name ?? ''
    const artist = r.master_metadata_album_artist_name ?? ''
    const album = r.master_metadata_album_album_name ?? ''
    const end = Date.parse(r.ts)
    const start = end - r.ms_played
    const from = i % 4
    rows.push(
      playRow(start, {
        'Song Name': title,
        'Album Name': album,
        'Container Artist Name': from === 0 ? artist : from === 1 ? 'Apple Music' : '',
        'Play Duration Milliseconds': r.ms_played,
        'Media Duration In Milliseconds': lengths.get(r.spotify_track_uri ?? '') ?? 0,
        'End Reason Type': r.skipped ? 'TRACK_SKIPPED_FORWARDS' : 'NATURAL_END_OF_TRACK',
        'Build Version': BUILDS[normalizePlatform(r.platform)] ?? '',
        Offline: r.offline ? 'true' : 'false',
      }),
    )
    const description = `${artist} - ${title}`
    const date = ymd(new Date(start))
    daily.set(`${date}|${description}`, { description, date })
    const key = `${artist}|${album}|${title}`
    const c = counts.get(key) ?? { Title: title, Artist: artist, Album: album, plays: 0 }
    c.plays++
    counts.set(key, c)
  })

  return [
    appleText('playActivity', playActivity(rows)),
    appleText('dailyTracks', dailyTracks([...daily.values()])),
    appleText('trackHistory', trackPlayHistory([...new Set([...counts.values()].map((c) => `${c.Artist} - ${c.Title}`))])),
    appleText('library', library([...counts.values()].filter((c) => c.plays >= 20))),
  ]
}

/** The demo's device families, as Apple's Build Version strings for the same devices */
const BUILDS: Record<string, string> = {
  iOS: 'Music/1.4.5 iOS/17.4 model/iPhone15,2 build/21E219',
  macOS: 'Music/1.4 macOS/14.4.1 model/Mac14,2',
  Web: 'MusicKit JS/3 (Chrome 124; macOS 14)',
  'Speakers & cast': 'Music/1.0 audioOS/17.4 model/AudioAccessory6,1',
}
