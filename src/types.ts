/**
 * One row of Spotify's Extended Streaming History export
 * (Streaming_History_Audio_*.json). A row is a music track, a podcast
 * episode, or an audiobook chapter; Spotify sets the other kinds' fields to null.
 *
 * The export also includes ip_addr, user_agent, username and similar fields.
 * They're left out of this type on purpose, and toPlay() never copies them.
 */
export interface RawStreamRecord {
  ts: string
  platform: string | null
  ms_played: number
  conn_country: string | null
  master_metadata_track_name: string | null
  master_metadata_album_artist_name: string | null
  master_metadata_album_album_name: string | null
  spotify_track_uri: string | null
  episode_name: string | null
  episode_show_name: string | null
  spotify_episode_uri: string | null
  audiobook_title?: string | null
  audiobook_uri?: string | null
  audiobook_chapter_title?: string | null
  audiobook_chapter_uri?: string | null
  reason_start: string | null
  reason_end: string | null
  shuffle: boolean | null
  skipped: boolean | null
  offline: boolean | null
  incognito_mode: boolean | null
}

export type PlayKind = 'track' | 'episode' | 'audiobook'

/** A cleaned-up stream. Every chart works from Play[]. */
export interface Play {
  /** When playback stopped, as epoch ms. Spotify's `ts` is the end time, not the start. */
  endTime: number
  msPlayed: number
  kind: PlayKind
  /** Track, episode, or chapter title */
  title: string
  /** Artist for tracks, show for episodes, book title for audiobooks */
  artist: string
  /** Album name; empty for episodes and audiobooks */
  album: string
  uri: string
  /** Normalized platform family, e.g. "iOS", "macOS", "Web" */
  platform: string
  country: string
  reasonStart: string
  reasonEnd: string
  shuffle: boolean
  skipped: boolean
  offline: boolean
  incognito: boolean
}

export interface LoadResult {
  plays: Play[]
  /** Names of the files the plays came from */
  filesRead: string[]
  /** Rows with no track/episode/audiobook info (e.g. local files), which are ignored */
  skippedRows: number
  /** Rows seen more than once, e.g. the same file dropped twice */
  duplicateRows: number
  warnings: string[]
}
