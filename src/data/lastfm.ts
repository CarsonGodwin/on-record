import type { Play } from '../types'
import { shareSpotifyIds, stringPool } from './apple'
import { csvReader, readCsv } from './csv'
import { COUNTED_PLAY_MS } from './stats'

/*
 * Last.fm scrobble exports: a CSV with no header and four columns, artist, album, track
 * and a time like "06 Nov 2026, 20:57". The name is usually just a username, so a file
 * is recognized by what it holds (looksLikeLastfm), and only when it's dropped by itself:
 * the loader never goes looking for one inside a zip or a folder, where Apple keeps its
 * purchase and account files.
 *
 * A scrobble says what started and when, and nothing else. Last.fm only records a song
 * once half of it has played, or 4 minutes, so a real skip never reaches the file. Skips,
 * shuffle and the device stay unknown rather than false, and the time played is estimated.
 */

/** `extra` should always be empty: a fifth column means this is some other kind of CSV */
const COLUMNS = ['artist', 'album', 'track', 'date', 'extra'] as const

const DATE = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}), (\d{2}):(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Audioscrobbler began in 2002, so anything earlier is a clock or a placeholder like 1 Jan 1970 */
const EARLIEST = Date.UTC(2002, 0, 1)

/** Gaps shorter than a minute are the same minute twice, which says nothing about a song's length */
const MIN_GAP_MS = 60_000
/** A gap this long is a song's length only if the song keeps showing it, so it takes a few to count */
const MAX_REPEATED_GAP_MS = 30 * 60_000
/** Past this, one gap on its own is more likely to be a break than a very long song */
const MAX_LONE_GAP_MS = 15 * 60_000
/** How many gaps a median needs before it's believed over anything less specific */
const ENOUGH_GAPS = 3
/** For a history too short to have any gaps at all */
const TYPICAL_SONG_MS = 3.5 * 60_000

const DAY_MS = 86_400_000

interface Scrobble {
  /** When it started, as epoch ms */
  start: number
  artist: string
  album: string
  title: string
}

export interface LastfmFile {
  name: string
  scrobbles: Scrobble[]
  /** Rows with no usable name or date, such as a song still playing when the export ran */
  skippedRows: number
  /** The skipped rows that are real scrobbles with no real time, which Last.fm lists as 1 Jan 1970 */
  undatedRows: number
}

/**
 * When a scrobble started, or null. Exports write it in UTC, so it's read as UTC here and
 * shown in the viewer's own time like everything else. Parsed by hand, since Date.parse
 * would read this format in the viewer's zone and doesn't promise to read it at all.
 */
export function scrobbleTime(text: string): number | null {
  const m = DATE.exec(text)
  if (!m) return null
  const day = Number(m[1])
  const month = MONTHS.indexOf(m[2])
  const hour = Number(m[4])
  const minute = Number(m[5])
  if (hour > 23 || minute > 59) return null
  const time = Date.UTC(Number(m[3]), month, day, hour, minute)
  // Date.UTC rolls 31 Feb on into March rather than refusing it
  if (new Date(time).getUTCDate() !== day || time < EARLIEST) return null
  return time
}

/**
 * True if the start of a CSV is a scrobble export. Every row has to fit, so another CSV
 * that happens to have four columns isn't read. `whole` says the text is the entire file;
 * otherwise it stops part way through a row, and maybe a character, so that row is left out.
 */
export function looksLikeLastfm(head: string, whole: boolean): boolean {
  const text = whole ? head : head.slice(0, head.lastIndexOf('\n') + 1)
  let dated = 0
  let fits = true
  readCsv(
    text,
    COLUMNS,
    (row) => {
      // A song still playing has no date yet, so that's allowed as long as others do
      if (row.extra || !row.artist || !row.track || (row.date && !DATE.test(row.date))) fits = false
      if (row.date) dated++
    },
    { headerless: true },
  )
  return fits && dated > 0
}

export interface LastfmReader {
  push(text: string): void
  /** Rows read so far, for the loader's limit */
  rows(): number
  end(): Omit<LastfmFile, 'name'>
}

/** Reads a scrobble export piece by piece, as csvReader does */
export function lastfmReader(): LastfmReader {
  const own = stringPool()
  const scrobbles: Scrobble[] = []
  let skippedRows = 0
  let undatedRows = 0
  const reader = csvReader(
    COLUMNS,
    (row) => {
      const start = scrobbleTime(row.date)
      if (start === null || !row.artist || !row.track) {
        skippedRows++
        // No date at all is the song playing as the export ran, which was never a scrobble
        if (start === null && row.date && row.artist && row.track) undatedRows++
        return
      }
      scrobbles.push({ start, artist: own(row.artist), album: own(row.album), title: own(row.track) })
    },
    { headerless: true },
  )
  return {
    push: reader.push,
    rows: () => scrobbles.length + skippedRows,
    end: () => {
      reader.end()
      return { scrobbles, skippedRows, undatedRows }
    },
  }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function add(map: Map<string, number[]>, key: string, value: number) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const songKey = (s: Scrobble) => `${s.artist}\u0000${s.title}`
const scrobbleKey = (s: Scrobble) => `${s.start}\u0000${songKey(s)}`

/**
 * How long each scrobble played, going by the time until the next one started. Any one gap
 * might hold a pause, and times only come to the minute, but a song's gaps agree with each
 * other, so its median is used wherever there are a few. Then the shortest gap it has, the
 * least likely to hold a break, then what's usual for the artist, then for the whole history.
 *
 * A song never runs into the next one, since it can't have played longer than that. Every
 * scrobble still gets at least COUNTED_PLAY_MS: Last.fm's own rule is stricter than ours, so
 * two in the same minute (a bulk import, usually) are both real plays.
 *
 * `scrobbles` must be sorted by start.
 */
export function estimateDurations(scrobbles: Scrobble[]): number[] {
  const bySong = new Map<string, number[]>()
  const byArtist = new Map<string, number[]>()
  const everything: number[] = []
  for (let i = 0; i + 1 < scrobbles.length; i++) {
    const gap = scrobbles[i + 1].start - scrobbles[i].start
    if (gap < MIN_GAP_MS || gap > MAX_REPEATED_GAP_MS) continue
    add(bySong, songKey(scrobbles[i]), gap)
    if (gap > MAX_LONE_GAP_MS) continue
    add(byArtist, scrobbles[i].artist, gap)
    everything.push(gap)
  }
  const usual = everything.length > 0 ? median(everything) : TYPICAL_SONG_MS

  const songLength = new Map<string, number>()
  const lengthOf = (s: Scrobble): number => {
    const gaps = bySong.get(songKey(s)) ?? []
    if (gaps.length >= ENOUGH_GAPS) return median(gaps)
    const lone = gaps.filter((g) => g <= MAX_LONE_GAP_MS)
    if (lone.length > 0) return Math.min(...lone)
    const artist = byArtist.get(s.artist) ?? []
    return artist.length >= ENOUGH_GAPS ? median(artist) : usual
  }

  return scrobbles.map((s, i) => {
    const key = songKey(s)
    let length = songLength.get(key)
    if (length === undefined) {
      length = lengthOf(s)
      songLength.set(key, length)
    }
    const next = scrobbles[i + 1]
    return Math.max(COUNTED_PLAY_MS, next ? Math.min(length, next.start - s.start) : length)
  })
}

function toPlay(s: Scrobble, msPlayed: number): Play {
  return {
    endTime: s.start + msPlayed,
    msPlayed,
    kind: 'track',
    title: s.title,
    artist: s.artist,
    album: s.album,
    uri: '',
    platform: '',
    country: '',
    reasonStart: '',
    reasonEnd: '',
    shuffle: null,
    skipped: null,
    offline: false,
    incognito: false,
  }
}

/**
 * Turns scrobble files into plays. Last.fm usually scrobbles from Spotify or Apple Music, so
 * the same listen can be in `richer` too, under a time and a name that don't quite match.
 * Those exports know more, so on any day one of them covers, its plays are the ones kept.
 *
 * The same song in the same minute counts once, since most of these are a device or app sending
 * a batch again (one song can show up 11 times in a minute). They come back as `repeats` for
 * Show all scrobbles, because Last.fm counts them and a very short song could be a real one.
 */
export function loadLastfm(files: LastfmFile[], richer: Play[]) {
  // Copies are compared within a file, so dropping a file twice or two overlapping files adds no repeats
  const copies = new Map<string, number>()
  const repeated: Scrobble[] = []
  for (const file of files) {
    const inFile = new Map<string, number>()
    for (const s of file.scrobbles) {
      const key = scrobbleKey(s)
      const n = (inFile.get(key) ?? 0) + 1
      inFile.set(key, n)
      if (n > (copies.get(key) ?? 0)) {
        copies.set(key, n)
        if (n > 1) repeated.push(s)
      }
    }
  }

  // Sorted and deduped first, so a repeat can't disturb the gaps
  const sorted = files.flatMap((f) => f.scrobbles).sort((a, b) => a.start - b.start)
  const seen = new Set<string>()
  const scrobbles = sorted.filter((s) => {
    const key = scrobbleKey(s)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const lengths = estimateDurations(scrobbles)

  // These are only compared with each other, so UTC days do, whatever the viewer's zone
  const covered = new Set<number>()
  for (const p of richer) {
    covered.add(Math.floor((p.endTime - p.msPlayed) / DAY_MS))
    covered.add(Math.floor(p.endTime / DAY_MS))
  }
  const plays: Play[] = []
  scrobbles.forEach((s, i) => {
    if (!covered.has(Math.floor(s.start / DAY_MS))) plays.push(toPlay(s, lengths[i]))
  })
  // All in the minute the first copy already took, so each is the least that counts as a play
  const repeats = repeated.filter((s) => !covered.has(Math.floor(s.start / DAY_MS))).map((s) => toPlay(s, COUNTED_PLAY_MS))
  shareSpotifyIds(plays, richer)
  shareSpotifyIds(repeats, richer)

  return {
    plays,
    repeats,
    filesRead: files.map((f) => f.name),
    skippedRows: files.reduce((sum, f) => sum + f.skippedRows, 0),
    undatedRows: files.reduce((sum, f) => sum + f.undatedRows, 0),
    // Only copies from overlapping files: the repeats have a line of their own in the load details
    duplicateRows: sorted.length - scrobbles.length - repeated.length,
    unmatchedArtists: 0,
    overlapRows: scrobbles.length - plays.length + repeated.length - repeats.length,
  }
}
