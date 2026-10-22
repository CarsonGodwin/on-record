import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { isHistoryFileName, loadFiles, loadSample } from '../../src/data/load'
import { toPlay } from '../../src/data/parse'
import { generateSampleRecords } from '../../src/data/sample'
import type { RawStreamRecord } from '../../src/types'

/*
 * Pins down how Spotify exports load, so changes to the loader (such as adding
 * Apple Music) can't quietly change what Spotify listeners see.
 */

function raw(ts: string, overrides: Partial<RawStreamRecord> = {}): RawStreamRecord {
  return {
    ts,
    platform: 'iOS 17.4 (iPhone15,2)',
    ms_played: 200_000,
    conn_country: 'US',
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:1',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    incognito_mode: false,
    ...overrides,
  }
}

const AUDIO_2023 = [
  raw('2023-05-01T10:03:20Z', { master_metadata_track_name: 'B', spotify_track_uri: 'spotify:track:b' }),
  raw('2023-05-01T10:00:00Z', { master_metadata_track_name: 'A', spotify_track_uri: 'spotify:track:a', shuffle: true }),
  // A local file: no track, episode or audiobook info
  raw('2023-05-01T10:06:00Z', { master_metadata_track_name: null, master_metadata_album_artist_name: null, spotify_track_uri: null }),
]
const AUDIO_2024 = [
  raw('2024-01-02T08:00:00Z', {
    master_metadata_track_name: null,
    master_metadata_album_artist_name: null,
    spotify_track_uri: null,
    episode_name: 'Ep. 1',
    episode_show_name: 'A Show',
    spotify_episode_uri: 'spotify:episode:1',
  }),
]

const json = (value: unknown) => JSON.stringify(value)

function file(name: string, body: BlobPart): File {
  return new File([body], name)
}

async function zip(name: string, entries: Record<string, string | ArrayBuffer>): Promise<File> {
  const z = new JSZip()
  for (const [path, body] of Object.entries(entries)) z.file(path, body)
  return file(name, await z.generateAsync({ type: 'arraybuffer' }))
}

function spotifyZip() {
  return zip('my_spotify_data.zip', {
    'Spotify Extended Streaming History/Streaming_History_Audio_2023.json': json(AUDIO_2023),
    'Spotify Extended Streaming History/Streaming_History_Audio_2024.json': json(AUDIO_2024),
    'Spotify Extended Streaming History/Streaming_History_Video_2023.json': json([raw('2023-01-01T00:00:00Z')]),
    'Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf': 'pdf',
    '__MACOSX/Spotify Extended Streaming History/._Streaming_History_Audio_2023.json': 'junk',
  })
}

describe('isHistoryFileName', () => {
  it.each([
    ['Spotify Extended Streaming History/Streaming_History_Audio_2023.json', true],
    ['Streaming_History_Audio_2019-2021_0.json', true],
    ['StreamingHistory_music_0.json', true],
    ['Streaming_History_Video_2023.json', false],
    ['ReadMeFirst_ExtendedStreamingHistory.pdf', false],
    ['__MACOSX/x/._Streaming_History_Audio_2023.json', false],
    ['.Streaming_History_Audio_2023.json', false],
    ['Userdata.json', false],
  ])('%s → %s', (path, expected) => {
    expect(isHistoryFileName(path)).toBe(expected)
  })
})

describe('loading a Spotify export', () => {
  it('reads the audio history from the zip and ignores everything else', async () => {
    const result = await loadFiles([await spotifyZip()])
    expect(result.filesRead.sort()).toEqual(['Streaming_History_Audio_2023.json', 'Streaming_History_Audio_2024.json'])
    expect(result.plays.map((p) => p.title)).toEqual(['A', 'B', 'Ep. 1'])
    expect(result.skippedRows).toBe(1)
    expect(result.duplicateRows).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it('turns rows into plays field by field', async () => {
    const { plays } = await loadFiles([await spotifyZip()])
    expect(plays[0]).toEqual({
      endTime: Date.parse('2023-05-01T10:00:00Z'),
      msPlayed: 200_000,
      kind: 'track',
      title: 'A',
      artist: 'Artist',
      album: 'Album',
      uri: 'spotify:track:a',
      platform: 'iOS',
      country: 'US',
      reasonStart: 'trackdone',
      reasonEnd: 'trackdone',
      shuffle: true,
      skipped: false,
      offline: false,
      incognito: false,
    })
    expect(plays[2]).toMatchObject({ kind: 'episode', title: 'Ep. 1', artist: 'A Show', album: '', uri: 'spotify:episode:1' })
  })

  it('never copies private fields', async () => {
    const leaky = { ...raw('2023-05-01T10:00:00Z'), ip_addr: '203.0.113.9', username: 'someone', user_agent_decrypted: 'agent' }
    const { plays } = await loadFiles([file('Streaming_History_Audio_2023.json', json([leaky]))])
    const out = JSON.stringify(plays)
    expect(out).not.toContain('203.0.113.9')
    expect(out).not.toContain('someone')
    expect(out).not.toContain('agent')
  })

  it('reads loose JSON files, like the folder Safari unzips to', async () => {
    const result = await loadFiles([
      file('Streaming_History_Audio_2023.json', json(AUDIO_2023)),
      file('Streaming_History_Audio_2024.json', json(AUDIO_2024)),
    ])
    expect(result.plays).toHaveLength(3)
    expect(result.filesRead).toEqual(['Streaming_History_Audio_2023.json', 'Streaming_History_Audio_2024.json'])
  })

  it('ignores the same stream dropped twice', async () => {
    const result = await loadFiles([await spotifyZip(), file('Streaming_History_Audio_2023.json', json(AUDIO_2023))])
    expect(result.plays).toHaveLength(3)
    expect(result.duplicateRows).toBe(2)
    expect(result.skippedRows).toBe(2)
  })

  it('sorts plays by end time across files', async () => {
    const { plays } = await loadFiles([
      file('Streaming_History_Audio_2024.json', json(AUDIO_2024)),
      file('Streaming_History_Audio_2023.json', json(AUDIO_2023)),
    ])
    for (let i = 1; i < plays.length; i++) expect(plays[i].endTime).toBeGreaterThanOrEqual(plays[i - 1].endTime)
  })

  it('explains the basic "Account data" export instead of reading it', async () => {
    const basic = [{ endTime: '2023-05-01 10:00', artistName: 'Artist', trackName: 'Song', msPlayed: 200_000 }]
    const result = await loadFiles([file('StreamingHistory_music_0.json', json(basic))])
    expect(result.plays).toEqual([])
    expect(result.filesRead).toEqual([])
    expect(result.warnings).toEqual([
      'StreamingHistory_music_0.json: this is the basic "Account data" history, which is missing the detail this app needs. Request "Extended streaming history" instead.',
    ])
  })

  it('warns about files it can’t use', async () => {
    const result = await loadFiles([
      file('Streaming_History_Video_2023.json', json([])),
      file('notes.txt', 'hello'),
      file('Streaming_History_Audio_bad.json', '{not json'),
      file('Streaming_History_Audio_obj.json', json({ ts: 'x' })),
      file('Streaming_History_Audio_other.json', json([{ hello: 'world' }])),
      file('broken.zip', 'not a zip'),
      await zip('empty.zip', { 'readme.txt': 'nothing here' }),
    ])
    expect(result.plays).toEqual([])
    // Files are read in parallel, so only the set of warnings is fixed, not their order
    expect([...result.warnings].sort()).toEqual([
      "Streaming_History_Video_2023.json: skipped (video history isn't supported yet)",
      'notes.txt: skipped (not a .zip or .json file)',
      "broken.zip: couldn't open this zip file",
      'empty.zip: no streaming history files found inside',
      "Streaming_History_Audio_bad.json: isn't valid JSON",
      "Streaming_History_Audio_obj.json: doesn't look like a streaming history file",
      "Streaming_History_Audio_other.json: doesn't look like a streaming history file",
    ].sort())
  })

  it('skips a file too large to open safely', async () => {
    const big = file('huge.zip', 'x')
    Object.defineProperty(big, 'size', { value: 600 * 1024 * 1024 })
    const result = await loadFiles([big])
    expect(result.warnings).toEqual(['huge.zip: skipped (too large to open safely in the browser)'])
  })
})

describe('the demo record', () => {
  // The sample is generated in local time, so its exact numbers differ between time
  // zones; what must hold everywhere is that loading keeps every row, in order.
  it('loads every generated row, sorted by end time', () => {
    const { plays, filesRead, skippedRows, duplicateRows, warnings } = loadSample()
    expect({ filesRead, skippedRows, duplicateRows, warnings }).toEqual({
      filesRead: ['Sample data'],
      skippedRows: 0,
      duplicateRows: 0,
      warnings: [],
    })
    const expected = generateSampleRecords()
      .map(toPlay)
      .filter((p) => p !== null)
      .sort((a, b) => a.endTime - b.endTime)
    expect(plays).toEqual(expected)
  })
})
