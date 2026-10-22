import { formatPercent } from '../lib/format'
import type { Play } from '../types'
import type { AppleText } from './appleFiles'
import { readCsv } from './csv'
import { dayNumber } from './stats'

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
  'End Reason Type',
  'Offline',
  'Build Version',
] as const

type PlayRow = Record<(typeof PLAY_COLUMNS)[number], string>

/** Events of the same song this close together are one listen, split by a pause or a seek */
const JOIN_GAP_MS = 30_000
/** An event that starts this far into the song carries on a listen; one that starts earlier is the song starting over */
const RESTART_MS = 1_000
/** An album fills in a missing artist only when one artist has at least this share of its plays */
const ALBUM_SHARE = 0.75
/** Below this share of plays with an artist, the loader warns */
const COVERAGE_WARNING = 0.9

export const UNKNOWN_ARTIST = 'Unknown artist'

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
interface AppleEvent {
  song: string
  album: string
  /** The artist named in the row itself, which only older exports fill in */
  artist: string
  /**
   * The album artist when the song was played from an album. Only a hint: it's
   * checked against the other files first, since a playlist's "artist" can be its curator.
   */
  containerArtist: string
  start: number
  end: number
  played: number
  /** Track length; 0 when unknown */
  length: number
  /** How far into the track the event started; -1 when unknown */
  position: number
  endReason: string
  offline: boolean
  device: string
}

interface Description {
  text: string
  /** The day it was played, from Daily Tracks; null for files without dates */
  day: number | null
}

interface LibraryTrack {
  title: string
  artist: string
  album: string
}

/** Everything read from an export's Apple Music files, before plays are built from it */
interface AppleParts {
  events: AppleEvent[]
  descriptions: Description[]
  library: LibraryTrack[]
  filesRead: string[]
  hasPlayActivity: boolean
  /** The play activity had no End Reason Type column, so skips can't be told apart */
  noEndReasons: boolean
  /** Playback rows with no song or no usable time, such as radio shows */
  skippedRows: number
}

export interface AppleLoad {
  plays: Play[]
  filesRead: string[]
  skippedRows: number
  duplicateRows: number
  unmatchedArtists: number
}

/** Reads every Apple Music file found in the dropped files and builds plays from them */
export function loadApple(files: AppleText[], warnings: string[]): AppleLoad {
  const parts = readAppleFiles(files, warnings)
  if (!parts.hasPlayActivity) {
    warnings.push(
      'Apple Music Play Activity.csv wasn’t found, and it’s the file that holds your plays. Drop the whole Apple Media Services zip (every part, if it came in several).',
    )
    return { plays: [], filesRead: parts.filesRead, skippedRows: 0, duplicateRows: 0, unmatchedArtists: 0 }
  }

  const built = buildPlays(parts)
  const count = built.plays.length
  if (parts.noEndReasons && count > 0) {
    warnings.push('Apple Music Play Activity.csv doesn’t say which songs were skipped, so skips show as 0%.')
  }
  if (count > 0 && built.unmatchedArtists / count > 1 - COVERAGE_WARNING) {
    warnings.push(
      `${formatPercent(built.unmatchedArtists / count)} of Apple Music plays had no artist anywhere in the export, so they show as “${UNKNOWN_ARTIST}”. Artists come from the export’s other Apple Music files, so drop the whole zip rather than the play activity alone.`,
    )
  }
  return { ...built, filesRead: parts.filesRead, skippedRows: parts.skippedRows }
}

// ---------- Reading ----------

function readAppleFiles(files: AppleText[], warnings: string[]): AppleParts {
  const parts: AppleParts = {
    events: [],
    descriptions: [],
    library: [],
    filesRead: [],
    hasPlayActivity: false,
    noEndReasons: false,
    skippedRows: 0,
  }
  for (const f of files) {
    const ok =
      f.kind === 'playActivity'
        ? readPlayActivity(f.text, parts)
        : f.kind === 'library'
          ? readLibrary(f.text, parts)
          : readDescriptions(f.text, f.kind === 'trackHistory' ? 'Track Name' : 'Track Description', parts)
    if (ok) parts.filesRead.push(f.name)
    else warnings.push(`${f.name}: doesn’t look like the Apple Music file it’s named after`)
  }
  return parts
}

function readPlayActivity(text: string, parts: AppleParts): boolean {
  const events: AppleEvent[] = []
  let skipped = 0
  const found = readCsv(text, PLAY_COLUMNS, (row) => {
    const event = toEvent(row)
    if (event === null) skipped++
    else if (event) events.push(event)
  })
  const hasSong = found.has('Song Name') || found.has('Content Name')
  const hasTime = found.has('Event Start Timestamp') || found.has('Event End Timestamp')
  if (!hasSong || !hasTime) return false

  for (const e of events) parts.events.push(e)
  parts.skippedRows += skipped
  parts.hasPlayActivity = true
  if (!found.has('End Reason Type')) parts.noEndReasons = true
  return true
}

/** An event, null for a playback with nothing to identify it, or undefined for a row that isn't a playback */
function toEvent(row: PlayRow): AppleEvent | null | undefined {
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

  const start = startTs ?? (endTs as number) - played
  const containerArtist = row['Container Artist Name']
  return {
    song,
    album: row['Album Name'] || row['Container Album Name'],
    artist: row['Artist Name'],
    containerArtist: isPlaceholderArtist(containerArtist) ? '' : containerArtist,
    start,
    end: endTs !== null && endTs >= start ? endTs : start + played,
    played,
    length: toMs(row['Media Duration In Milliseconds']) ?? 0,
    position: toMs(row['Start Position In Milliseconds']) ?? -1,
    endReason: row['End Reason Type'],
    offline: /^(true|yes|1)$/i.test(row['Offline']),
    device: row['Build Version'],
  }
}

function readDescriptions(text: string, column: 'Track Description' | 'Track Name', parts: AppleParts): boolean {
  const found = readCsv(text, [column, 'Date Played'], (row) => {
    if (row[column]) parts.descriptions.push({ text: row[column], day: parseDay(row['Date Played']) })
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
    const { Title, Artist, Album } = t as Record<string, unknown>
    if (typeof Title === 'string' && typeof Artist === 'string' && Title && Artist) {
      parts.library.push({ title: Title, artist: Artist, album: typeof Album === 'string' ? Album : '' })
    }
  }
  return true
}

/** Apple's timestamps are ISO 8601 in UTC. One without a zone is read as UTC too, not as local time. */
function parseTime(s: string): number | null {
  if (!s) return null
  const zoneless = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)
  const t = Date.parse(zoneless ? `${s.replace(' ', 'T')}Z` : s)
  return Number.isNaN(t) ? null : t
}

/** Daily Tracks dates look like 20240314 */
function parseDay(s: string): number | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s)
  return m ? dayNumber(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
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
  let unmatchedArtists = 0
  const plays = listens.map((l, i) => {
    const artist = artists[i]
    if (artist === null) unmatchedArtists++
    return listenToPlay(l, artist ?? UNKNOWN_ARTIST)
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
        artist: last.artist || e.artist,
        containerArtist: last.containerArtist || e.containerArtist,
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
    shuffle: null,
    skipped: l.endReason === 'TRACK_SKIPPED_FORWARDS',
    offline: l.offline,
    incognito: false,
  }
}

/**
 * Groups Apple's "Build Version" strings (the app and OS that played the song)
 * into the same families as Spotify's platforms, plus Apple's own devices.
 */
export function appleDevice(build: string): string {
  const b = build.toLowerCase()
  if (!b) return 'Unknown'
  if (/watchos|watch\d/.test(b)) return 'Apple Watch'
  if (/tvos|appletv/.test(b)) return 'Apple TV'
  if (/audioos|homepod|audioaccessory/.test(b)) return 'Speakers & cast'
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
}

/** Title key → artist key → evidence */
type ArtistIndex = Map<string, Map<string, Evidence>>

/**
 * The artist for each listen, or null where the export doesn't say. In order:
 *
 * 1. The row's own Artist Name (older exports).
 * 2. The only artist the export ever pairs with the title, which settles most songs.
 * 3. For a title several artists have, the one the row's album artist names, then
 *    the one the library files under the same album.
 * 4. What's still open is settled once the clear cases have shown which artist each
 *    album belongs to: that album's artist if it's a candidate, then an artist
 *    Daily Tracks has played that title within a day of the listen, then the one
 *    seen most often. Titles with no match at all try again with "(feat. ...)",
 *    "[Live]" and " - Remastered" trimmed off, then fall back to the album's artist.
 */
function resolveArtists(listens: AppleEvent[], parts: Pick<AppleParts, 'library' | 'descriptions'>): (string | null)[] {
  const known = new Set(listens.map((l) => titleKey(l.song)))
  const knownLoose = new Set(listens.map((l) => looseKey(l.song)).filter(Boolean))
  const exact: ArtistIndex = new Map()
  const loose: ArtistIndex = new Map()

  const learn = (title: string, artist: string, album: string, day: number | null) => {
    artist = artist.trim()
    if (!title.trim() || !artist || isPlaceholderArtist(artist)) return
    addEvidence(exact, titleKey(title), artist, album, day)
    const lk = looseKey(title)
    if (lk) addEvidence(loose, lk, artist, album, day)
  }
  for (const t of parts.library) learn(t.title, t.artist, t.album, null)
  for (const d of parts.descriptions) {
    const split = splitDescription(d.text, known, knownLoose)
    if (split) learn(split[1], split[0], '', d.day)
  }

  // Album → artist key → plays, from the library and from every listen settled so far
  const albumVotes = new Map<string, Map<string, { name: string; count: number }>>()
  const vote = (album: string, artist: string) => {
    const a = titleKey(album)
    if (!a) return
    const votes = albumVotes.get(a) ?? new Map<string, { name: string; count: number }>()
    albumVotes.set(a, votes)
    const k = titleKey(artist)
    const v = votes.get(k) ?? { name: artist, count: 0 }
    v.count++
    votes.set(k, v)
  }
  for (const t of parts.library) if (!isPlaceholderArtist(t.artist)) vote(t.album, t.artist.trim())

  const result: (string | null)[] = listens.map(() => null)
  const open: number[] = []
  listens.forEach((l, i) => {
    const sure = clearArtist(l, exact.get(titleKey(l.song)))
    if (sure) {
      result[i] = sure
      vote(l.album, sure)
    } else {
      open.push(i)
    }
  })

  for (const i of open) {
    const l = listens[i]
    const albumArtist = mainArtist(albumVotes.get(titleKey(l.album)))
    const candidates = exact.get(titleKey(l.song)) ?? loose.get(looseKey(l.song))
    result[i] = candidates ? bestCandidate(candidates, albumArtist, dayNumber(new Date(l.start))) : albumArtist
  }
  return result
}

/** The artist when the evidence leaves no doubt, otherwise null */
function clearArtist(l: AppleEvent, candidates: Map<string, Evidence> | undefined): string | null {
  if (l.artist) return l.artist
  if (!candidates) return l.containerArtist || null
  if (candidates.size === 1) return only(candidates).name
  const container = l.containerArtist && candidates.get(titleKey(l.containerArtist))
  if (container) return container.name
  const album = titleKey(l.album)
  const onAlbum = album ? [...candidates.values()].filter((e) => e.albums.has(album)) : []
  return onAlbum.length === 1 ? onAlbum[0].name : null
}

function bestCandidate(candidates: Map<string, Evidence>, albumArtist: string | null, day: number): string {
  const albumKey = albumArtist === null ? null : titleKey(albumArtist)
  const near = (e: Evidence) => e.days.has(day) || e.days.has(day - 1) || e.days.has(day + 1)
  let best: Evidence | null = null
  for (const [key, e] of candidates) {
    if (!best) {
      best = e
      continue
    }
    const bestKey = titleKey(best.name)
    const better =
      (key === albumKey) !== (bestKey === albumKey)
        ? key === albumKey
        : near(e) !== near(best)
          ? near(e)
          : e.count !== best.count
            ? e.count > best.count
            : e.name < best.name
    if (better) best = e
  }
  return (best as Evidence).name
}

/** The artist with most of an album's plays, if one clearly leads */
function mainArtist(votes: Map<string, { name: string; count: number }> | undefined): string | null {
  if (!votes) return null
  let total = 0
  let top: { name: string; count: number } | null = null
  for (const v of votes.values()) {
    total += v.count
    if (!top || v.count > top.count || (v.count === top.count && v.name < top.name)) top = v
  }
  return top && top.count / total >= ALBUM_SHARE ? top.name : null
}

function addEvidence(index: ArtistIndex, title: string, artist: string, album: string, day: number | null) {
  const artists = index.get(title) ?? new Map<string, Evidence>()
  index.set(title, artists)
  const key = titleKey(artist)
  const e = artists.get(key) ?? { name: artist, count: 0, albums: new Set<string>(), days: new Set<number>() }
  e.count++
  if (album) e.albums.add(titleKey(album))
  if (day !== null) e.days.add(day)
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

/** A looser key: "Song (feat. X)", "Song [Live]" and "Song - 2011 Remaster" all become "song" */
export function looseKey(s: string): string {
  return titleKey(s)
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s.*$/, '')
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
