import { mulberry32 } from '../lib/random'
import type { RawStreamRecord } from '../types'

/*
 * Generates nearly four years of made-up listening history in Spotify's raw export
 * format, so it runs through the same parser as real data. It's seeded, so
 * every load produces identical data. All artist and track names are fictional.
 *
 * It has enough structure for every chart to have something to say: tastes
 * that rise and fade, "scenes" of artists played together, songs that get
 * skipped more than others, and the occasional day on repeat.
 */

const ARTISTS = [
  'Velvet Harbor', 'The Paper Moons', 'Juniper Vale', 'Neon Orchard', 'Saltwater Choir',
  'Marlowe Fox', 'Static Bloom', 'Low Tide Social', 'Cassia Reyes', 'Golden Hour Club',
  'Midnight Atlas', 'Ivy & The Echoes', 'Rook Avenue', 'Pale Satellite', 'Honey Arcade',
  'Desert Radio', 'Lumen Kid', 'Northbound Trains', 'Odessa Lane', 'Copper Kites',
  'Wild Fern', 'Sable Monroe', 'The Quiet Fires', 'Tidal Youth', 'Lavender Static',
  'Ghost Orchard', 'Polaroid Summer', 'Mira Castell', 'Glasshouse Park', 'Brass Lanterns',
]

/** Artists in the same scene get played in the same sessions (artist index mod SCENES) */
const SCENES = 5

const SHOWS = ['The Long Commute', 'Half-Baked Science', 'Small Talk, Big Ideas']

const WORDS = [
  'Paper', 'Lungs', 'Gold', 'River', 'Static', 'Midnight', 'Neon', 'Ghosts', 'Satellite',
  'Honey', 'Summer', 'Wires', 'Echo', 'Northern', 'Glass', 'Lights', 'Fever', 'Ocean',
  'Velvet', 'Signals', 'Weather', 'Orbit', 'Heart', 'Silver', 'Dust', 'Bloom', 'Tides',
  'Window', 'Highway', 'Dreams', 'Lantern', 'Hollow', 'Wildfire', 'Polaroid', 'Arcade',
  'Copper', 'Fade', 'Daylight', 'Shadows', 'Kites',
]

/** Relative listening likelihood for each hour of the day (0 = midnight) */
const HOUR_WEIGHTS = [
  3, 2, 1, 0.4, 0.2, 0.5, 2, 6, 9, 6, 4, 4, 5, 5, 4, 4, 6, 9, 8, 7, 8, 9, 8, 5,
]

const PLATFORMS: [string, number][] = [
  ['iOS 17.4 (iPhone15,2)', 70],
  ['OS X 14.4.1 [arm 2]', 15],
  ['web_player osx 14.4.1;chrome 124.0', 8],
  ['sonos_speaker', 7],
]

const START = new Date(2023, 0, 1)
// Runs up to the present, so the current year has its own tab
const END = new Date(2026, 9, 14)
const SPAN_YEARS = (END.getTime() - START.getTime()) / 86_400_000 / 365

interface Track {
  title: string
  album: string
  artistIndex: number
  uri: string
  durationMs: number
  /** How likely you are to skip this one, 0–1 */
  skipChance: number
}

export function generateSampleRecords(): RawStreamRecord[] {
  const rand = mulberry32(42)
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]
  const titleCase = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ')

  // Catalog: each artist has 3 albums of 10 tracks
  const tracksByArtist: Track[][] = ARTISTS.map((_, a) => {
    const albums = [titleCase(2), titleCase(1), `${titleCase(2)} (Deluxe)`]
    return Array.from({ length: 30 }, (_, i) => ({
      title: titleCase(1 + Math.floor(rand() * 3)),
      album: albums[Math.floor(i / 10)],
      artistIndex: a,
      uri: `spotify:track:sample${a}x${i}`,
      durationMs: 150_000 + Math.floor(rand() * 120_000),
      skipChance: 0.02 + rand() ** 2.2 * 0.6,
    }))
  })

  // Each artist peaks at some point in the span, so taste shifts over time.
  // Every third artist burns bright and then disappears for good.
  const peaks = ARTISTS.map(() => rand() * SPAN_YEARS)
  const popularity = ARTISTS.map((_, i) => 1 / Math.pow(i + 1, 0.5))
  const artistWeightsFor = (yearsIn: number) =>
    ARTISTS.map((_, i) => {
      // A few staples from day one; everyone else is discovered a while before their peak
      if (i >= 4 && yearsIn < peaks[i] - 0.6) return 0
      const fades = i % 3 === 2 && yearsIn > peaks[i]
      const curve = Math.exp(-((yearsIn - peaks[i]) ** 2) / (fades ? 0.06 : 0.3))
      return popularity[i] * ((fades ? 0 : 0.05) + curve)
    })

  const records: RawStreamRecord[] = []
  const totalDays = Math.round((END.getTime() - START.getTime()) / 86_400_000)
  // Late sessions on the last night would otherwise spill into the next year
  const cutoff = new Date(END.getFullYear(), END.getMonth(), END.getDate() + 1).getTime()

  for (let day = 0; day <= totalDays; day++) {
    if (rand() < 0.06) continue // some days you don't listen at all
    const date = new Date(START.getFullYear(), START.getMonth(), START.getDate() + day)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const artistWeights = artistWeightsFor(day / 365)
    // More listening in winter, and a bit more each year, so the monthly chart has some shape
    const season = 0.75 + 0.25 * Math.cos((date.getMonth() / 12) * 2 * Math.PI)
    const growth = 0.75 + (day / totalDays) * 0.6
    const sessions = Math.max(1, Math.round((1 + rand() * (weekend ? 3 : 4)) * season * growth))
    // Now and then, one song takes over a whole session
    const obsession = rand() < 0.015 ? Math.floor(rand() * sessions) : -1

    for (let s = 0; s < sessions; s++) {
      const hour = weightedIndex(HOUR_WEIGHTS, rand)
      let t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(rand() * 60)).getTime()
      const shuffle = rand() < 0.55
      const platform = PLATFORMS[weightedIndex(PLATFORMS.map((p) => p[1]), rand)][0]
      const length = s === obsession ? 8 + Math.floor(rand() * 14) : 3 + Math.floor(rand() * 16)
      // Each part of the day leans toward its own scene
      const scene = rand() < 0.75 ? Math.floor(hour / 5) % SCENES : Math.floor(rand() * SCENES)
      const sceneWeights = artistWeights.map((w, i) => (i % SCENES === scene ? w * 12 : w))
      let prevSkipped = false
      let prevTrack: Track | null = null

      for (let k = 0; k < length && t < cutoff - 3_600_000; k++) {
        const base = {
          platform,
          conn_country: 'US',
          reason_start: k === 0 ? 'clickrow' : prevSkipped ? 'fwdbtn' : 'trackdone',
          shuffle,
          offline: false,
          incognito_mode: false,
        }

        if (s !== obsession && rand() < 0.012) {
          // Podcast episode
          const show = pick(SHOWS)
          const ms = 600_000 + Math.floor(rand() * 2_400_000)
          t += ms
          records.push({
            ...base,
            ts: isoSeconds(t),
            ms_played: ms,
            master_metadata_track_name: null,
            master_metadata_album_artist_name: null,
            master_metadata_album_album_name: null,
            spotify_track_uri: null,
            episode_name: `Ep. ${1 + Math.floor(rand() * 200)}: ${titleCase(2)}`,
            episode_show_name: show,
            spotify_episode_uri: `spotify:episode:sample${SHOWS.indexOf(show)}`,
            reason_end: 'endplay',
            skipped: false,
          })
          prevSkipped = false
          prevTrack = null
        } else {
          let track: Track
          if (s === obsession && prevTrack) {
            track = prevTrack
          } else {
            // Often stay with the same artist for a bit, otherwise wander within the scene
            const artist = prevTrack && rand() < 0.35 ? prevTrack.artistIndex : weightedIndex(sceneWeights, rand)
            const tracks = tracksByArtist[artist]
            track = tracks[Math.min(tracks.length - 1, Math.floor(rand() ** 2 * tracks.length))]
          }
          const skipped = s !== obsession && rand() < track.skipChance * (shuffle ? 1.3 : 1)
          // Most skips come in the first few seconds, but some land anywhere in the song
          const ms = skipped ? 1_000 + Math.floor(rand() ** 3 * (track.durationMs - 1_000)) : track.durationMs
          t += ms
          records.push({
            ...base,
            ts: isoSeconds(t),
            ms_played: ms,
            master_metadata_track_name: track.title,
            master_metadata_album_artist_name: ARTISTS[track.artistIndex],
            master_metadata_album_album_name: track.album,
            spotify_track_uri: track.uri,
            episode_name: null,
            episode_show_name: null,
            spotify_episode_uri: null,
            reason_end: skipped ? 'fwdbtn' : 'trackdone',
            skipped,
          })
          prevSkipped = skipped
          prevTrack = track
        }
        t += Math.floor(rand() * 3_000)
      }
    }
  }

  return records
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
