import { hashString, mulberry32 } from '../lib/random'
import type { RawStreamRecord } from '../types'
import {
  ALBUM_SHAPES, BAND_ADJECTIVES, BAND_NOUNS, CAROLS, CLASSIC_ARTISTS, CORE_ARTISTS, ELECTRO_ADJECTIVES,
  ELECTRO_NOUNS, ELECTRONIC, ENDINGS, FIRST_NAMES, FOLK, FOLK_SHAPES, GENRES, HIPHOP, HOLIDAY_ARTISTS,
  INDIE, INTERVIEW_TOPICS, LAST_NAMES, NEWS, NOUNS, PLACES, PLANTS, POP, POP_ADJECTIVES, POP_NOUNS,
  RAP_WORDS, SCIENCE_SUBJECTS, SCIENCE_VERBS, SERIAL_CHAPTERS, SYLLABLES, TITLE_SHAPES, VENUES,
} from './sampleWords'
import type { Words } from './sampleWords'

/*
 * Generates nearly four years of made-up listening history in Spotify's raw export
 * format, so it runs through the same parser as real data. It's seeded, so
 * every load produces identical data.
 *
 * Every artist, song, show and book is invented (see sampleWords.ts), so the
 * demo never pins made-up habits on a real musician. The realism comes from
 * shape instead: a few dozen artists you love over a long tail you heard once
 * on a playlist, albums that come out and get played front to back, features
 * and sped-up singles, Christmas music in December, podcasts on the commute,
 * an audiobook at bedtime, a new phone, and a couple of trips abroad.
 *
 * There's enough for every chart to have something to say: tastes that rise
 * and fade, genres with their own time of day, songs that get skipped more
 * than others, and the occasional day on repeat.
 */

const START = new Date(2023, 0, 1)
// Runs up to the present, so the current year has its own tab
const END = new Date(2026, 9, 14)

/*
 * Days are counted from START on the calendar, like dayNumber in stats.ts.
 * They're worked out here rather than imported so the landing page, which
 * can load the sample, doesn't pull the stats module into its bundle.
 */

/** Day of a local date, counted from START (month is 0-based, like Date) */
function dayOf(year: number, month: number, date: number): number {
  return Math.round((Date.UTC(year, month, date) - Date.UTC(START.getFullYear(), START.getMonth(), START.getDate())) / 86_400_000)
}

/** The local date `day` days after START */
function fromDay(day: number): Date {
  return new Date(START.getFullYear(), START.getMonth(), START.getDate() + day)
}

const TOTAL_DAYS = dayOf(END.getFullYear(), END.getMonth(), END.getDate())
const SPAN_YEARS = TOTAL_DAYS / 365

/** Artists that come and go with your taste, besides the core ones */
const MID_ARTISTS = 50
/** Artists you only meet on a playlist or radio, and mostly hear a handful of times */
const TAIL_ARTISTS = 320

/** Relative listening likelihood for each hour of the day (0 = midnight) */
const HOUR_WEIGHTS = [
  3, 2, 1, 0.4, 0.2, 0.5, 2, 6, 9, 6, 4, 4, 5, 5, 4, 4, 6, 9, 8, 7, 8, 9, 8, 5,
]

/** Each part of the day leans toward its own genre, five hours at a time */
const DAYPARTS = [ELECTRONIC, FOLK, POP, HIPHOP, INDIE]

/** Typical song length in seconds, by genre */
const SONG_SECONDS: [number, number][] = []
SONG_SECONDS[ELECTRONIC] = [190, 380]
SONG_SECONDS[FOLK] = [170, 300]
SONG_SECONDS[POP] = [140, 220]
SONG_SECONDS[HIPHOP] = [120, 230]
SONG_SECONDS[INDIE] = [170, 270]

/** How often a song has a guest, by genre */
const FEATURE_RATE = [0.2, 0.06, 0.15, 0.3, 0.06]
/** How often titles are written in lowercase, by genre */
const LOWERCASE_RATE = [0.35, 0.03, 0.08, 0.15, 0.08]

/** The phone gets an upgrade in September 2023 and then follows iOS updates */
const PHONE: [day: number, platform: string][] = [
  [0, 'iOS 16.2 (iPhone14,5)'],
  [dayOf(2023, 8, 22), 'iOS 17.0.2 (iPhone16,1)'],
  [dayOf(2024, 2, 8), 'iOS 17.4 (iPhone16,1)'],
  [dayOf(2024, 9, 30), 'iOS 18.1 (iPhone16,1)'],
  [dayOf(2025, 4, 20), 'iOS 18.5 (iPhone16,1)'],
  [dayOf(2025, 8, 19), 'iOS 26.0 (iPhone16,1)'],
]
const MACOS: [day: number, version: string][] = [
  [0, '13.2.1'],
  [dayOf(2023, 10, 2), '14.1.1'],
  [dayOf(2024, 10, 12), '15.1'],
  [dayOf(2025, 6, 30), '15.6'],
]

/** Weeks away: plays log the country, and the flights there and back are offline */
const TRIPS = [
  { from: dayOf(2024, 5, 8), to: dayOf(2024, 5, 16), country: 'PT' },
  { from: dayOf(2025, 7, 21), to: dayOf(2025, 7, 31), country: 'JP' },
]

interface Show {
  name: string
  /** Days it's listened to, counted from START */
  from: number
  to: number
  minutes: [number, number]
  /** Days between episodes */
  every: number
  /** The episode out on START */
  first: number
  title: (n: number, w: Dice) => string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const COMMUTE = 0
const SERIAL = 3
const SHOWS: Show[] = [
  {
    // A daily news show, dropped once the commute stops (working from home from March 2025)
    name: 'The Long Commute',
    from: 0,
    to: dayOf(2025, 2, 3),
    minutes: [18, 28],
    every: 1,
    first: 0,
    title: (n, w) => {
      const d = fromDay(n)
      const [a, b, c] = w.pickSome(NEWS, 3)
      return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}: ${a}, ${b} and ${c}`
    },
  },
  {
    name: 'Half-Baked Science',
    from: 0,
    to: TOTAL_DAYS,
    minutes: [40, 75],
    every: 7,
    first: 112,
    title: (n, w) => `${n}. Why Do ${w.pick(SCIENCE_SUBJECTS)} ${w.pick(SCIENCE_VERBS)}?`,
  },
  {
    name: 'Small Talk, Big Ideas',
    from: dayOf(2023, 9, 1),
    to: TOTAL_DAYS,
    minutes: [50, 90],
    every: 7,
    first: 140,
    title: (n, w) => `#${n} ${w.pick(FIRST_NAMES)} ${w.pick(LAST_NAMES)} on ${w.pick(INTERVIEW_TOPICS)}`,
  },
  {
    // A finished true-crime series, binged over a couple of weeks
    name: 'The Ferry Ticket',
    from: dayOf(2025, 1, 8),
    to: dayOf(2025, 1, 24),
    minutes: [38, 52],
    every: 0,
    first: 1,
    title: (n) => `${n}. ${SERIAL_CHAPTERS[n - 1]}`,
  },
]

const BOOK = { title: 'The Lighthouse at Marrow Bay', chapters: 22, from: dayOf(2024, 10, 3) }

interface Track {
  title: string
  album: string
  /** Index into the artist list */
  artist: number
  uri: string
  durationMs: number
  /** How likely you are to skip this one, 0–1 */
  skipChance: number
  /** How much more often this one is picked than the artist's other songs (the singles) */
  appeal: number
  /** Christmas music, only played from late November */
  holiday: boolean
}

interface Album {
  name: string
  /** Day it came out, counted from START; negative for older music */
  release: number
  tracks: Track[]
}

interface Artist {
  name: string
  genre: number
  albums: Album[]
  /** Tail artists only turn up through discovery, on the day they're `found` */
  tail: boolean
  found: number
  popularity: number
  /** When (in years from START) this artist is played most, and how broad that peak is */
  peak: number
  width: number
  /** How long before the peak they're discovered, in years */
  lead: number
  /** Played from the first day rather than discovered partway through */
  staple: boolean
  /** Played hard around the peak, then dropped for good */
  fades: boolean
  /** Day of their first release */
  earliest: number
}

interface Dice extends Words {
  rand: () => number
  between: (lo: number, hi: number) => number
  int: (lo: number, hi: number) => number
}

function dice(rand: () => number): Dice {
  return {
    rand,
    pick: (items) => items[Math.floor(rand() * items.length)],
    pickSome: (items, count) => {
      const left = [...items]
      return Array.from({ length: count }, () => left.splice(Math.floor(rand() * left.length), 1)[0])
    },
    chance: (p) => rand() < p,
    between: (lo, hi) => lo + rand() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
  }
}

export function generateSampleRecords(): RawStreamRecord[] {
  const w = dice(mulberry32(42))
  const { rand, chance, between, int } = w

  const artists = buildArtists(w)
  // Tail artists come last, so these share indices with `artists`
  const regulars = artists.filter((a) => !a.tail)
  const tailByGenre = Array.from({ length: GENRES }, (_, g) => artists.filter((a) => a.tail && a.genre === g))
  const holidayTracks = artists.flatMap((a) => a.albums.flatMap((al) => al.tracks.filter((t) => t.holiday)))

  const records: RawStreamRecord[] = []
  // Plays so far per track: new songs get skipped more, favourites less, and then they wear out
  const heard = new Map<string, number>()
  const fatigue = (n: number) => 0.7 + 0.8 * Math.exp(-(n - 1) / 2) + Math.min(20, Math.max(0, n - 12)) * 0.04
  // Late sessions on the last night would otherwise spill into the next year
  const cutoff = new Date(END.getFullYear(), END.getMonth(), END.getDate() + 1).getTime()
  // Sessions never overlap, as they can't on one account
  let busyUntil = 0

  // Spoken-word progress: an episode stopped partway through gets picked up later
  const paused = new Map<number, { n: number; leftMs: number }>()
  let serialNext = 1
  let chapter = 0
  let chapterLeftMs = 0

  for (let day = 0; day <= TOTAL_DAYS; day++) {
    const trip = TRIPS.find((tr) => day >= tr.from && day <= tr.to)
    if (!trip && rand() < 0.06) continue // some days you don't listen at all
    const date = fromDay(day)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const yearsIn = day / 365
    const weights = regulars.map((a) => artistWeight(a, yearsIn, day))
    // More listening in winter, and a bit more each year, so the monthly chart has some shape
    const season = 0.75 + 0.25 * Math.cos((date.getMonth() / 12) * 2 * Math.PI)
    const growth = 0.75 + (day / TOTAL_DAYS) * 0.6
    const sessions = Math.max(1, Math.round((1 + rand() * (weekend ? 3 : 4)) * season * growth))
    // Now and then, one song takes over a whole session
    const obsession = rand() < 0.015 ? Math.floor(rand() * sessions) : -1
    // Christmas music creeps in from late November and takes over on Christmas Eve
    const toChristmas = dayOf(date.getFullYear(), 11, 25) - day
    const holidayShare = toChristmas >= -1 && toChristmas <= 35 ? 0.45 * Math.exp(-Math.max(0, toChristmas) / 12) : 0
    const hours = Array.from({ length: sessions }, () => weightedIndex(HOUR_WEIGHTS, rand)).sort((a, b) => a - b)
    const flight = trip !== undefined && (day === trip.from || day === trip.to)

    for (let s = 0; s < sessions; s++) {
      const hour = flight && s === 0 ? 11 : hours[s]
      let t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, int(0, 59)).getTime()
      t = Math.max(t, busyUntil + between(2, 40) * 60_000)
      if (t >= cutoff - 3_600_000) break

      const device = trip ? 'phone' : pickDevice(hour, weekend, rand)
      const offline = device === 'phone' && ((flight && s === 0) || chance(trip ? 0.3 : 0.03))
      const context = {
        platform: platformName(device, day),
        conn_country: trip?.country ?? 'US',
        offline,
        incognito_mode: chance(0.004),
      }
      const firstStart = device === 'speaker' ? 'remote' : ['clickrow', 'playbtn', 'appload'][weightedIndex([5, 3, 2], rand)]

      // ---------- Podcasts and the audiobook ----------

      const commute = !weekend && !trip && [7, 8, 17, 18].includes(hour)
      const listening = (i: number) => day >= SHOWS[i].from && day <= SHOWS[i].to
      let show = -1
      if (commute && listening(COMMUTE) && chance(0.6)) show = hour < 12 ? COMMUTE : weightedIndex([0, 1, listening(2) ? 1 : 0, 0], rand)
      else if (listening(SERIAL) && hour >= 19 && serialNext <= SERIAL_CHAPTERS.length && chance(0.7)) show = SERIAL
      else if (!flight && chance(0.04)) show = weightedIndex([0, 2, listening(2) ? 1 : 0, 0], rand)

      if (show >= 0) {
        const sh = SHOWS[show]
        // A binge keeps going for another episode now and then
        for (let first = true; first || (show === SERIAL && serialNext <= SERIAL_CHAPTERS.length && chance(0.45)); first = false) {
          const resume = paused.get(show)
          let n: number
          let leftMs: number
          if (resume && chance(0.85)) {
            n = resume.n
            leftMs = resume.leftMs
          } else {
            if (show === SERIAL) n = serialNext
            else if (sh.every === 1) n = sh.first + day
            else {
              // Usually the newest episode, sometimes one from the back catalog
              const latest = sh.first + Math.floor(day / sh.every)
              n = chance(0.7) ? latest : Math.max(1, latest - int(1, 40))
            }
            leftMs = Math.round(dice(mulberry32(hashString(`${sh.name}${n}`))).between(...sh.minutes) * 60_000)
          }
          // Yesterday's news is old news, so only the weekly shows get finished later
          const stopsEarly = !resume && sh.every !== 1 && chance(0.3)
          const ms = stopsEarly ? Math.round(leftMs * between(0.2, 0.7)) : leftMs
          if (t + ms > cutoff) break
          if (stopsEarly) paused.set(show, { n, leftMs: leftMs - ms })
          else {
            paused.delete(show)
            if (show === SERIAL && n === serialNext) serialNext++
          }
          t += ms
          records.push({
            ...context,
            ts: isoSeconds(t),
            ms_played: ms,
            shuffle: false,
            master_metadata_track_name: null,
            master_metadata_album_artist_name: null,
            master_metadata_album_album_name: null,
            spotify_track_uri: null,
            episode_name: sh.title(n, dice(mulberry32(hashString(`${sh.name}#${n}`)))),
            episode_show_name: sh.name,
            spotify_episode_uri: `spotify:episode:sample${show}x${n}`,
            reason_start: resume ? 'playbtn' : first ? firstStart : 'trackdone',
            reason_end: stopsEarly ? 'endplay' : 'trackdone',
            skipped: false,
          })
          t += int(0, 3_000)
        }
        busyUntil = t
        continue
      }

      if (day >= BOOK.from && chapter < BOOK.chapters && hour >= 21 && chance(0.6)) {
        // A chapter or two at bedtime, often falling asleep partway through
        for (let k = 0; chapter < BOOK.chapters && (k === 0 || chance(0.35)); k++) {
          if (chapterLeftMs === 0) chapterLeftMs = Math.round(between(25, 45) * 60_000)
          const asleep = chance(0.45)
          const ms = asleep ? Math.round(chapterLeftMs * between(0.3, 0.9)) : chapterLeftMs
          if (t + ms > cutoff) break
          t += ms
          records.push({
            ...context,
            ts: isoSeconds(t),
            ms_played: ms,
            shuffle: false,
            master_metadata_track_name: null,
            master_metadata_album_artist_name: null,
            master_metadata_album_album_name: null,
            spotify_track_uri: null,
            episode_name: null,
            episode_show_name: null,
            spotify_episode_uri: null,
            audiobook_title: BOOK.title,
            audiobook_uri: 'spotify:show:samplebook',
            audiobook_chapter_title: `Chapter ${chapter + 1}`,
            audiobook_chapter_uri: `spotify:episode:samplebook${chapter}`,
            reason_start: k === 0 ? 'playbtn' : 'trackdone',
            reason_end: asleep ? 'endplay' : 'trackdone',
            skipped: false,
          })
          chapterLeftMs -= ms
          if (chapterLeftMs === 0) chapter++
          if (asleep) break
        }
        busyUntil = t
        continue
      }

      // ---------- Music ----------

      const shuffle = chance(0.55)
      const scene = chance(0.75) ? DAYPARTS[Math.floor(hour / 5)] : int(0, GENRES - 1)
      const sceneWeights = weights.map((wt, i) => (regulars[i].genre === scene ? wt * 12 : wt))
      let length = s === obsession ? 8 + int(0, 13) : flight && s === 0 ? 20 + int(0, 10) : 3 + int(0, 15)
      // Sometimes an album start to finish, most likely one that just came out
      let queue: Track[] = []
      const album = s !== obsession && !shuffle && chance(0.2) ? albumToPlay(regulars[weightedIndex(sceneWeights, rand)], day, holidayShare > 0, w) : null
      if (album) {
        queue = [...album.tracks]
        length = queue.length
      }

      const nextTrack = (prev: Track | null): Track => {
        const queued = queue.shift()
        if (queued) return queued
        if (s === obsession && prev) return prev
        if (holidayShare > 0 && chance(holidayShare)) return holidayTracks[weightedIndex(holidayTracks.map((tr) => tr.appeal), rand)]
        // Something new off a playlist or the radio
        if (chance(0.05)) {
          const found = discover(tailByGenre[scene], day, rand)
          const track = found && pickTrack(found, day, rand)
          if (track) return track
        }
        // Often stay with the same artist for a bit, otherwise wander within the scene
        const artist = prev && !prev.holiday && chance(0.35) ? artists[prev.artist] : regulars[weightedIndex(sceneWeights, rand)]
        return pickTrack(artist, day, rand) ?? pickTrack(artists[0], day, rand) ?? artists[0].albums[0].tracks[0]
      }

      let prevSkipped = false
      let prev: Track | null = null
      for (let k = 0; k < length && t < cutoff - 3_600_000; k++) {
        const track = nextTrack(prev)
        const n = (heard.get(track.uri) ?? 0) + 1
        heard.set(track.uri, n)
        // Skips are rarer when you've put an album on on purpose
        const mood = (shuffle ? 1.3 : 1) * (album ? 0.5 : 1)
        const skipped = s !== obsession && rand() < Math.min(0.95, track.skipChance * mood * fatigue(n))
        // The last song often gets cut off when you arrive or put the phone down
        const cutShort = !skipped && k === length - 1 && chance(0.35)
        // Most skips come in the first few seconds, but some land anywhere in the song
        const ms = skipped
          ? 1_000 + Math.floor(rand() ** 3 * (track.durationMs - 1_000))
          : cutShort
            ? Math.floor(track.durationMs * between(0.1, 0.9))
            : track.durationMs
        t += ms
        records.push({
          ...context,
          ts: isoSeconds(t),
          ms_played: ms,
          shuffle,
          master_metadata_track_name: track.title,
          master_metadata_album_artist_name: artists[track.artist].name,
          master_metadata_album_album_name: track.album,
          spotify_track_uri: track.uri,
          episode_name: null,
          episode_show_name: null,
          spotify_episode_uri: null,
          reason_start: k === 0 ? firstStart : prevSkipped ? 'fwdbtn' : 'trackdone',
          reason_end: skipped ? 'fwdbtn' : cutShort ? 'endplay' : 'trackdone',
          skipped,
        })
        prevSkipped = skipped
        prev = track
        t += int(0, 3_000)
      }
      busyUntil = t
    }
  }

  return records
}

// ---------- Choosing what plays ----------

/** How much an artist gets played on a day, before the time of day's genre is taken into account */
function artistWeight(a: Artist, yearsIn: number, day: number): number {
  if (a.tail || day < a.earliest) return 0
  // A few staples from day one; everyone else is discovered a while before their peak
  if (!a.staple && yearsIn < a.peak - a.lead) return 0
  const gone = a.fades && yearsIn > a.peak
  const curve = Math.exp(-((yearsIn - a.peak) ** 2) / (gone ? 0.06 : a.width))
  // A new album brings an artist back into rotation for a month or two
  let boost = 1
  for (const al of a.albums) {
    if (al.tracks.length > 3 && al.release >= 0 && al.release <= day) boost += 2 * Math.exp(-(day - al.release) / 30)
  }
  return a.popularity * ((gone ? 0 : 0.05) + curve) * boost
}

/** A song by `artist` that's out by `day`: the singles most often, and new releases while they're new */
function pickTrack(artist: Artist, day: number, rand: () => number): Track | null {
  const tracks: Track[] = []
  const weights: number[] = []
  for (const al of artist.albums) {
    if (al.release > day) continue
    const fresh = 1 + 3 * Math.exp(-Math.max(0, day - al.release) / 40)
    for (const t of al.tracks) {
      if (t.holiday) continue
      tracks.push(t)
      weights.push(t.appeal * fresh)
    }
  }
  return tracks.length ? tracks[weightedIndex(weights, rand)] : null
}

function albumToPlay(artist: Artist, day: number, holidays: boolean, w: Dice): Album | null {
  const out = artist.albums.filter((al) => al.release <= day && al.tracks.length > 3 && (holidays || !al.tracks[0].holiday))
  if (!out.length) return null
  const newest = out.reduce((a, b) => (b.release > a.release ? b : a))
  if (day - newest.release < 60 && w.chance(0.7)) return newest
  return out[weightedIndex(out.map((al) => al.tracks.reduce((sum, t) => sum + t.appeal, 0)), w.rand)]
}

/** A tail artist for this genre, most likely one that's just turned up */
function discover(candidates: Artist[], day: number, rand: () => number): Artist | null {
  const weights = candidates.map((a) => (a.found <= day ? Math.exp(-(day - a.found) / 14) + 0.01 : 0))
  return weights.some((x) => x > 0) ? candidates[weightedIndex(weights, rand)] : null
}

type Device = 'phone' | 'mac' | 'web' | 'speaker'

/** The laptop during working hours, the phone the rest of the time, and the speaker at home */
function pickDevice(hour: number, weekend: boolean, rand: () => number): Device {
  const work = !weekend && hour >= 9 && hour < 17
  const devices: Device[] = ['phone', 'mac', 'web', 'speaker']
  return devices[weightedIndex(work ? [30, 50, 15, 5] : [70, 10, 3, 17], rand)]
}

function platformName(device: Device, day: number): string {
  const current = <T,>(list: [number, T][]) => list.filter(([from]) => from <= day).at(-1)![1]
  if (device === 'phone') return current(PHONE)
  if (device === 'mac') return `OS X ${current(MACOS)} [arm 2]`
  // Chrome ships a major version about once a month
  if (device === 'web') return `web_player osx ${current(MACOS)};chrome ${109 + Math.floor(day / 34)}.0;desktop`
  return 'Partner sonos_speaker Sonos;Era 100;'
}

// ---------- The catalog ----------

function buildArtists(w: Dice): Artist[] {
  const used = new Set(CORE_ARTISTS.map(([name]) => name))
  const freshName = (genre: number) => {
    for (;;) {
      const name = artistName(w, genre)
      if (!used.has(name)) {
        used.add(name)
        return name
      }
    }
  }
  const blank = { tail: false, found: 0, peak: 0, width: 0, lead: 0, staple: false, fades: false, earliest: 0 }

  const artists: Artist[] = CORE_ARTISTS.map(([name, genre], i) => ({
    ...blank,
    albums: [],
    name,
    genre,
    popularity: 1 / Math.sqrt(i + 1),
    peak: w.rand() * SPAN_YEARS,
    width: 0.3,
    lead: 0.6,
    staple: i < 4,
    // Every third artist burns bright and then disappears for good
    fades: i % 3 === 2,
  }))
  for (let i = 0; i < MID_ARTISTS; i++) {
    const genre = i % GENRES
    artists.push({
      ...blank,
      albums: [],
      name: freshName(genre),
      genre,
      popularity: w.between(0.05, 0.18),
      peak: w.rand() * SPAN_YEARS,
      width: 0.12,
      lead: 0.35,
      fades: w.chance(0.4),
    })
  }
  for (let i = 0; i < TAIL_ARTISTS; i++) {
    const genre = i % GENRES
    artists.push({ ...blank, albums: [], name: freshName(genre), genre, tail: true, popularity: 0, found: w.between(-30, TOTAL_DAYS) })
  }

  const byGenre = Array.from({ length: GENRES }, (_, g) => artists.filter((a) => a.genre === g).map((a) => a.name))
  artists.forEach((a, i) => {
    buildCatalog(w, a, i, byGenre[a.genre])
    a.earliest = Math.min(...a.albums.map((al) => al.release))
  })
  return artists
}

function buildCatalog(w: Dice, artist: Artist, index: number, peers: string[]): void {
  const { genre } = artist
  let count = 0
  const titles = new Set<string>()
  const newTitle = () => {
    for (;;) {
      const t = songTitle(w, genre)
      if (!titles.has(t.toLowerCase())) {
        titles.add(t.toLowerCase())
        return t
      }
    }
  }
  const guest = () => {
    if (!w.chance(FEATURE_RATE[genre])) return ''
    const other = w.pick(peers.filter((p) => p !== artist.name))
    return w.chance(0.2) ? ` (with ${other})` : ` (feat. ${other})`
  }
  const hitAppeal = () => (w.chance(0.25) ? w.between(3, 6) : w.between(0.4, 1.5))
  const songSeconds = () => w.between(...SONG_SECONDS[genre])

  const album = (release: number): Album => {
    const al: Album = { name: '', release, tracks: [] }
    artist.albums.push(al)
    return al
  }
  const track = (al: Album, title: string, appeal: number, seconds = songSeconds(), extraSkip = 0, holiday = false) => {
    al.tracks.push({
      title,
      album: al.name,
      artist: index,
      uri: `spotify:track:sample${index}x${count++}`,
      durationMs: Math.round(seconds * 1000),
      skipChance: Math.min(0.9, 0.02 + w.rand() ** 2.2 * 0.6 + extraSkip + (artist.tail ? 0.1 : 0)),
      appeal,
      holiday,
    })
  }
  const name = (al: Album, albumName: string) => {
    al.name = albumName
    for (const t of al.tracks) t.album = albumName
  }
  const songs = (al: Album) => al.tracks.filter((t) => t.durationMs > 100_000)
  const best = (al: Album) => songs(al).reduce((a, b) => (b.appeal > a.appeal ? b : a))
  /** A record with a few songs, maybe an intro, an interlude and an outro */
  const record = (release: number, size: number, suffix = '') => {
    const al = album(release)
    const extras = size > 6
    if (extras && w.chance(0.15)) track(al, 'Intro', 0.2, w.between(30, 90), 0.3)
    const interlude = extras && w.chance(0.25) ? w.int(3, size - 2) : -1
    for (let k = 0; k < size; k++) {
      if (k === interlude) track(al, `${w.pick(NOUNS)} (Interlude)`, 0.3, w.between(45, 95), 0.2)
      track(al, newTitle() + guest() + suffix, hitAppeal())
    }
    if (extras && w.chance(0.1)) track(al, 'Outro', 0.2, w.between(40, 95), 0.3)
    // Debuts are sometimes self-titled, and plenty of albums are named after a song on them
    const roll = w.rand()
    if (roll < 0.1 && artist.albums.length === 1) name(al, artist.name)
    else if (roll < 0.4) name(al, bare(best(al).title))
    else name(al, w.pick(ALBUM_SHAPES)(w))
    return al
  }
  /** A one-song release, named after the song as Spotify does */
  const single = (release: number, title: string, seconds = songSeconds(), appeal = hitAppeal()) => {
    const al = album(release)
    track(al, title, appeal, seconds)
    name(al, title.replace(/ - (Sped Up|Extended Mix)$/, ' ($1)'))
  }

  if (artist.tail) {
    // Often brand new when you find it (the weekly new-releases playlist), otherwise from the back catalog
    const release = artist.found - (w.chance(0.4) ? w.between(0, 10) : w.between(10, 700))
    if (w.chance(0.3)) record(release, w.int(3, 5))
    else for (let k = w.int(1, 2); k > 0; k--) single(release - k * w.between(40, 200), newTitle() + guest())
    return
  }

  const peakDay = artist.peak * 365
  if (CLASSIC_ARTISTS.has(artist.name)) {
    // Decades-old albums, reissued in remastered editions
    const first = -365 * w.between(20, 28)
    const last = -365 * w.between(4, 9)
    for (let k = 0; k < 4; k++) {
      const al = record(first + ((last - first) * k) / 3, w.int(9, 12), ` - Remastered ${w.int(2009, 2022)}`)
      if (w.chance(0.5)) name(al, `${al.name} (Remastered)`)
    }
    return
  }

  const core = index < CORE_ARTISTS.length
  // The latest album lands shortly before the artist's peak, which is part of why it's their peak
  const latest = peakDay > 120 ? peakDay - w.between(20, 100) : -w.between(30, 400)
  if (core) {
    const albums = w.int(2, 4)
    const first = Math.min(latest - 200, -w.between(500, 2200))
    for (let k = 0; k < albums; k++) {
      const release = first + ((latest - first) * k) / (albums - 1) + w.between(-30, 30)
      const ep = k > 0 && k < albums - 1 && w.chance(0.25)
      record(release, ep ? w.int(4, 6) : w.int(8, 12))
    }
    const last = artist.albums.at(-1)!
    if (w.chance(0.3)) {
      // A deluxe edition with an acoustic take and a couple of new songs
      track(last, `${best(last).title} - Acoustic`, 0.6, songSeconds() * 0.9)
      track(last, newTitle(), 0.8)
      if (w.chance(0.5)) track(last, newTitle() + guest(), 0.8)
      name(last, `${last.name} (Deluxe)`)
    }
    if (index < 12 && w.chance(0.25)) {
      const live = album(w.between(60, TOTAL_DAYS - 60))
      const hits = artist.albums.slice(0, -1).flatMap(songs).sort((a, b) => b.appeal - a.appeal).slice(0, 7)
      for (const h of hits) track(live, `${h.title} - Live`, 0.25, (h.durationMs / 1000) * 1.1, 0.1)
      name(live, `Live at ${w.pick(VENUES)}`)
    }
    if (HOLIDAY_ARTISTS.has(artist.name)) {
      const xmas = album(-w.between(400, 1200))
      for (const c of w.pickSome(CAROLS, 6)) track(xmas, c, 1, songSeconds(), 0, true)
      track(xmas, `Christmas in ${w.pick(PLACES)}`, 2.5, songSeconds(), 0, true)
      track(xmas, 'Home by December', 2, songSeconds(), 0, true)
      name(xmas, w.chance(0.5) ? `A ${artist.name} Christmas` : `Christmas with ${artist.name}`)
    }
  } else {
    record(latest, w.chance(0.5) ? w.int(4, 6) : w.int(8, 11))
  }

  // Singles between albums: new songs, and in some genres a sped-up or extended cut of a hit
  for (let k = core ? w.int(0, 2) : w.int(0, 1); k > 0; k--) {
    const hit = best(artist.albums[0])
    const release = w.between(Math.max(artist.albums[0].release + 60, -400), TOTAL_DAYS - 20)
    if ((genre === POP || genre === HIPHOP) && w.chance(0.4)) single(release, `${hit.title} - Sped Up`, (hit.durationMs / 1000) * 0.8, 1.5)
    else if (genre === ELECTRONIC && w.chance(0.4)) single(release, `${hit.title} - Extended Mix`, (hit.durationMs / 1000) * 1.5, 1)
    else single(release, newTitle() + guest())
  }
}

/** A song title without its guests or edition, for naming an album after it */
function bare(title: string): string {
  return title.replace(/ \((feat\.|with) [^)]*\)/, '').replace(/ - .*$/, '')
}

function artistName(w: Dice, genre: number): string {
  const person = () => `${w.pick(FIRST_NAMES)} ${w.pick(LAST_NAMES)}`
  const roll = w.rand()
  switch (genre) {
    case ELECTRONIC:
      return roll < 0.5 ? `${w.pick(SYLLABLES)}${w.pick(ENDINGS)}` : `${w.pick(ELECTRO_ADJECTIVES)} ${w.pick(ELECTRO_NOUNS)}`
    case FOLK:
      if (roll < 0.55) return person()
      if (roll < 0.7) return `The ${w.pick(LAST_NAMES)} Sisters`
      if (roll < 0.85) return `${w.pick(LAST_NAMES)} & the ${w.pick(BAND_NOUNS)}`
      return `Wild ${w.pick(PLANTS)}`
    case POP:
      if (roll < 0.45) return person()
      if (roll < 0.7) return w.pick(FIRST_NAMES).toUpperCase()
      return `${w.pick(POP_ADJECTIVES)} ${w.pick(POP_NOUNS)}`
    case HIPHOP:
      if (roll < 0.4) return person()
      if (roll < 0.6) return w.pick(FIRST_NAMES).toUpperCase()
      if (roll < 0.75) return `Young ${w.pick(LAST_NAMES)}`
      if (roll < 0.9) return `Kid ${w.pick(RAP_WORDS)}`
      return `Lil ${w.pick(RAP_WORDS)}`
    default:
      if (roll < 0.4) return `The ${w.pick(BAND_ADJECTIVES)} ${w.pick(BAND_NOUNS)}`
      if (roll < 0.75) return `${w.pick(BAND_ADJECTIVES)} ${w.pick(BAND_NOUNS)}`
      return `The ${w.pick(BAND_NOUNS)}`
  }
}

const SHAPE_WEIGHTS = TITLE_SHAPES.map(([weight]) => weight)

function songTitle(w: Dice, genre: number): string {
  const title = genre === FOLK && w.chance(0.2) ? w.pick(FOLK_SHAPES)(w) : TITLE_SHAPES[weightedIndex(SHAPE_WEIGHTS, w.rand)][1](w)
  return w.chance(LOWERCASE_RATE[genre]) ? title.toLowerCase() : title
}

/** Spotify's timestamp format: "2024-03-01T12:34:56Z" */
function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function weightedIndex(weights: number[], rand: () => number): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return weights.length - 1
}
