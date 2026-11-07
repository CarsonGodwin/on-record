import { describe, expect, it } from 'vitest'
import { dayDetail, songStats } from '../../src/data/insights'
import { estimateDurations, lastfmReader, looksLikeLastfm, scrobbleTime } from '../../src/data/lastfm'
import { loadFiles, loadSample, type PlayActivityBudget } from '../../src/data/load'
import { tallySongs } from '../../src/data/lovehate'
import { COUNTED_PLAY_MS, dayNumber, platforms, replayCurve, scrobblesLeftOut, summarize, wearOut } from '../../src/data/stats'
import { at, play } from '../helpers'

const MINUTE = 60_000
const START = Date.UTC(2026, 3, 24, 2, 37)

/** Formats a time the way the export does, in UTC */
function stamp(ms: number): string {
  const d = new Date(ms)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getUTCDate())} ${month} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}

/** Newest first, as exports are */
function csv(rows: [artist: string, album: string, track: string, time: number][]): string {
  const cell = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return (
    [...rows]
      .sort((a, b) => b[3] - a[3])
      .map(([artist, album, track, time]) => [artist, album, track, stamp(time)].map(cell).join(','))
      .join('\n') + '\n'
  )
}

const scrobble = (artist: string, title: string, start: number) => ({ start, artist, album: '', title })

describe('scrobbleTime', () => {
  it('reads the time as UTC, whatever the zone', () => {
    expect(scrobbleTime('06 Nov 2026, 20:57')).toBe(Date.UTC(2026, 10, 6, 20, 57))
    expect(scrobbleTime('6 Nov 2026, 20:57')).toBe(Date.UTC(2026, 10, 6, 20, 57))
  })

  it('refuses what is not a real time', () => {
    for (const bad of ['', '31 Feb 2026, 10:00', '06 Nov 2026, 25:00', '06 Nov 2026, 20:61', '2026-11-06 20:57', '06 Foo 2026, 20:57', '01 Jan 1970, 00:00']) {
      expect(scrobbleTime(bad), bad).toBeNull()
    }
  })
})

describe('looksLikeLastfm', () => {
  const good = 'A,Album,Song,"06 Nov 2026, 20:57"\nB,,Other,"06 Nov 2026, 20:50"\n'

  it('accepts a scrobble export', () => {
    expect(looksLikeLastfm(good, true)).toBe(true)
    expect(looksLikeLastfm(`﻿${good}`, true)).toBe(true)
  })

  it('allows a song still playing, which has no date yet', () => {
    expect(looksLikeLastfm(`A,Album,Song,\n${good}`, true)).toBe(true)
  })

  it('refuses other CSVs', () => {
    expect(looksLikeLastfm('', true)).toBe(false)
    expect(looksLikeLastfm('Artist,Album,Track,Date\nA,B,C,D\n', true)).toBe(false)
    expect(looksLikeLastfm('A,Album,Song,\n', true)).toBe(false)
    expect(looksLikeLastfm('Item,Price,Store,"06 Nov 2026, 20:57",4242-4242\n', true)).toBe(false)
    expect(looksLikeLastfm(`${good}Item,Price,Store,2026-11-06\n`, true)).toBe(false)
  })

  it('ignores the row a partial read cuts off', () => {
    expect(looksLikeLastfm(`${good}C,Alb`, false)).toBe(true)
  })
})

describe('lastfmReader', () => {
  it('reads a file split anywhere, and counts rows it can not use', () => {
    const text = `﻿A,"Album, with comma",Song,"06 Nov 2026, 20:57"\n,x,y,"06 Nov 2026, 20:50"\nB,,Song 2,\nC,,Song 3,"01 Jan 1970, 00:00"\n`
    const reader = lastfmReader()
    for (const c of text) reader.push(c)
    const { scrobbles, skippedRows, undatedRows } = reader.end()
    expect(scrobbles).toEqual([{ start: Date.UTC(2026, 10, 6, 20, 57), artist: 'A', album: 'Album, with comma', title: 'Song' }])
    expect(skippedRows).toBe(3)
    // Only the 1970 row: no artist or no date at all were never a usable scrobble
    expect(undatedRows).toBe(1)
  })
})

describe('estimateDurations', () => {
  it("takes a song's median gap, so one long break doesn't stretch it", () => {
    const s = [0, 3, 6, 9, 12, 40].map((m) => scrobble('A', 'Song', START + m * MINUTE))
    expect(estimateDurations(s).slice(0, 4)).toEqual([3, 3, 3, 3].map((m) => m * MINUTE))
    // The one before the break played as long as it usually does
    expect(estimateDurations(s)[4]).toBe(3 * MINUTE)
  })

  it('uses the shortest gap of a song with only a few', () => {
    const s = [scrobble('A', 'Once', START), scrobble('B', 'x', START + 4 * MINUTE), scrobble('B', 'x', START + 8 * MINUTE)]
    expect(estimateDurations(s)[0]).toBe(4 * MINUTE)
  })

  it('falls back on the artist, then the whole history, for a song with no usable gap', () => {
    const steady = [0, 5, 10, 15].map((m) => scrobble('A', `S${m}`, START + m * MINUTE))
    const lastByArtist = estimateDurations([...steady, scrobble('A', 'End', START + 20 * MINUTE)])
    expect(lastByArtist[4]).toBe(5 * MINUTE)
    const lastByHistory = estimateDurations([...steady, scrobble('Z', 'End', START + 20 * MINUTE)])
    expect(lastByHistory[4]).toBe(5 * MINUTE)
  })

  it('has a length for a lone scrobble', () => {
    expect(estimateDurations([scrobble('A', 'Song', START)])[0]).toBeGreaterThan(0)
  })

  it('never runs into the next song, but every scrobble still counts as a play', () => {
    const usual = [0, 5, 10, 15].map((m) => scrobble('A', 'Long', START + m * MINUTE))
    const cut = [...usual, scrobble('B', 'Next', START + 17 * MINUTE)]
    expect(estimateDurations(cut)[3]).toBe(2 * MINUTE)
    const sameMinute = estimateDurations([scrobble('A', 'One', START), scrobble('B', 'Two', START), scrobble('C', 'Three', START + 3 * MINUTE)])
    expect(sameMinute[0]).toBe(30_000)
  })
})

describe('loadFiles with a Last.fm export', () => {
  const file = (text: string, name = 'someuser.csv') => new File([text], name, { type: 'text/csv' })
  const rows = (count: number, from = START): [string, string, string, number][] =>
    Array.from({ length: count }, (_, i) => ['Artist', 'Album', `Song ${i % 3}`, from + i * 3 * MINUTE])

  it('turns scrobbles into plays that admit what they do not know', async () => {
    const result = await loadFiles([file(csv(rows(10)))])
    expect(result.sources).toEqual(['lastfm'])
    expect(result.filesRead).toEqual(['someuser.csv'])
    expect(result.plays).toHaveLength(10)
    const first = result.plays[0]
    expect(first.endTime - first.msPlayed).toBe(START)
    expect(first).toMatchObject({ kind: 'track', artist: 'Artist', album: 'Album', skipped: null, shuffle: null, platform: '', uri: '' })
    expect(result.plays.map((p) => p.endTime)).toEqual([...result.plays.map((p) => p.endTime)].sort((a, b) => a - b))
  })

  it('counts a file dropped twice once', async () => {
    const text = csv(rows(10))
    const result = await loadFiles([file(text, 'a.csv'), file(text, 'b.csv')])
    expect(result.plays).toHaveLength(10)
    expect(result.duplicateRows).toBe(10)
    expect(result.repeatScrobbles).toEqual([])
  })

  it('keeps one of a song repeated in a minute, and holds the rest back', async () => {
    const [first, ...others] = rows(4)
    const text = csv([first, first, first, ...others])
    const result = await loadFiles([file(text)])
    expect(result.plays).toHaveLength(4)
    expect(result.repeatScrobbles).toHaveLength(2)
    expect(result.duplicateRows).toBe(0)
    expect(result.repeatScrobbles[0]).toMatchObject({ title: result.plays[0].title, msPlayed: COUNTED_PLAY_MS, skipped: null })
    expect(result.repeatScrobbles[0].endTime - result.repeatScrobbles[0].msPlayed).toBe(START)
  })

  it('finds no more repeats when a file with repeats is dropped twice', async () => {
    const [first, ...others] = rows(4)
    const text = csv([first, first, ...others])
    const result = await loadFiles([file(text, 'a.csv'), file(text, 'b.csv')])
    expect(result.plays).toHaveLength(4)
    expect(result.repeatScrobbles).toHaveLength(1)
    expect(result.duplicateRows).toBe(5)
  })

  it('does not hold back repeats on days a Spotify export covers', async () => {
    const day = Date.UTC(2026, 3, 25, 12)
    const spotify = [
      {
        ts: new Date(day).toISOString(),
        ms_played: 180_000,
        platform: 'ios',
        conn_country: 'US',
        master_metadata_track_name: 'Song 0',
        master_metadata_album_artist_name: 'Artist',
        master_metadata_album_album_name: 'Album',
        spotify_track_uri: 'spotify:track:zero',
        reason_start: 'trackdone',
        reason_end: 'trackdone',
        shuffle: false,
        skipped: false,
        offline: false,
        incognito_mode: false,
      },
    ]
    const [first] = rows(1, day - 3 * MINUTE)
    const result = await loadFiles([new File([JSON.stringify(spotify)], 'Streaming_History_Audio_2026.json'), file(csv([first, first]))])
    expect(result.repeatScrobbles).toEqual([])
    expect(result.overlapRows).toBe(2)
  })

  it('mentions what was left out only when it is a real share of the file', async () => {
    const [first, ...others] = rows(150)
    const many = await loadFiles([file(csv([first, first, first, ...others]))])
    expect(scrobblesLeftOut(many)).toEqual({ total: 152, shown: 150, repeats: 2, undated: 0 })

    const undated = await loadFiles([file(`${csv(rows(50))}C,,Song 3,"01 Jan 1970, 00:00"\n`)])
    expect(scrobblesLeftOut(undated)).toEqual({ total: 51, shown: 50, repeats: 0, undated: 1 })

    const few = await loadFiles([file(csv([first, first, ...rows(500, START + MINUTE)]))])
    expect(few.repeatScrobbles).toHaveLength(1)
    expect(scrobblesLeftOut(few)).toBeNull()

    expect(scrobblesLeftOut(await loadFiles([file(csv(rows(10)))]))).toBeNull()
    expect(scrobblesLeftOut(loadSample())).toBeNull()
  })

  it('counts scrobbles with no real date on their own', async () => {
    const result = await loadFiles([file(`${csv(rows(2))}C,,Song 3,"01 Jan 1970, 00:00"\nD,,Song 4,\n`)])
    expect(result.plays).toHaveLength(2)
    expect(result.skippedRows).toBe(2)
    expect(result.undatedRows).toBe(1)
  })

  it('leaves other CSVs unread and says so', async () => {
    const result = await loadFiles([file('Item,Price,Store,Date\nCoffee,3,Shop,2026-01-01\n', 'Apple Pay.csv')])
    expect(result.plays).toHaveLength(0)
    expect(result.filesRead).toEqual([])
    expect(result.warnings[0]).toContain('not one of Apple Music’s history files')
  })

  it('says what a Last.fm export looks like when a CSV has nothing to do with Apple', async () => {
    const result = await loadFiles([file('artist,album,track,date\nA,B,Song,"06 Nov 2026, 20:57"\n', 'scrobbles.csv')])
    expect(result.plays).toHaveLength(0)
    expect(result.warnings).toEqual(['scrobbles.csv: skipped (not a history file; a Last.fm export has four columns and no header)'])
  })

  it('does not open a scrobble CSV inside a zip', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('someuser.csv', csv(rows(5)))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const result = await loadFiles([new File([bytes as BlobPart], 'export.zip')])
    expect(result.plays).toHaveLength(0)
  })

  it('stops at the row limit that files share', async () => {
    const { readLastfmFile } = await import('../../src/data/load')
    const budget: PlayActivityBudget = { bytes: 1_000_000, events: 3 }
    const warnings: string[] = []
    // Arrives in one piece, so what's been counted only catches up on the next
    const found = await readLastfmFile(file(csv(rows(10))), warnings, { ...budget, bytes: 10 })
    expect(found.failures[0]).toContain('too large')
    expect(found.lastfm).toEqual([])
  })

  it("keeps Spotify's plays on the days Spotify covers, and shares its song IDs on the others", async () => {
    const spotifyDay = Date.UTC(2026, 3, 25, 12)
    const spotify = [
      {
        ts: new Date(spotifyDay).toISOString(),
        ms_played: 180_000,
        platform: 'ios',
        conn_country: 'US',
        master_metadata_track_name: 'Song 0',
        master_metadata_album_artist_name: 'Artist',
        master_metadata_album_album_name: 'Album',
        spotify_track_uri: 'spotify:track:zero',
        reason_start: 'trackdone',
        reason_end: 'trackdone',
        shuffle: false,
        skipped: false,
        offline: false,
        incognito_mode: false,
      },
    ]
    const scrobbles = [...rows(2, START), ...rows(3, spotifyDay - 3 * MINUTE)]
    const result = await loadFiles([new File([JSON.stringify(spotify)], 'Streaming_History_Audio_2026.json'), file(csv(scrobbles))])
    expect(result.sources).toEqual(['spotify', 'lastfm'])
    expect(result.overlapRows).toBe(3)
    expect(result.plays).toHaveLength(3)
    const fromLastfm = result.plays.filter((p) => p.skipped === null)
    expect(fromLastfm).toHaveLength(2)
    expect(fromLastfm.find((p) => p.title === 'Song 0')?.uri).toBe('spotify:track:zero')
  })
})

describe('skips a history cannot record', () => {
  const unknown = play(at(2024, 1, 1), { skipped: null, shuffle: null, platform: '' })

  it('makes the skip rate unknown instead of 0', () => {
    expect(summarize([unknown]).skipRate).toBeNull()
  })

  it('leaves those plays out of a mixed history', () => {
    const skipped = play(at(2024, 1, 2), { skipped: true })
    expect(summarize([unknown, skipped]).skipRate).toBe(1)
  })

  it("doesn't count them as let play on Love / Hate", () => {
    expect(tallySongs([unknown])).toEqual([])
    expect(songStats([unknown, unknown, unknown, unknown], 10)).toEqual([])
  })

  it('leaves them out of the wear-out curve', () => {
    const plays = Array.from({ length: 60 }, (_, i) => play(at(2024, 1, 1 + (i % 28)), { skipped: null }))
    expect(wearOut(plays, null).rates).toEqual([])
  })

  it('says nothing of skips on a day with only those plays', () => {
    const day = dayNumber(at(2024, 1, 1))
    expect(dayDetail([unknown], day, new Map()).skips).toBeNull()
    expect(dayDetail([play(at(2024, 1, 1))], day, new Map()).skips).toBe(0)
  })

  it('lists no device for them', () => {
    expect(platforms([unknown])).toEqual([])
  })
})

describe('replayCurve', () => {
  it('gives the share of songs reaching each play', () => {
    const plays = ['a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((title) => play(at(2024, 1, 1), { title }))
    expect(replayCurve(plays)).toEqual([1, 0.5, 0.5])
  })

  it('stops once too few songs are left', () => {
    expect(replayCurve([play(at(2024, 1, 1))])).toEqual([])
  })
})
