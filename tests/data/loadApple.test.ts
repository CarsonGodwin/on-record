import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { isHistoryFileName, isImportFileName, loadFiles } from '../../src/data/load'
import { summarize } from '../../src/data/stats'
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
const PRIVATE_FILE = `Merchant,Card,Amount\nCoffee,${PRIVATE['Apple Id Number']},4.50\n`

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

const summaryOf = (plays: { title: string; artist: string; skipped: boolean }[]) => plays.map((p) => `${p.title}: ${p.artist}${p.skipped ? ' (skipped)' : ''}`)

describe('loading an Apple Music export', () => {
  it('opens the zips Apple nests, and reads only the music files', async () => {
    const result = await loadFiles([await appleDownload()])
    expect(summaryOf(result.plays)).toEqual(['Blue Plastic: Yung Lean', 'Intro: The xx', 'Reality Surf: Bladee (skipped)'])
    expect(result.sources).toEqual(['apple'])
    expect(result.filesRead).toEqual([FILE_NAMES.playActivity, FILE_NAMES.dailyTracks, FILE_NAMES.library])
    expect(result.warnings).toEqual([])
    expect(result.unmatchedArtists).toBe(0)
    expect(JSON.stringify(result)).not.toContain(PRIVATE['Apple Id Number'])
    expect(JSON.stringify(result)).not.toContain(PRIVATE['Client IP Address'])
  })

  it('reads the inner zip on its own', async () => {
    const result = await loadFiles([
      file('Apple_Media_Services.zip', await zipBytes({ [`${DIR}/${FILE_NAMES.playActivity}`]: PLAYS, [`${DIR}/${FILE_NAMES.dailyTracks}`]: DAILY })),
    ])
    expect(result.plays).toHaveLength(3)
    expect(result.unmatchedArtists).toBe(1) // Intro's artist is only in the library file
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

  it('reads loose files, like a folder Safari unzipped', async () => {
    const result = await loadFiles([file(FILE_NAMES.dailyTracks, DAILY), file(FILE_NAMES.library, LIBRARY), file(FILE_NAMES.playActivity, PLAYS)])
    expect(summaryOf(result.plays)).toEqual(['Blue Plastic: Yung Lean', 'Intro: The xx', 'Reality Surf: Bladee (skipped)'])
  })

  it('ignores the same export dropped twice', async () => {
    const result = await loadFiles([await appleDownload(), await appleDownload('Again.zip')])
    expect(result.plays).toHaveLength(3)
    expect(result.duplicateRows).toBe(3)
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
})

describe('loading Spotify and Apple Music together', () => {
  const spotify = JSON.stringify([
    {
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
    },
  ])

  it('merges both into one timeline', async () => {
    const result = await loadFiles([await appleDownload(), file('Streaming_History_Audio_2024.json', spotify)])
    expect(result.sources).toEqual(['spotify', 'apple'])
    expect(result.plays.map((p) => p.title)).toEqual(['Old Favourite', 'Blue Plastic', 'Intro', 'Reality Surf'])
    expect(result.filesRead[0]).toBe('Streaming_History_Audio_2024.json')
  })

  it('works out the shuffle rate from the plays that record it', async () => {
    const { plays } = await loadFiles([await appleDownload(), file('Streaming_History_Audio_2024.json', spotify)])
    expect(summarize(plays).shuffleRate).toBe(1)
    expect(summarize(plays.filter((p) => p.shuffle === null)).shuffleRate).toBeNull()
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

  it('leaves the Spotify-only check as it was', () => {
    expect(isHistoryFileName(`${DIR}/${FILE_NAMES.playActivity}`)).toBe(false)
    expect(isHistoryFileName(FILE_NAMES.library)).toBe(false)
  })
})
