import { formatNumber, formatPercent } from '../lib/format'
import type { Play } from '../types'
import type { AppleFile } from './appleFiles'
import { csvReader, headerKey, readCsv } from './csv'
import { dayNumber, UNMATCHED_ARTIST } from './stats'

/*
 * Turns an Apple Music privacy export into the same Play[] a Spotify export gives.
 *
 * Plays come from "Apple Music Play Activity.csv", one row per playback event.
 * It differs from Spotify's export in three ways that shape this file:
 *
 * - Current exports leave its artist column empty. Artists are found by matching
 *   song titles against the export's other files, which name tracks as
 *   "Artist - Title", and the library file, which has them separately.
 * - Pausing or seeking splits one listen into several events, which are joined
 *   back into one.
 * - Apple adds and reorders columns between export versions, so columns are
 *   found by name.
 *
 * Only the columns below are read. The file also holds IP addresses and account
 * and device identifiers, which never leave the CSV parser.
 */

const PLAY_COLUMNS = [
  'Event Type',
  'Event Start Timestamp',
  'Event End Timestamp',
  'Play Duration Milliseconds',
  'Media Duration In Milliseconds',
  'Start Position In Milliseconds',
  'Song Name',
  // What older exports call the song
  'Content Name',
  'Album Name',
  'Container Album Name',
  'Artist Name',
  'Container Artist Name',
  'Container Type',
  'End Reason Type',
  'Offline',
  'Build Version',
  // What older rows, which leave Build Version empty, say about the device instead
  'Device Type',
  'Device OS Name',
  'Source Type',
  'Media Type',
  // Only newer rows fill this in
  'Shuffle Play',
] as const

type PlayRow = Record<(typeof PLAY_COLUMNS)[number], string>

/** Events of the same song this close together are one listen, split by a pause or a seek */
const JOIN_GAP_MS = 30_000
/** An event that starts this far into the song carries on a listen; one that starts earlier is the song starting over */
const RESTART_MS = 1_000
/** An album fills in a missing artist only when one artist has at least this share of its plays */
const ALBUM_SHARE = 0.75
/** Two lengths this close are one recording, since releases of the same master can differ by a second or two */
const SAME_LENGTH_MS = 3_000
/** Below this share of plays with an artist, the loader warns */
const COVERAGE_WARNING = 0.9

/**
 * Apple's end reasons in Spotify's terms, so isSkip() and everything built on it
 * treat both services alike. Any others are kept, lowercased.
 */
const END_REASONS: Record<string, string> = {
  NATURAL_END_OF_TRACK: 'trackdone',
  TRACK_SKIPPED_FORWARDS: 'fwdbtn',
  TRACK_SKIPPED_BACKWARDS: 'backbtn',
  MANUALLY_SELECTED_PLAYBACK_OF_A_DIFF_ITEM: 'clickrow',
  PLAYBACK_MANUALLY_PAUSED: 'endplay',
}

/** One playback event, or several joined into one listen */
export interface AppleEvent {
  song: string
  album: string
  /** The artist named in the row itself, which only older exports fill in */
  artist: string
  /**
   * The album artist when the song was played from an album. Otherwise only a hint:
   * it's checked against the other files first, since a playlist's "artist" can be its curator.
   */
  containerArtist: string
  /** Played from the album the song is on, so containerArtist really is that album's artist */
  fromAlbum: boolean
  start: number
  end: number
  played: number
  /** Track length; 0 when unknown */
  length: number
  /** How far into the track the event started; -1 when unknown */
  position: number
  endReason: string
  offline: boolean
  /** null where the row doesn't say */
  shuffle: boolean | null
  device: string
}

/** What one play activity file held */
export interface PlayActivity {
  events: AppleEvent[]
  /** Its header has a song and a time, so it really is a play activity */
  valid: boolean
  noEndReasons: boolean
  skippedRows: number
  videoRows: number
}

export interface PlayActivityReader {
  /** Reads the next piece of the file, which can end anywhere */
  push(text: string): void
  /** How many events have been kept so far */
  events(): number
  end(): PlayActivity
}

interface Description {
  text: string
  /** The album it was played from, from Recently Played; '' when the file doesn't say */
  album: string
  /** The day it was played; null for files without dates */
  day: number | null
}

interface LibraryTrack {
  title: string
  artist: string
  album: string
  /** In ms; 0 when the library doesn't say */
  length: number
}

/** Everything read from an export's Apple Music files, before plays are built from it */
interface AppleParts {
  events: AppleEvent[]
  descriptions: Description[]
  /** Days Daily Tracks has anything on. It can start long after the play activity, so it may say nothing about a listen's day. */
  dailyDays: Set<number>
  library: LibraryTrack[]
  filesRead: string[]
  hasPlayActivity: boolean
  /** The play activity had no End Reason Type column, so skips can't be told apart */
  noEndReasons: boolean
  /** Playback rows with no song or no usable time, such as radio shows */
  skippedRows: number
  /** Music video plays, left out like Spotify's video history */
  videoRows: number
}

export interface AppleLoad {
  plays: Play[]
  filesRead: string[]
  skippedRows: number
  duplicateRows: number
  unmatchedArtists: number
}

interface AppleContext {
  /** Spotify plays dropped alongside, so a song both services played counts as one song */
  spotify?: Play[]
  /** The loader couldn't use an Apple Music file and said so, which explains a missing play activity */
  skippedFiles?: boolean
}

/** Reads every Apple Music file found in the dropped files and builds plays from them */
export function loadApple(files: AppleFile[], warnings: string[], { spotify = [], skippedFiles = false }: AppleContext = {}): AppleLoad {
  const parts = readAppleFiles(files, warnings)
  if (!parts.hasPlayActivity) {
    if (!skippedFiles) {
      warnings.push(
        'Apple Music Play Activity.csv wasn’t found, and it’s the file that holds your plays. Drop the whole Apple Media Services zip (every part, if it came in several).',
      )
    }
    return { plays: [], filesRead: parts.filesRead, skippedRows: 0, duplicateRows: 0, unmatchedArtists: 0 }
  }

  const built = buildPlays(parts)
  shareSpotifyIds(built.plays, spotify)
  const count = built.plays.length
  if (parts.videoRows > 0) {
    const n = parts.videoRows
    warnings.push(`${formatNumber(n)} Apple Music video play${n === 1 ? '' : 's'} left out (video history isn’t supported yet)`)
  }
  if (parts.noEndReasons && count > 0) {
    warnings.push('Apple Music Play Activity.csv doesn’t say which songs were skipped, so skips show as 0%.')
  }
  if (count > 0 && built.unmatchedArtists / count > 1 - COVERAGE_WARNING) {
    warnings.push(
      `${formatPercent(built.unmatchedArtists / count)} of Apple Music plays had no artist anywhere in the export. Artists come from the export’s other Apple Music files, so drop the whole zip rather than the play activity alone.`,
    )
  }
  return { ...built, filesRead: parts.filesRead, skippedRows: parts.skippedRows }
}

// ---------- Reading ----------

function readAppleFiles(files: AppleFile[], warnings: string[]): AppleParts {
  const parts: AppleParts = {
    events: [],
    descriptions: [],
    dailyDays: new Set(),
    library: [],
    filesRead: [],
    hasPlayActivity: false,
    noEndReasons: false,
    skippedRows: 0,
    videoRows: 0,
  }
  for (const f of files) {
    const ok =
      f.kind === 'playActivity'
        ? addPlayActivity(f.activity, parts)
        : f.kind === 'library'
          ? readLibrary(f.text, parts)
          : readDescriptions(f.text, f.kind === 'trackHistory' ? 'Track Name' : 'Track Description', parts)
    if (ok) parts.filesRead.push(f.name)
    else warnings.push(`${f.name}: doesn’t look like the Apple Music file it’s named after`)
  }
  return parts
}

/**
 * Parses a play activity as it's read. Apple keeps every play in this one file, which
 * for a heavy listener can be longer than the longest string a browser will hold.
 */
export function playActivityReader(): PlayActivityReader {
  const activity: PlayActivity = { events: [], valid: false, noEndReasons: false, skippedRows: 0, videoRows: 0 }
  const own = stringPool()
  const csv = csvReader(PLAY_COLUMNS, (row) => {
    const event = toEvent(row, own)
    if (event === null) activity.skippedRows++
    else if (event === 'video') activity.videoRows++
    else if (event) activity.events.push(event)
  })
  return {
    push: csv.push,
    events: () => activity.events.length,
    end: () => {
      const found = csv.end()
      const hasSong = found.has('Song Name') || found.has('Content Name')
      const hasTime = found.has('Event Start Timestamp') || found.has('Event End Timestamp')
      activity.valid = hasSong && hasTime
      activity.noEndReasons = !found.has('End Reason Type')
      return activity
    },
  }
}

function addPlayActivity(activity: PlayActivity, parts: AppleParts): boolean {
  if (!activity.valid) return false
  for (const e of activity.events) parts.events.push(e)
  parts.skippedRows += activity.skippedRows
  parts.videoRows += activity.videoRows
  parts.hasPlayActivity = true
  if (activity.noEndReasons) parts.noEndReasons = true
  return true
}

/**
 * Hands back one lasting copy of each distinct string. Browsers can make a string cut
 * from a longer one point into it instead of copying, so without this one kept song
 * title holds its whole piece of the file in memory, and between them every piece.
 * Sharing the copies also means a song played a thousand times is stored once.
 */
export function stringPool(): (s: string) => string {
  const pool = new Map<string, string>()
  return (s) => {
    let own = pool.get(s)
    if (own === undefined) {
      own = JSON.parse(JSON.stringify(s)) as string
      pool.set(own, own)
    }
    return own
  }
}

/**
 * An event, null for a playback with nothing to identify it, 'video' for a music video,
 * or undefined for a row that isn't a playback
 */
function toEvent(row: PlayRow, own: (s: string) => string): AppleEvent | 'video' | null | undefined {
  const type = row['Event Type']
  // Older exports have no event type; newer ones also log lyric views and the like
  if (type && type !== 'PLAY_END') return undefined

  const song = row['Song Name'] || row['Content Name']
  const startTs = parseTime(row['Event Start Timestamp'])
  const endTs = parseTime(row['Event End Timestamp'])
  if (!song || (startTs === null && endTs === null)) return null

  let played = toMs(row['Play Duration Milliseconds'])
  if (played === null) played = startTs !== null && endTs !== null ? Math.max(0, endTs - startTs) : 0
  // No listening at all (a track that failed to load, a queue change) isn't a play
  if (played === 0) return undefined
  // Spotify's video history isn't read either, so both services count only listening
  if (/^video$/i.test(row['Media Type'])) return 'video'

  const start = startTs ?? (endTs as number) - played
  const artist = row['Artist Name']
  const containerArtist = row['Container Artist Name']
  return {
    song: own(song),
    album: own(row['Album Name'] || row['Container Album Name']),
    // "Various Artists" names no one, so the song's artist is looked up like a missing one
    artist: isPlaceholderArtist(artist) ? '' : own(artist),
    containerArtist: isPlaceholderArtist(containerArtist) ? '' : own(containerArtist),
    fromAlbum: playedFromAlbum(row),
    start,
    end: endTs !== null && endTs >= start ? endTs : start + played,
    played,
    length: toMs(row['Media Duration In Milliseconds']) ?? 0,
    position: toMs(row['Start Position In Milliseconds']) ?? -1,
    endReason: own(row['End Reason Type']),
    offline: /^(true|yes|1)$/i.test(row['Offline']),
    shuffle: readShuffle(row['Shuffle Play']),
    device: own(deviceText(row)),
  }
}

/**
 * Whether the row's container is the album the song is on. Apple doesn't document
 * Container Type's values, so one that names no kind of container (or an empty one)
 * falls back on the container's album being the song's own.
 */
function playedFromAlbum(row: PlayRow): boolean {
  const type = row['Container Type']
  if (/[a-z]/i.test(type)) return /album/i.test(type)
  const container = row['Container Album Name']
  return container !== '' && (!row['Album Name'] || titleKey(container) === titleKey(row['Album Name']))
}

/**
 * Shuffle Play is SHUFFLE_OFF, or a SHUFFLE_ value naming how it shuffled. Older rows
 * leave it empty, and those plays are left out of shuffle stats rather than counted as off.
 */
function readShuffle(s: string): boolean | null {
  if (/^(shuffle_?off|false)$/i.test(s)) return false
  if (/^shuffle_/i.test(s) ? !/unknown|not_?applicable/i.test(s) : /^true$/i.test(s)) return true
  return null
}

/** Build Version, or for rows that leave it empty, what Device Type and the like say */
function deviceText(row: PlayRow): string {
  if (row['Build Version']) return row['Build Version']
  const source = /^originating_device$/i.test(row['Source Type']) ? '' : row['Source Type']
  return [row['Device Type'], row['Device OS Name'], source]
    .filter((v) => v && !/^(unknown|unidentified|n\/?a$)/i.test(v))
    .join(' ')
    .replaceAll('_', ' ')
}

const DESCRIPTION_COLUMNS = ['Date Played', 'Last Event End Timestamp', 'Container Type', 'Container Description'] as const

function readDescriptions(text: string, column: 'Track Description' | 'Track Name', parts: AppleParts): boolean {
  const found = readCsv(text, [column, ...DESCRIPTION_COLUMNS], (row) => {
    const description = row[column]
    if (!description) return
    const played = parseDay(row['Date Played'])
    if (played !== null) parts.dailyDays.add(played)
    const last = parseTime(row['Last Event End Timestamp'])
    parts.descriptions.push({
      text: description,
      album: /^album$/i.test(row['Container Type']) ? row['Container Description'] : '',
      day: played ?? (last === null ? null : dayNumber(new Date(last))),
    })
  })
  return found.has(column)
}

function readLibrary(text: string, parts: AppleParts): boolean {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return false
  }
  if (!Array.isArray(data)) return false
  for (const t of data) {
    if (typeof t !== 'object' || t === null) continue
    // Keys are matched like CSV headers, so "Title" and "title" both count
    const fields = new Map(Object.entries(t).map(([k, v]) => [headerKey(k), v]))
    const [title, artist, album] = ['Title', 'Artist', 'Album'].map((k) => {
      const v = fields.get(headerKey(k))
      return typeof v === 'string' ? v : ''
    })
    const length = toMs(String(fields.get(headerKey('Track Duration')) ?? '')) ?? 0
    if (title && artist) parts.library.push({ title, artist, album, length })
  }
  return true
}

const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i

/**
 * Apple's timestamps are ISO 8601 in UTC ("2024-03-14T09:00:00.123Z"). They're read
 * by hand rather than with Date.parse, which browsers only agree on for that exact
 * form, so other export versions can differ a little and still work: a space for the
 * T, no seconds, any number of decimals, "+0000" or " UTC" for the zone, or a count of
 * milliseconds or seconds since 1970. One without a zone is read as UTC too, not as
 * local time.
 */
export function parseTime(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{9,13}(\.\d+)?$/.test(s)) {
    const n = Number(s)
    // Below 1e11 it's seconds (until the year 5138), above it milliseconds (from 1973)
    return Math.round(n < 1e11 ? n * 1000 : n)
  }
  const m = ISO_TIME.exec(s)
  if (!m) {
    // Anything else counts only if it names its zone, so it can't be misread as local time
    const t = /(z|gmt|utc|[+-]\d{2}:?\d{2})$/i.test(s) ? Date.parse(s) : NaN
    return Number.isNaN(t) ? null : t
  }
  const [, y, mo, d, h, mi, sec = '0', frac = '0', zone = 'Z'] = m
  if (!validDate(+y, +mo, +d) || +h > 23 || +mi > 59 || +sec > 60) return null
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, Math.round(Number(`0.${frac}`) * 1000))
  const offset = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone)
  return offset ? t - (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * 60_000 : t
}

/** Daily Tracks dates look like 20240314; 2024-03-14 or 2024/3/14, with or without a time after, work too */
export function parseDay(raw: string): number | null {
  const m = /^(\d{4})(?:(\d{2})(\d{2})|[-/.](\d{1,2})[-/.](\d{1,2}))(?!\d)/.exec(raw.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2] ?? m[4]), Number(m[3] ?? m[5])]
  return validDate(y, mo, d) ? dayNumber(new Date(y, mo - 1, d)) : null
}

/** Whether a 1-based month and day exist, so "2024-02-30" isn't quietly read as March 1 */
function validDate(y: number, mo: number, d: number): boolean {
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

function toMs(s: string): number | null {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

// ---------- Building plays ----------

function buildPlays(parts: AppleParts): { plays: Play[]; duplicateRows: number; unmatchedArtists: number } {
  const { events, duplicates } = dedupe(parts.events)
  const listens = joinListens(events)
  const artists = resolveArtists(listens, parts)
  // A name found in another file is cut from that file's text, which shouldn't stay in memory for it
  const own = stringPool()
  let unmatchedArtists = 0
  const plays = listens.map((l, i) => {
    const artist = artists[i]
    if (artist === null) unmatchedArtists++
    return listenToPlay(l, own(artist ?? UNMATCHED_ARTIST))
  })
  return { plays, duplicateRows: duplicates, unmatchedArtists }
}

/** Drops events seen more than once, e.g. the same export dropped twice, before they're joined */
function dedupe(events: AppleEvent[]): { events: AppleEvent[]; duplicates: number } {
  const seen = new Set<string>()
  const out: AppleEvent[] = []
  for (const e of events) {
    const key = `${e.start}|${e.end}|${e.song}|${e.album}|${e.played}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return { events: out, duplicates: events.length - out.length }
}

/** Joins the events a pause or a seek split a listen into */
function joinListens(events: AppleEvent[]): AppleEvent[] {
  const sorted = [...events].sort((a, b) => a.start - b.start)
  const out: AppleEvent[] = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (last && continues(last, e)) {
      out[out.length - 1] = {
        ...last,
        end: Math.max(last.end, e.end),
        played: last.played + e.played,
        length: Math.max(last.length, e.length),
        // How the listen ended is how its last part ended
        endReason: e.endReason,
        offline: e.offline,
        shuffle: last.shuffle ?? e.shuffle,
        artist: last.artist || e.artist,
        containerArtist: last.containerArtist || e.containerArtist,
        fromAlbum: last.fromAlbum || e.fromAlbum,
      }
    } else {
      out.push(e)
    }
  }
  return out
}

/** Whether `e` carries on the listen `last` was cut from, rather than being a new play */
function continues(last: AppleEvent, e: AppleEvent): boolean {
  return (
    e.song === last.song &&
    e.album === last.album &&
    e.start - last.end <= JOIN_GAP_MS &&
    // A song that played to its end and starts again is on repeat, not resumed
    last.endReason !== 'NATURAL_END_OF_TRACK' &&
    // ...and so is one that starts again from the top
    (e.position < 0 || e.position >= RESTART_MS)
  )
}

function listenToPlay(l: AppleEvent, artist: string): Play {
  // Seeking back can add up to more than the track; without a length, the wall clock is the limit
  const limit = l.length > 0 ? l.length : l.end > l.start ? l.end - l.start : Infinity
  const msPlayed = Math.min(l.played, limit)
  return {
    endTime: l.start + msPlayed,
    msPlayed,
    kind: 'track',
    title: l.song,
    artist,
    album: l.album,
    uri: '',
    platform: appleDevice(l.device),
    country: '',
    reasonStart: '',
    reasonEnd: END_REASONS[l.endReason] ?? l.endReason.toLowerCase(),
    shuffle: l.shuffle,
    skipped: l.endReason === 'TRACK_SKIPPED_FORWARDS',
    offline: l.offline,
    incognito: false,
  }
}

/**
 * Gives Apple Music plays the Spotify track ID of the same song, where Spotify's
 * export has one with the same artist and title. Songs are told apart by track ID
 * when there is one (trackKey), so without it a song played on both services would
 * count as two. Where Spotify has several IDs for a song (a single and its album),
 * the most played one wins.
 */
export function shareSpotifyIds(plays: Play[], spotify: Play[]) {
  if (spotify.length === 0) return
  const ids = new Map<string, Map<string, number>>()
  for (const p of spotify) {
    if (p.kind !== 'track' || !p.uri) continue
    const key = songKey(p)
    const counts = ids.get(key) ?? new Map<string, number>()
    ids.set(key, counts)
    counts.set(p.uri, (counts.get(p.uri) ?? 0) + 1)
  }
  const best = new Map<string, string>()
  for (const [key, counts] of ids) {
    let top = ''
    for (const [uri, n] of counts) {
      const topN = counts.get(top) ?? 0
      if (n > topN || (n === topN && uri < top)) top = uri
    }
    best.set(key, top)
  }
  for (const p of plays) p.uri = best.get(songKey(p)) ?? p.uri
}

function songKey(p: Play): string {
  return `${titleKey(p.artist)}|${titleKey(p.title)}`
}

/**
 * Groups Apple's "Build Version" strings (the app and OS that played the song)
 * into the same families as Spotify's platforms, plus Apple's own devices.
 */
export function appleDevice(build: string): string {
  const b = build.toLowerCase()
  if (!b) return 'Unknown'
  if (/watchos|\bwatch/.test(b)) return 'Apple Watch'
  if (/tvos|apple ?tv/.test(b)) return 'Apple TV'
  if (/audioos|homepod|audioaccessory|amazon|alexa|sonos/.test(b)) return 'Speakers & cast'
  // Before the OSes: the web player's strings name the computer's OS too
  if (/musickit|music\.apple\.com|\bweb\b|chrome|firefox|safari/.test(b)) return 'Web'
  if (/iphone|ipad|ipod|\bios\b/.test(b)) return 'iOS'
  if (/macos|mac os|macintosh|\bos ?x\b/.test(b)) return 'macOS'
  if (/windows/.test(b)) return 'Windows'
  if (/android/.test(b)) return 'Android'
  return 'Other'
}

// ---------- Finding artists ----------

/** What the export says about one artist having a song with a given title */
interface Evidence {
  /** As first spelled: library files first, since they're the tidiest */
  name: string
  /** How many times the export pairs this artist with the title */
  count: number
  /** Albums the library files it under */
  albums: Set<string>
  /** Days Daily Tracks has it played */
  days: Set<number>
  /** Its length in ms, from the library and from plays the export ties to this artist */
  lengths: Set<number>
}

/** What's known of a listen when an artist is weighed against it */
interface ListenFacts {
  /** The title key of its album */
  album: string
  day: number
  length: number
}

/** Title key → artist key → evidence */
type ArtistIndex = Map<string, Map<string, Evidence>>

/** Album key → artist key → how many times that artist is given for that album */
type AlbumVotes = Map<string, Map<string, { name: string; count: number }>>

/**
 * The artist for each listen, or null where the export doesn't say. In order:
 *
 * 1. The row's own Artist Name (older exports).
 * 2. The row's album artist, when the export pairs it with the title.
 * 3. The only artist the export ever pairs with the title, which settles most songs,
 *    unless the row names a different album artist or the export places that artist's
 *    song on another album, or on other days when Daily Tracks covers this listen's day.
 *    Neither counts if the song is this listen's length, which makes it the same recording.
 *    For a title several artists have, the one the library files under the same album.
 * 4. What's still open is settled once the clear cases have shown which artist each
 *    album belongs to. Titles with no match at all try again with "(feat. ...)",
 *    "[Live]" and " - Remastered" trimmed off, which only counts if nothing says otherwise.
 *    A candidate the row's album artist names wins, then the row's album artist when the
 *    rest of the album agrees with it (the other files can miss one artist's version of
 *    a title). Next, the artist of the album the row was played from, unless a candidate
 *    is tied to this listen by its album, its day or its length, which means the song is credited
 *    to someone other than the album (a compilation, a soundtrack). Then that album's artist
 *    if it's a candidate, a candidate tied to the listen, one the export doesn't place
 *    anywhere else, the album's artist even if it isn't a candidate, and the candidate
 *    seen most often. With no candidates at all it's the artist of the album the row was
 *    played from, the album's artist, then the row's album artist, which on its own could
 *    be a playlist's curator and so comes last.
 *
 * A name is only ever moved off a title's only match by something the export says about
 * that listen. A song played from a playlist with nothing else to go on keeps that match.
 *
 * Every name is then spelled the way the export spells that artist (the library's
 * spelling first), so "The Weeknd" and "the weeknd" stay one artist.
 */
function resolveArtists(listens: AppleEvent[], parts: Pick<AppleParts, 'library' | 'descriptions' | 'dailyDays'>): (string | null)[] {
  const known = new Set(listens.map((l) => titleKey(l.song)))
  const knownLoose = new Set(listens.map((l) => looseKey(l.song)).filter(Boolean))
  const exact: ArtistIndex = new Map()
  const loose: ArtistIndex = new Map()
  const spellings: Spellings = new Map()

  const learn = (title: string, artist: string, album: string, day: number | null, length: number, fromLibrary: boolean) => {
    artist = artist.trim()
    if (!title.trim() || !artist || isPlaceholderArtist(artist)) return
    addEvidence(exact, titleKey(title), artist, album, day, length)
    const lk = looseKey(title)
    if (lk) addEvidence(loose, lk, artist, album, day, length)
    addSpelling(spellings, artist, fromLibrary)
  }
  for (const t of parts.library) learn(t.title, t.artist, t.album, null, t.length, true)
  const described: { split: [string, string]; album: string }[] = []
  for (const d of parts.descriptions) {
    const split = splitDescription(d.text, known, knownLoose)
    if (!split) continue
    const album = albumOf(d.album, split[0])
    learn(split[1], split[0], album, d.day, 0, false)
    if (album) described.push({ split, album })
  }

  // Album → artist key → plays, from the library and from every listen settled so far
  const albumVotes: AlbumVotes = new Map()
  // What rows played from an album say about it, apart from the votes: "the rest of the album agrees" can't be the row agreeing with itself
  const albumCredits: AlbumVotes = new Map()
  const voteIn = (ballots: AlbumVotes) => (album: string, artist: string) => {
    const a = titleKey(album)
    if (!a) return
    const votes = ballots.get(a) ?? new Map<string, { name: string; count: number }>()
    ballots.set(a, votes)
    const k = titleKey(artist)
    const v = votes.get(k) ?? { name: artist, count: 0 }
    v.count++
    votes.set(k, v)
  }
  const vote = voteIn(albumVotes)
  const credit = voteIn(albumCredits)
  for (const t of parts.library) if (!isPlaceholderArtist(t.artist)) vote(t.album, t.artist.trim())
  // Recently Played pairs an artist with an album as surely as the library does
  for (const { split, album } of described) if (!isPlaceholderArtist(split[0])) vote(album, split[0].trim())

  const result: (string | null)[] = listens.map(() => null)
  const open: number[] = []
  // Held back until this pass is over, so a listen's answer doesn't depend on which plays came before it
  const heard: [Evidence, number][] = []
  listens.forEach((l, i) => {
    const candidates = exact.get(titleKey(l.song))
    const sure = clearArtist(l, candidates, parts.dailyDays)
    if (sure) {
      result[i] = sure
      vote(l.album, sure)
      // A play nothing ties to this artist could be someone else's song of that name, at some other length
      const evidence = candidates?.get(titleKey(sure))
      if (evidence && l.length > 0 && tiedToListen(evidence, factsOf(l))) heard.push([evidence, l.length])
    } else {
      open.push(i)
      // Whoever this listen turns out to be by, its row knows who the album is by
      if (l.fromAlbum && l.containerArtist) credit(l.album, l.containerArtist)
    }
  })
  for (const [evidence, length] of heard) evidence.lengths.add(length)

  for (const i of open) {
    const l = listens[i]
    const listen = factsOf(l)
    const agreed = mainArtist(albumVotes.get(listen.album))
    const albumArtist = agreed ?? mainArtist(albumCredits.get(listen.album))
    // Only a row played from the album itself can be sure: any other row's "artist" could be a curator
    const credited = l.fromAlbum ? l.containerArtist : ''
    const candidates = exact.get(titleKey(l.song)) ?? believableLooseMatches(loose.get(looseKey(l.song)), credited, listen)
    if (!candidates) {
      result[i] = credited || albumArtist || l.containerArtist || null
      continue
    }
    const container = l.containerArtist ? titleKey(l.containerArtist) : null
    const named = container === null ? undefined : candidates.get(container)
    if (named) result[i] = named.name
    // The row and the rest of the album agree, so the title's other artists have a different song of that name
    else if (agreed !== null && titleKey(agreed) === container) result[i] = agreed
    else result[i] = settle(candidates, credited, albumArtist, listen, parts.dailyDays)
  }
  return result.map((name) => (name === null ? null : bestSpelling(spellings, name)))
}

/** The artist for a listen whose title has candidates, none of which the row itself names */
function settle(candidates: Map<string, Evidence>, credited: string, albumArtist: string | null, listen: ListenFacts, dailyDays: Set<number>): string {
  const tied = new Map([...candidates].filter(([, e]) => tiedToListen(e, listen)))
  if (credited && tied.size === 0) return credited
  const onAlbum = albumArtist === null ? undefined : candidates.get(titleKey(albumArtist))
  if (onAlbum) return onAlbum.name
  if (tied.size > 0) return bestCandidate(tied, listen.day)
  // Albums share names, so the rest of one only outweighs a candidate the export has somewhere else
  const unplaced = new Map([...candidates].filter(([, e]) => !ruledOut(e, listen, dailyDays)))
  if (unplaced.size > 0) return bestCandidate(unplaced, listen.day)
  return albumArtist ?? bestCandidate(candidates, listen.day)
}

/**
 * The matches on a trimmed title that can be believed. "Home (Acoustic)" isn't "Home" just
 * because no file has the acoustic one, so a match has to fit what's known of the listen,
 * and against the album the row was played from it has to be on that very album.
 */
function believableLooseMatches(found: Map<string, Evidence> | undefined, credited: string, listen: ListenFacts): Map<string, Evidence> | undefined {
  if (!found) return undefined
  const kept = [...found].filter(([, e]) => (credited ? e.albums.has(listen.album) : !placedElsewhere(e, listen)))
  return kept.length > 0 ? new Map(kept) : undefined
}

function factsOf(l: AppleEvent): ListenFacts {
  return { album: titleKey(l.album), day: dayNumber(new Date(l.start)), length: l.length }
}

function near(days: Set<number>, day: number): boolean {
  return days.has(day) || days.has(day - 1) || days.has(day + 1)
}

function playedNear(e: Evidence, day: number): boolean {
  return near(e.days, day)
}

function sameLength(e: Evidence, length: number): boolean {
  if (length <= 0) return false
  for (const known of e.lengths) if (Math.abs(known - length) <= SAME_LENGTH_MS) return true
  return false
}

/** The export has this artist's song on this listen's album, played within a day of it, or at its length */
function tiedToListen(e: Evidence, { album, day, length }: ListenFacts): boolean {
  return (album !== '' && e.albums.has(album)) || playedNear(e, day) || sameLength(e, length)
}

/** The export says where or when this artist's song was, and none of it fits this listen */
function placedElsewhere(e: Evidence, listen: ListenFacts): boolean {
  return !tiedToListen(e, listen) && (e.days.size > 0 || (listen.album !== '' && e.albums.size > 0))
}

/**
 * Whether the export counts against a title's exact match for this listen. Another album
 * does. Other days only do if Daily Tracks covers this day, since a song it has on other
 * days could have been played on one it doesn't cover, and Recently Played only has a
 * song's last play.
 */
function ruledOut(e: Evidence, listen: ListenFacts, dailyDays: Set<number>): boolean {
  return placedElsewhere(e, listen) && ((listen.album !== '' && e.albums.size > 0) || near(dailyDays, listen.day))
}

interface Spelling {
  name: string
  library: number
  count: number
}

/** Artist key → each way the export spells that artist, with how often */
type Spellings = Map<string, Map<string, Spelling>>

function addSpelling(spellings: Spellings, artist: string, fromLibrary: boolean) {
  const key = titleKey(artist)
  const forms = spellings.get(key) ?? new Map<string, Spelling>()
  spellings.set(key, forms)
  const f = forms.get(artist) ?? { name: artist, library: 0, count: 0 }
  f.count++
  if (fromLibrary) f.library++
  forms.set(artist, f)
}

/** The library's usual spelling of an artist, else the export's, then alphabetical, so file order never matters */
function bestSpelling(spellings: Spellings, artist: string): string {
  let best: Spelling | null = null
  for (const f of spellings.get(titleKey(artist))?.values() ?? []) {
    const better =
      !best ||
      (f.library !== best.library ? f.library > best.library : f.count !== best.count ? f.count > best.count : f.name < best.name)
    if (better) best = f
  }
  return best ? best.name : artist
}

/** The artist when the evidence leaves no doubt, otherwise null */
function clearArtist(l: AppleEvent, candidates: Map<string, Evidence> | undefined, dailyDays: Set<number>): string | null {
  if (l.artist) return l.artist
  // An album artist alone could be a playlist's curator, and a looser title match may know better
  if (!candidates) return null
  const container = l.containerArtist && candidates.get(titleKey(l.containerArtist))
  if (container) return container.name
  const album = titleKey(l.album)
  if (candidates.size === 1) {
    // A different album artist on the row could mean another artist's song of the same name, and so could
    // the song being on another album or other days, if the rest of the album turns out to say so
    const lone = only(candidates)
    return l.containerArtist || ruledOut(lone, factsOf(l), dailyDays) ? null : lone.name
  }
  const onAlbum = album ? [...candidates.values()].filter((e) => e.albums.has(album)) : []
  return onAlbum.length === 1 ? onAlbum[0].name : null
}

function bestCandidate(candidates: Map<string, Evidence>, day: number): string {
  let best: Evidence | null = null
  for (const e of candidates.values()) {
    const better =
      !best ||
      (playedNear(e, day) !== playedNear(best, day)
        ? playedNear(e, day)
        : e.count !== best.count
          ? e.count > best.count
          : e.name < best.name)
    if (better) best = e
  }
  return (best as Evidence).name
}

/** The artist with most of an album's plays, if one clearly leads */
function mainArtist(votes: ReturnType<AlbumVotes['get']>): string | null {
  if (!votes) return null
  let total = 0
  let top: { name: string; count: number } | null = null
  for (const v of votes.values()) {
    total += v.count
    if (!top || v.count > top.count || (v.count === top.count && v.name < top.name)) top = v
  }
  return top && top.count / total >= ALBUM_SHARE ? top.name : null
}

function addEvidence(index: ArtistIndex, title: string, artist: string, album: string, day: number | null, length: number) {
  const artists = index.get(title) ?? new Map<string, Evidence>()
  index.set(title, artists)
  const key = titleKey(artist)
  const e = artists.get(key) ?? { name: artist, count: 0, albums: new Set<string>(), days: new Set<number>(), lengths: new Set<number>() }
  e.count++
  if (album) e.albums.add(titleKey(album))
  if (day !== null) e.days.add(day)
  if (length > 0) e.lengths.add(length)
  artists.set(key, e)
}

/**
 * Splits "Artist - Title". Either side can hold " - " ("Song - Remastered 2011"),
 * so the split kept is the one whose title is a song in the play activity, trying
 * longer titles first; otherwise the first " - ", since artists rarely have one.
 */
export function splitDescription(text: string, known: Set<string>, knownLoose: Set<string>): [artist: string, title: string] | null {
  const cuts = [...text.matchAll(/\s[-–—]\s/g)]
  if (cuts.length === 0) return null
  const at = (m: RegExpExecArray): [string, string] => [text.slice(0, m.index).trim(), text.slice(m.index + m[0].length).trim()]
  for (const m of cuts) {
    const split = at(m)
    if (known.has(titleKey(split[1]))) return split
  }
  for (const m of cuts) {
    const split = at(m)
    if (knownLoose.has(looseKey(split[1]))) return split
  }
  return at(cuts[0])
}

/**
 * The album in Recently Played's Container Description, which reads "Artist - Album".
 * It's only used when the artist is the track's own: otherwise there's no telling
 * where the artist ends, so it's left out.
 */
function albumOf(container: string, artist: string): string {
  const artistKey = titleKey(artist)
  for (const m of container.matchAll(/\s[-–—]\s/g)) {
    if (titleKey(container.slice(0, m.index)) === artistKey) return container.slice(m.index + m[0].length).trim()
  }
  return ''
}

/** A title for matching: case, Unicode forms, curly quotes, dash styles and spacing don't count */
export function titleKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Brackets at the end of a title, which say which version it is. Anywhere else they're the title: "(Don't Fear) The Reaper". */
const TRAILING_BRACKETS = /(\s*[([][^)\]]*[)\]])+$/

/** A looser key: "Song (feat. X)", "Song [Live]" and "Song - 2011 Remaster" all become "song" */
export function looseKey(s: string): string {
  return titleKey(s)
    .replace(TRAILING_BRACKETS, '')
    .replace(/\s+-\s.*$/, '')
    .replace(TRAILING_BRACKETS, '')
    .replace(/\s+(feat|ft|featuring)\b.*$/, '')
    .trim()
}

/** Names that stand for many artists, or none, and so say nothing about a song's artist */
function isPlaceholderArtist(name: string): boolean {
  return /^(various artists?|various|apple music|unknown artist)$/i.test(name.trim())
}

function only<T>(map: Map<string, T>): T {
  return map.values().next().value as T
}
