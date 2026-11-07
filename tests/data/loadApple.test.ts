import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { entryText, fileText, isImportFileName, loadFiles, readPlayActivity, type TextStream } from '../../src/data/load'
import { UNKNOWN_ARTIST } from '../../src/data/parse'
import { filterPlays, UNMATCHED_ARTIST } from '../../src/data/stats'
import { dailyTracks, FILE_NAMES, library, playActivity, playRow, PRIVATE, ymd } from '../apple'
import { at } from '../helpers'

/*
 * Apple Music exports through the real loader: Apple's zip-in-a-zip layout,
 * downloads split into parts, unzipped folders, and Spotify and Apple together.
 */

const DIR = 'Apple_Media_Services/Apple Music Activity'
const day = at(2024, 3, 14, 9)
const t = day.getTime()

const PLAYS = playActivity([
  playRow(t, { 'Song Name': 'Blue Plastic', 'Album Name': 'Warlord' }),
  playRow(t + 600_000, { 'Song Name': 'Intro', 'Album Name': 'xx' }),
  playRow(t + 1_200_000, { 'Song Name': 'Reality Surf', 'Album Name': 'Icedancer', 'End Reason Type': 'TRACK_SKIPPED_FORWARDS', 'Play Duration Milliseconds': 12_000 }),
])
const DAILY = dailyTracks([
  { description: 'Yung Lean - Blue Plastic', date: ymd(day) },
  { description: 'Bladee - Reality Surf', date: ymd(day) },
])
const LIBRARY = library([{ Title: 'Intro', Artist: 'The xx', Album: 'xx' }])
const PRIVATE_FILE = `Merchant,Card,Amount\nCoffee,${PRIVATE['Apple ID Number']},4.50\n`

function file(name: string, body: BlobPart): File {
  return new File([body], name)
}

async function zipBytes(entries: Record<string, string | ArrayBuffer>): Promise<ArrayBuffer> {
  const z = new JSZip()
  for (const [path, body] of Object.entries(entries)) z.file(path, body)
  return z.generateAsync({ type: 'arraybuffer' })
}

/** Apple's download: a zip holding Apple_Media_Services.zip, which holds the music files (and the library zipped again) */
async function appleDownload(name = 'Apple Media Services information.zip', music: Record<string, string> = {}): Promise<File> {
  const libraryZip = await zipBytes({ [FILE_NAMES.library]: LIBRARY })
  const inner = await zipBytes({
    [`${DIR}/${FILE_NAMES.playActivity}`]: PLAYS,
    [`${DIR}/${FILE_NAMES.dailyTracks}`]: DAILY,
    [`${DIR}/${FILE_NAMES.library}.zip`]: libraryZip,
    'Apple_Media_Services/Stores Activity/Apple Pay Activity.csv': PRIVATE_FILE,
    'Apple_Media_Services/Apple Music Activity/Apple Music Library Playlists.json': '[]',
    ...music,
  })
  return file(name, await zipBytes({ 'Apple Media Services information/Apple_Media_Services.zip': inner, 'Apple Media Services information/Read Me.pdf': 'pdf' }))
}

const summaryOf = (plays: { title: string; artist: string; skipped: boolean | null }[]) => plays.map((p) => `${p.title}: ${p.artist}${p.skipped ? ' (skipped)' : ''}`)

describe('loading an Apple Music export', () => {
  it('opens the zips Apple nests, and reads only the music files', async () => {
    const result = await loadFiles([await appleDownload()])
    expect(summaryOf(result.plays)).toEqual(['Blue Plastic: Yung Lean', 'Intro: The xx', 'Reality Surf: Bladee (skipped)'])
    expect(result.sources).toEqual(['apple'])
    expect(result.filesRead).toEqual([FILE_NAMES.playActivity, FILE_NAMES.dailyTracks, FILE_NAMES.library])
    expect(result.warnings).toEqual([])
    expect(result.unmatchedArtists).toBe(0)
    expect(JSON.stringify(result)).not.toContain(PRIVATE['Apple ID Number'])
    expect(JSON.stringify(result)).not.toContain(PRIVATE['Client IP Address'])
  })

  it('puts a download split into parts back together', async () => {
    const part1 = file('Part 1 of 2.zip', await zipBytes({ 'Part 1/Apple_Media_Services.zip': await zipBytes({ [`${DIR}/${FILE_NAMES.playActivity}`]: PLAYS }) }))
    const part2 = file(
      'Part 2 of 2.zip',
      await zipBytes({ 'Part 2/Apple_Media_Services.zip': await zipBytes({ [`${DIR}/${FILE_NAMES.dailyTracks}`]: DAILY, [`${DIR}/${FILE_NAMES.library}`]: LIBRARY }) }),
    )
    const result = await loadFiles([part1, part2])
    expect(summaryOf(result.plays)).toEqual(['Blue Plastic: Yung Lean', 'Intro: The xx', 'Reality Surf: Bladee (skipped)'])
  })

  it('asks for the play activity when only other files were dropped', async () => {
    const result = await loadFiles([file(FILE_NAMES.dailyTracks, DAILY)])
    expect(result.plays).toEqual([])
    expect(result.warnings).toEqual([
      'Apple Music Play Activity.csv wasn’t found, and it’s the file that holds your plays. Drop the whole Apple Media Services zip (every part, if it came in several).',
    ])
  })

  it('skips other CSV files and zips with no music in them', async () => {
    const result = await loadFiles([
      file('Apple Pay Activity.csv', PRIVATE_FILE),
      file('Part 2 of 2.zip', await zipBytes({ 'Part 2/Apple_Media_Services.zip': await zipBytes({ 'Apple_Media_Services/Stores Activity/Apple Pay Activity.csv': PRIVATE_FILE }) })),
    ])
    expect(result.plays).toEqual([])
    expect(result.warnings).toEqual(['Apple Pay Activity.csv: skipped (not one of Apple Music’s history files)', 'Part 2 of 2.zip: no streaming history files found inside'])
  })

  it('doesn’t open zips nested deeper than Apple nests them', async () => {
    // The download, Apple_Media_Services.zip and the zipped library are as deep as Apple goes
    const tooDeep = await zipBytes({ [FILE_NAMES.playActivity]: PLAYS })
    const level3 = await zipBytes({ 'Apple_Media_Services.zip': tooDeep })
    const level2 = await zipBytes({ 'Apple_Media_Services.zip': level3 })
    const result = await loadFiles([file('deep.zip', await zipBytes({ 'Apple_Media_Services.zip': level2 }))])
    expect(result.plays).toEqual([])
    expect(result.warnings).toEqual(['deep.zip: no streaming history files found inside'])
  })

  it('opens only a few nested zips, however many a zip holds', async () => {
    // Each nested zip gets its own song, so the plays say how many were opened
    const nested: Record<string, ArrayBuffer> = {}
    for (let i = 0; i < 10; i++) {
      nested[`copy ${i}/Apple_Media_Services.zip`] = await zipBytes({
        [FILE_NAMES.playActivity]: playActivity([playRow(t + i * 600_000, { 'Song Name': `Song ${i}`, 'Artist Name': 'A' })]),
      })
    }
    const result = await loadFiles([file('many.zip', await zipBytes(nested))])
    expect(result.plays.length).toBeGreaterThan(0)
    expect(result.plays.length).toBeLessThan(10)
  })
})

describe('a play activity too long to hold as one string', () => {
  const MiB = 1024 * 1024
  const TOO_LARGE = `${FILE_NAMES.playActivity}: skipped (too large to open safely in the browser)`

  /** A file that says it's this big, which is all the size checks look at */
  function sized(f: File, bytes: number): File {
    Object.defineProperty(f, 'size', { value: bytes })
    return f
  }

  /** A file the browser hands over a few bytes at a time, so characters get split between pieces */
  function trickling(name: string, body: string, size = 3): File {
    const f = file(name, body)
    const bytes = new TextEncoder().encode(body)
    f.stream = () =>
      new ReadableStream({
        start(controller) {
          for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size))
          controller.close()
        },
      }) as ReturnType<File['stream']>
    return f
  }

  it('reads a file past the longest possible string', async () => {
    const result = await loadFiles([sized(file(FILE_NAMES.playActivity, PLAYS), 600 * MiB), file(FILE_NAMES.dailyTracks, DAILY), file(FILE_NAMES.library, LIBRARY)])
    expect(summaryOf(result.plays)).toEqual(['Blue Plastic: Yung Lean', 'Intro: The xx', 'Reality Surf: Bladee (skipped)'])
    expect(result.warnings).toEqual([])
  })

  it('reads a file up to its limit and no further, and doesn’t then ask for the file', async () => {
    const atLimit = await loadFiles([sized(file(FILE_NAMES.playActivity, PLAYS), 4 * 1024 * MiB)])
    expect(atLimit.plays).toHaveLength(3)

    const over = await loadFiles([sized(file(FILE_NAMES.playActivity, PLAYS), 4 * 1024 * MiB + 1), file(FILE_NAMES.dailyTracks, DAILY)])
    expect(over.plays).toEqual([])
    expect(over.warnings).toEqual([TOO_LARGE])
  })

  it('keeps the usual limit for every other file', async () => {
    const result = await loadFiles([file(FILE_NAMES.playActivity, PLAYS), sized(file(FILE_NAMES.dailyTracks, DAILY), 600 * MiB)])
    expect(result.warnings).toContain(`${FILE_NAMES.dailyTracks}: skipped (too large to open safely in the browser)`)
    expect(result.plays).toHaveLength(3)
  })

  it('puts characters split between pieces back together, and drops a byte order mark', async () => {
    const song = 'Café ☕ 𝄞 ’Ω’'
    const body = `﻿${playActivity([playRow(t, { 'Song Name': song, 'Album Name': 'Ålbum', 'Artist Name': 'Björk' })])}`
    for (const size of [1, 2, 3, 5, 7]) {
      const result = await loadFiles([trickling(FILE_NAMES.playActivity, body, size)])
      expect(result.plays.map((p) => [p.title, p.album, p.artist])).toEqual([[song, 'Ålbum', 'Björk']])
      expect(result.warnings).toEqual([])
    }
  })

  it('reads a long entry from a zip the same as a loose file, unusual characters and all', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => playRow(t + i * 240_000, { 'Song Name': `Café ☕ 𝄞 ${i}`, 'Album Name': `Ålbum ${i % 7}`, 'Artist Name': 'Björk' }))
    const body = playActivity(rows)
    const loose = await loadFiles([file(FILE_NAMES.playActivity, body)])
    const zipped = await loadFiles([file('music.zip', await zipBytes({ [`${DIR}/${FILE_NAMES.playActivity}`]: body }))])
    expect(zipped.plays).toHaveLength(3000)
    expect(zipped.plays).toEqual(loose.plays)
    expect(zipped.warnings).toEqual([])
  })

  it('counts what arrives, whatever size the file claimed', async () => {
    const pieces = [PLAYS.slice(0, 100), PLAYS.slice(100), 'never read']
    let read = 0
    const stream: TextStream = async (onText) => {
      for (const piece of pieces) {
        onText(piece)
        read++
      }
    }
    const warnings: string[] = []
    const found = await readPlayActivity(FILE_NAMES.playActivity, stream, warnings, { bytes: PLAYS.length, events: 100 })
    expect(warnings).toEqual([TOO_LARGE])
    expect(found).toEqual({ spotify: [], apple: [], lastfm: [], appleSkipped: true, failures: [TOO_LARGE] })
    expect(read).toBe(2)
  })

  it('stops at a limit on plays, for a file of very short rows', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => playRow(t + i * 240_000, { 'Song Name': `Song ${i}` }))
    const body = playActivity(rows)
    const stream: TextStream = async (onText) => {
      for (let at = 0; at < body.length; at += 500) onText(body.slice(at, at + 500))
    }
    const warnings: string[] = []
    const found = await readPlayActivity(FILE_NAMES.playActivity, stream, warnings, { bytes: Infinity, events: 10 })
    expect(warnings).toEqual([TOO_LARGE])
    expect(found.appleSkipped).toBe(true)
  })

  it('shares its limits with the upload’s other play activities', async () => {
    const whole: TextStream = async (onText) => {
      onText(PLAYS)
      onText('') // plays are counted as the next piece arrives
    }
    for (const budget of [
      { bytes: PLAYS.length + 10, events: 100 },
      { bytes: Infinity, events: 4 },
    ]) {
      const warnings: string[] = []
      const first = await readPlayActivity('First.csv', whole, warnings, budget)
      const second = await readPlayActivity('Second.csv', whole, warnings, budget)
      expect(first.apple).toHaveLength(1)
      expect(second.apple).toEqual([])
      expect(warnings).toEqual(['Second.csv: skipped (too large to open safely in the browser)'])
    }
  })

  it('stops reading a file once it passes a limit', async () => {
    let cancelled = false
    const endless = file(FILE_NAMES.playActivity, '')
    endless.stream = () =>
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(PLAYS))
        },
        cancel() {
          cancelled = true
        },
      }) as ReturnType<File['stream']>
    const warnings: string[] = []
    await readPlayActivity(FILE_NAMES.playActivity, fileText(endless), warnings, { bytes: 1000, events: 100 })
    expect(warnings).toEqual([TOO_LARGE])
    expect(cancelled).toBe(true)
  })

  it('stops unzipping an entry that passes a limit', async () => {
    const zip = await JSZip.loadAsync(await zipBytes({ [FILE_NAMES.playActivity]: PLAYS.repeat(50) }))
    const warnings: string[] = []
    const found = await readPlayActivity(FILE_NAMES.playActivity, entryText(zip.files[FILE_NAMES.playActivity]), warnings, { bytes: 1000, events: 100 })
    expect(warnings).toEqual([TOO_LARGE])
    expect(found.appleSkipped).toBe(true)
  })

  it('doesn’t ask for a play activity that’s there but damaged', async () => {
    const z = new JSZip()
    z.file(FILE_NAMES.playActivity, PLAYS)
    z.file(FILE_NAMES.dailyTracks, DAILY)
    const bytes = await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const data = 30 + bytes[26] + bytes[27] * 256 + bytes[28] + bytes[29] * 256
    bytes.fill(0xa5, data, data + 40)
    const result = await loadFiles([file('music.zip', bytes as BlobPart)])
    expect(result.warnings).toEqual([`${FILE_NAMES.playActivity}: couldn't be unzipped, so the zip may be damaged. Try downloading it again`])
  })

  it('explains a file the browser can’t read, and doesn’t then ask for it', async () => {
    const locked = file(FILE_NAMES.playActivity, PLAYS)
    locked.stream = () =>
      new ReadableStream({
        start(controller) {
          controller.error(new DOMException('The requested file could not be read', 'NotReadableError'))
        },
      }) as ReturnType<File['stream']>
    const result = await loadFiles([locked, file(FILE_NAMES.dailyTracks, DAILY)])
    expect(result.warnings).toEqual([expect.stringMatching(/^Apple Music Play Activity\.csv: couldn't be read from your computer/)])
  })
})

describe('loading Spotify and Apple Music together', () => {
  const row = {
    ts: new Date(t - 86_400_000).toISOString(),
    platform: 'android',
    ms_played: 200_000,
    conn_country: 'US',
    master_metadata_track_name: 'Old Favourite',
    master_metadata_album_artist_name: 'Marlowe Fox',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:old',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: true,
    skipped: false,
    offline: false,
    incognito_mode: false,
  }
  const spotify = JSON.stringify([row])

  it('merges both into one timeline', async () => {
    const result = await loadFiles([await appleDownload(), file('Streaming_History_Audio_2024.json', spotify)])
    expect(result.sources).toEqual(['spotify', 'apple'])
    expect(result.plays.map((p) => p.title)).toEqual(['Old Favourite', 'Blue Plastic', 'Intro', 'Reality Surf'])
    expect(result.filesRead[0]).toBe('Streaming_History_Audio_2024.json')
  })

  it('hides Apple Music’s unmatched plays without hiding Spotify’s tracks that have no artist', async () => {
    const noArtist = JSON.stringify([{ ...row, master_metadata_track_name: 'Bootleg', master_metadata_album_artist_name: null, spotify_track_uri: 'spotify:track:bootleg' }])
    // Without the library file, Intro's artist can't be found
    const result = await loadFiles([
      file('Apple_Media_Services.zip', await zipBytes({ [`${DIR}/${FILE_NAMES.playActivity}`]: PLAYS, [`${DIR}/${FILE_NAMES.dailyTracks}`]: DAILY })),
      file('Streaming_History_Audio_2024.json', noArtist),
    ])
    expect(result.unmatchedArtists).toBe(1)
    expect(summaryOf(result.plays)).toEqual([`Bootleg: ${UNKNOWN_ARTIST}`, 'Blue Plastic: Yung Lean', `Intro: ${UNMATCHED_ARTIST}`, 'Reality Surf: Bladee (skipped)'])
    const shown = filterPlays(result.plays, { musicOnly: true, hidden: new Set([UNMATCHED_ARTIST]) })
    expect(shown.map((p) => p.title)).toEqual(['Bootleg', 'Blue Plastic', 'Reality Surf'])
  })
})

describe('isImportFileName', () => {
  it.each([
    ['Spotify Extended Streaming History/Streaming_History_Audio_2023.json', true],
    [`Apple Media Services information/Apple_Media_Services.zip`, true],
    [`${DIR}/${FILE_NAMES.playActivity}`, true],
    [`${DIR}/${FILE_NAMES.library}.zip`, true],
    ['Apple_Media_Services/Stores Activity/Apple Pay Activity.csv', false],
    ['Apple_Media_Services/iCloud/Notes.zip', false],
    ['ReadMeFirst_ExtendedStreamingHistory.pdf', false],
  ])('%s → %s', (path, expected) => {
    expect(isImportFileName(path)).toBe(expected)
  })
})
