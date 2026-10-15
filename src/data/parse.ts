import type { Play, PlayKind, RawStreamRecord } from '../types'

export function isStreamRecord(row: unknown): row is RawStreamRecord {
  return (
    typeof row === 'object' &&
    row !== null &&
    typeof (row as RawStreamRecord).ts === 'string' &&
    typeof (row as RawStreamRecord).ms_played === 'number'
  )
}

/** The basic "Account data" export uses a different, much thinner format. */
export function isBasicHistoryRecord(row: unknown): boolean {
  return typeof row === 'object' && row !== null && 'endTime' in row && 'msPlayed' in row
}

/** Converts a raw row into a Play, or null if the row has nothing to identify it. */
export function toPlay(r: RawStreamRecord): Play | null {
  const endTime = Date.parse(r.ts)
  if (Number.isNaN(endTime)) return null

  let kind: PlayKind
  let title: string
  let artist: string
  let album = ''
  let uri: string

  if (r.master_metadata_track_name) {
    kind = 'track'
    title = r.master_metadata_track_name
    artist = r.master_metadata_album_artist_name ?? 'Unknown artist'
    album = r.master_metadata_album_album_name ?? ''
    uri = r.spotify_track_uri ?? ''
  } else if (r.episode_name) {
    kind = 'episode'
    title = r.episode_name
    artist = r.episode_show_name ?? 'Unknown show'
    uri = r.spotify_episode_uri ?? ''
  } else if (r.audiobook_title) {
    kind = 'audiobook'
    title = r.audiobook_chapter_title ?? r.audiobook_title
    artist = r.audiobook_title
    uri = r.audiobook_chapter_uri ?? r.audiobook_uri ?? ''
  } else {
    return null
  }

  return {
    endTime,
    msPlayed: r.ms_played,
    kind,
    title,
    artist,
    album,
    uri,
    platform: normalizePlatform(r.platform),
    country: r.conn_country ?? '',
    reasonStart: r.reason_start ?? '',
    reasonEnd: r.reason_end ?? '',
    shuffle: r.shuffle === true,
    skipped: r.skipped === true,
    offline: r.offline === true,
    incognito: r.incognito_mode === true,
  }
}

/**
 * Spotify's platform strings vary a lot ("iOS 17.1 (iPhone15,2)",
 * "OS X 10.15.7 [x86 8]", "web_player osx ...", "android"), so group them
 * into a few families.
 */
export function normalizePlatform(raw: string | null): string {
  const p = (raw ?? '').toLowerCase()
  if (!p) return 'Unknown'
  // Check web first: web player strings also contain the host OS
  if (p.includes('web_player') || p.includes('web player')) return 'Web'
  if (p.startsWith('ios') || p.includes('iphone') || p.includes('ipad')) return 'iOS'
  if (p.includes('android')) return 'Android'
  if (p.includes('windows')) return 'Windows'
  if (p.startsWith('os x') || p.includes('osx') || p.includes('macos')) return 'macOS'
  if (p.includes('linux')) return 'Linux'
  if (/cast|sonos|partner|alexa|google_home|speaker/.test(p)) return 'Speakers & cast'
  return 'Other'
}
