import { describe, expect, it } from 'vitest'
import { appleDevice, loadApple, looseKey, parseDay, parseTime, splitDescription, titleKey } from '../../src/data/apple'
import { appleFileKind, isAppleArchiveName, type AppleFile } from '../../src/data/appleFiles'
import { dayNumber, startDate, summarize, UNMATCHED_ARTIST } from '../../src/data/stats'
import type { Play } from '../../src/types'
import { appleText, dailyTracks, library, playActivity, playRow, PLAY_ACTIVITY_COLUMNS, PRIVATE, recentlyPlayed, trackPlayHistory, ymd } from '../apple'
import { at } from '../helpers'

type Row = Record<string, string | number>

function load(rows: Row[], extra: AppleFile[] = []) {
  const warnings: string[] = []
  const result = loadApple([appleText('playActivity', playActivity(rows)), ...extra], warnings)
  return { ...result, warnings }
}

const artistsOf = (rows: Row[], extra: AppleFile[] = []) => load(rows, extra).plays.map((p) => `${p.title}: ${p.artist}`)

describe('Apple file names', () => {
  it.each([
    ['Apple_Media_Services/Apple Music Activity/Apple Music Play Activity.csv', 'playActivity'],
    ['apple music play activity.csv', 'playActivity'],
    ['Apple Music - Play History Daily Tracks.csv', 'dailyTracks'],
    ['Apple Music - Recently Played Tracks.csv', 'recentlyPlayed'],
    ['Apple Music - Track Play History.csv', 'trackHistory'],
    ['Apple Music Library Tracks.json', 'library'],
    ['__MACOSX/Apple Music Activity/._Apple Music Play Activity.csv', null],
    ['Stores Activity/Apple Pay Activity.csv', null],
    ['Apple Music Library Playlists.json', null],
    // What an unzip tool, a second download or another export version might do to a name
    ['APPLE MUSIC PLAY ACTIVITY.CSV', 'playActivity'],
    ['Apple_Music_Play_Activity.csv', 'playActivity'],
    ['Apple Music Play Activity (1).csv', 'playActivity'],
    ['Apple Music Play Activity 2.csv', 'playActivity'],
    ['Apple Music-Play History Daily Tracks.csv', 'dailyTracks'],
    ['Apple Music – Track Play History.csv', 'trackHistory'],
    ['Apple Music  Library Tracks.json', 'library'],
    // ...but never a different name or type
    ['Apple Music Play Activity.json', null],
    ['Apple Music Play Activity Summary.csv', null],
    ['Apple Music Library Tracks.json.zip', null],
  ])('%s → %s', (path, kind) => {
    expect(appleFileKind(path)).toBe(kind)
  })

  it('opens only the zips Apple nests its music files in', () => {
    expect(isAppleArchiveName('Apple Media Services information/Apple_Media_Services.zip')).toBe(true)
    expect(isAppleArchiveName('Apple Music Activity/Apple Music Library Tracks.json.zip')).toBe(true)
    expect(isAppleArchiveName('iCloud Photos.zip')).toBe(false)
    expect(isAppleArchiveName('__MACOSX/._Apple_Media_Services.zip')).toBe(false)
    expect(isAppleArchiveName('Apple Media Services.zip')).toBe(true)
    expect(isAppleArchiveName('Apple_Media_Services (1).zip')).toBe(true)
    expect(isAppleArchiveName('Apple Music Library Tracks.json')).toBe(false)
  })
})

describe('reading play activity', () => {
  it('turns a playback into a Play, field by field', () => {
    const start = at(2024, 3, 14, 9)
    const { plays } = load([playRow(start, { 'Song Name': 'Blue', 'Album Name': 'Sky', 'Artist Name': 'Lumen Kid' })])
    expect(plays).toEqual([
      {
        endTime: start.getTime() + 180_000,
        msPlayed: 180_000,
        kind: 'track',
        title: 'Blue',
        artist: 'Lumen Kid',
        album: 'Sky',
        uri: '',
        platform: 'iOS',
        country: '',
        reasonStart: '',
        reasonEnd: 'trackdone',
        shuffle: null,
        skipped: false,
        offline: false,
        incognito: false,
      },
    ])
    expect(startDate(plays[0])).toEqual(start)
  })

  it('never copies private columns', () => {
    const result = load([playRow(at(2024, 3, 14), { 'Artist Name': 'A' })])
    const out = JSON.stringify(result)
    for (const value of Object.values(PRIVATE)) expect(out).not.toContain(value)
  })

  it('keeps only playback events', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const { plays, skippedRows } = load([
      playRow(t, { 'Song Name': 'Kept', 'Artist Name': 'A' }),
      playRow(t + 600_000, { 'Song Name': 'Lyrics', 'Event Type': 'LYRIC_DISPLAY', 'Artist Name': 'A' }),
      playRow(t + 900_000, { 'Song Name': 'Started', 'Event Type': 'PLAY_START', 'Artist Name': 'A' }),
    ])
    expect(plays.map((p) => p.title)).toEqual(['Kept'])
    expect(skippedRows).toBe(0)
  })

  it('reads exports without an Event Type column as all playbacks', () => {
    const columns = PLAY_ACTIVITY_COLUMNS.filter((c) => c !== 'Event Type')
    const warnings: string[] = []
    const { plays } = loadApple([appleText('playActivity', playActivity([playRow(at(2024, 1, 1), { 'Artist Name': 'A' })], columns))], warnings)
    expect(plays).toHaveLength(1)
  })

  it('reads older exports that call the song Content Name', () => {
    const columns = [...PLAY_ACTIVITY_COLUMNS.filter((c) => c !== 'Song Name'), 'Content Name']
    const warnings: string[] = []
    const rows = [playRow(at(2024, 1, 1), { 'Content Name': 'Old Song', 'Artist Name': 'A' })]
    const { plays } = loadApple([appleText('playActivity', playActivity(rows, columns))], warnings)
    expect(plays.map((p) => p.title)).toEqual(['Old Song'])
  })

  it('counts playbacks with no song or no time as skipped rows, and drops ones with no listening', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const { plays, skippedRows } = load([
      playRow(t, { 'Song Name': '' }),
      playRow(t, { 'Song Name': 'No time', 'Event Start Timestamp': '', 'Event End Timestamp': 'garbage' }),
      playRow(t, { 'Song Name': 'Silent', 'Play Duration Milliseconds': 0, 'Artist Name': 'A' }),
    ])
    expect(plays).toEqual([])
    expect(skippedRows).toBe(2)
  })

  it('leaves out music videos, as Spotify’s video history is, and says so', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const { plays, skippedRows, warnings } = load([
      playRow(t, { 'Song Name': 'Clip', 'Media Type': 'VIDEO', 'Artist Name': 'A' }),
      playRow(t + 600_000, { 'Song Name': 'Song', 'Artist Name': 'A' }),
      playRow(t + 1_200_000, { 'Song Name': 'Clip', 'Media Type': 'VIDEO', 'Artist Name': 'A' }),
    ])
    expect(plays.map((p) => p.title)).toEqual(['Song'])
    expect(skippedRows).toBe(0)
    expect(warnings).toEqual(['2 Apple Music video plays left out (video history isn’t supported yet)'])
  })

  it('works out a missing start time or duration from the others', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const { plays } = load([
      playRow(t, { 'Song Name': 'No start', 'Event Start Timestamp': '', 'Play Duration Milliseconds': 60_000, 'Artist Name': 'A' }),
      playRow(t + 3_600_000, {
        'Song Name': 'No duration',
        'Play Duration Milliseconds': '',
        'Event End Timestamp': new Date(t + 3_780_000).toISOString(),
        'Artist Name': 'A',
      }),
    ])
    // The end is start + 60s, so the start comes back exactly
    expect(startDate(plays[0]).getTime()).toBe(t)
    expect(plays[0].msPlayed).toBe(60_000)
    // Without a duration, the event's span stands in
    expect(plays[1].msPlayed).toBe(180_000)
  })

  it('finds columns whatever their case or punctuation', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const columns = PLAY_ACTIVITY_COLUMNS.map((c) => c.toLowerCase().replaceAll(' ', '_'))
    const row = Object.fromEntries(Object.entries(playRow(t, { 'Song Name': 'Blue', 'Artist Name': 'A' })).map(([k, v]) => [k.toLowerCase().replaceAll(' ', '_'), v]))
    const warnings: string[] = []
    const { plays } = loadApple([appleText('playActivity', playActivity([row], columns))], warnings)
    expect(plays.map((p) => [p.title, p.artist, startDate(p).getTime()])).toEqual([['Blue', 'A', t]])
    expect(warnings).toEqual([])
  })

  it('reads library keys whatever their case', () => {
    const rows = [playRow(at(2024, 3, 14, 9), { 'Song Name': 'Blue' })]
    expect(artistsOf(rows, [appleText('library', JSON.stringify([{ title: 'Blue', ARTIST: 'Lumen Kid', album: 'Sky' }]))])).toEqual(['Blue: Lumen Kid'])
  })

  it('falls back to the container’s album, and reads the offline flag', () => {
    const { plays } = load([playRow(at(2024, 1, 1), { 'Album Name': '', 'Container Album Name': 'Live at Home', Offline: 'TRUE', 'Artist Name': 'A' })])
    expect(plays[0]).toMatchObject({ album: 'Live at Home', offline: true })
  })

  it('maps end reasons onto Spotify’s, so skips count the same way', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const reasons = ['TRACK_SKIPPED_FORWARDS', 'TRACK_SKIPPED_BACKWARDS', 'MANUALLY_SELECTED_PLAYBACK_OF_A_DIFF_ITEM', 'PLAYBACK_MANUALLY_PAUSED', 'SCRUB_END']
    const { plays } = load(reasons.map((r, i) => playRow(t + i * 600_000, { 'Song Name': r, 'End Reason Type': r, 'Play Duration Milliseconds': 20_000, 'Artist Name': 'A' })))
    expect(plays.map((p) => [p.reasonEnd, p.skipped])).toEqual([
      ['fwdbtn', true],
      ['backbtn', false],
      ['clickrow', false],
      ['endplay', false],
      ['scrub_end', false],
    ])
  })

  it('reads shuffle where the row records it, and leaves it unknown where it doesn’t', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const values = ['SHUFFLE_OFF', 'SHUFFLE_ON', 'shuffle_on_songs', '', 'SHUFFLE_UNKNOWN', 'N/A']
    const { plays } = load(values.map((v, i) => playRow(t + i * 600_000, { 'Song Name': `S${i}`, 'Shuffle Play': v, 'Artist Name': 'A' })))
    expect(plays.map((p) => p.shuffle)).toEqual([false, true, true, null, null, null])
  })

  it('names the device from what older rows record when Build Version is empty', () => {
    const t = at(2024, 3, 14, 9).getTime()
    const devices: Row[] = [
      { 'Device Type': 'IPHONE', 'Device OS Name': 'iOS', 'Source Type': 'ORIGINATING_DEVICE' },
      { 'Device Type': 'MACINTOSH', 'Device OS Name': 'macOS' },
      { 'Device Type': 'APPLE_TV' },
      { 'Device Type': 'UNKNOWN_DEVICE', 'Device OS Name': 'Unidentified OS', 'Source Type': 'AMAZON' },
      { 'Device Type': 'UNKNOWN_DEVICE', 'Device OS Name': 'Unidentified OS', 'Source Type': 'ORIGINATING_DEVICE' },
      { 'Build Version': 'Music/1.3 macOS/13.0.1 build/22A400 model/MacBookPro18,1', 'Device Type': 'IPHONE' },
    ]
    const rows = devices.map((d, i) => playRow(t + i * 600_000, { 'Song Name': `S${i}`, 'Artist Name': 'A', 'Build Version': '', ...d }))
    expect(load(rows).plays.map((p) => p.platform)).toEqual(['iOS', 'macOS', 'Apple TV', 'Speakers & cast', 'Unknown', 'macOS'])
  })

  it('warns when the export doesn’t record end reasons', () => {
    const columns = PLAY_ACTIVITY_COLUMNS.filter((c) => c !== 'End Reason Type')
    const warnings: string[] = []
    const { plays } = loadApple([appleText('playActivity', playActivity([playRow(at(2024, 1, 1), { 'Artist Name': 'A' })], columns))], warnings)
    expect(plays[0].skipped).toBe(false)
    expect(warnings).toEqual(['Apple Music Play Activity.csv doesn’t say which songs were skipped, so skips show as 0%.'])
  })
})

describe('joining split listens', () => {
  const t = at(2024, 3, 14, 9).getTime()
  const part = (start: number, played: number, position: number, o: Row = {}) =>
    playRow(start, {
      'Artist Name': 'A',
      'Play Duration Milliseconds': played,
      'Start Position In Milliseconds': position,
      'Media Duration In Milliseconds': 200_000,
      'End Reason Type': 'PLAYBACK_MANUALLY_PAUSED',
      ...o,
    })

  it('joins a listen split by a short pause or a seek', () => {
    const { plays } = load([part(t, 60_000, 0), part(t + 70_000, 70_000, 60_000), part(t + 150_000, 70_000, 130_000, { 'End Reason Type': 'NATURAL_END_OF_TRACK' })])
    expect(plays).toHaveLength(1)
    expect(plays[0]).toMatchObject({ msPlayed: 200_000, reasonEnd: 'trackdone', skipped: false })
    expect(startDate(plays[0]).getTime()).toBe(t)
  })

  it('takes shuffle from the part that started the listen', () => {
    const { plays } = load([part(t, 60_000, 0, { 'Shuffle Play': 'SHUFFLE_ON' }), part(t + 65_000, 60_000, 60_000)])
    expect(plays).toHaveLength(1)
    expect(plays[0].shuffle).toBe(true)
  })

  it('takes the skip from the part that ended the listen', () => {
    const { plays } = load([part(t, 60_000, 0), part(t + 65_000, 5_000, 60_000, { 'End Reason Type': 'TRACK_SKIPPED_FORWARDS' })])
    expect(plays).toHaveLength(1)
    expect(plays[0].skipped).toBe(true)
  })

  it('keeps a song on repeat as separate plays', () => {
    const full = { 'Play Duration Milliseconds': 200_000, 'End Reason Type': 'NATURAL_END_OF_TRACK' }
    const { plays } = load([part(t, 200_000, 0, full), part(t + 201_000, 200_000, 0, full), part(t + 402_000, 200_000, 0, full)])
    expect(plays).toHaveLength(3)
  })

  it('treats starting over from the top as a new play', () => {
    const { plays } = load([part(t, 30_000, 0, { 'End Reason Type': 'TRACK_SKIPPED_BACKWARDS' }), part(t + 31_000, 200_000, 0)])
    expect(plays).toHaveLength(2)
  })

  it('treats a long pause as two plays, like Spotify does', () => {
    const { plays } = load([part(t, 60_000, 0), part(t + 600_000, 140_000, 60_000)])
    expect(plays).toHaveLength(2)
  })

  it('doesn’t join different songs', () => {
    const { plays } = load([part(t, 60_000, 0), part(t + 61_000, 60_000, 60_000, { 'Song Name': 'Other' })])
    expect(plays).toHaveLength(2)
  })

  it('caps a play at the track’s length', () => {
    const { plays } = load([part(t, 150_000, 0), part(t + 151_000, 150_000, 10_000)])
    expect(plays[0].msPlayed).toBe(200_000)
  })

  it('ignores events seen twice, such as the same export dropped twice', () => {
    const rows = [part(t, 60_000, 0), part(t + 70_000, 140_000, 60_000)]
    const warnings: string[] = []
    const files = [appleText('playActivity', playActivity(rows)), appleText('playActivity', playActivity(rows))]
    const result = loadApple(files, warnings)
    expect(result.plays).toHaveLength(1)
    expect(result.plays[0].msPlayed).toBe(200_000)
    expect(result.duplicateRows).toBe(2)
  })
})

describe('finding artists', () => {
  const day = at(2024, 3, 14, 9)
  const t = day.getTime()
  const song = (title: string, i: number, o: Row = {}) => playRow(t + i * 600_000, { 'Song Name': title, 'Album Name': '', ...o })
  const dailyOn = (date: Date, ...descriptions: string[]) => appleText('dailyTracks', dailyTracks(descriptions.map((d) => ({ description: d, date: ymd(date) }))))
  const daily = (...descriptions: string[]) => dailyOn(day, ...descriptions)
  // Weeks from the day the songs in these tests are played
  const anotherDay = at(2024, 1, 5)
  const playedFrom = (album: string, artist: string): Row => ({ 'Album Name': album, 'Container Type': 'ALBUM', 'Container Artist Name': artist })

  it('uses the row’s own artist when there is one', () => {
    expect(artistsOf([song('Blue', 0, { 'Artist Name': 'Lumen Kid' })], [daily('Someone Else - Blue')])).toEqual(['Blue: Lumen Kid'])
  })

  it('takes the only artist the export pairs with a title', () => {
    expect(artistsOf([song('Blue Plastic', 0)], [daily('Yung Lean - Blue Plastic')])).toEqual(['Blue Plastic: Yung Lean'])
  })

  it('reads every file that describes tracks', () => {
    const extra = [
      appleText('recentlyPlayed', recentlyPlayed(['Bladee - Reality Surf'])),
      appleText('trackHistory', trackPlayHistory(['Queen - Somebody to Love'])),
      appleText('library', library([{ Title: 'Intro', Artist: 'The xx', Album: 'xx' }])),
    ]
    expect(artistsOf([song('Reality Surf', 0), song('Somebody to Love', 1), song('Intro', 2)], extra)).toEqual([
      'Reality Surf: Bladee',
      'Somebody to Love: Queen',
      'Intro: The xx',
    ])
  })

  it('matches titles despite case, curly quotes and spacing', () => {
    expect(artistsOf([song('Don’t  Stop  Me Now', 0)], [daily("Queen - don't stop me now")])).toEqual(['Don’t  Stop  Me Now: Queen'])
  })

  it('splits "Artist - Title" where either side has a dash', () => {
    const rows = [song('Hayloft II - Live', 0), song('Mas Que Nada', 1), song('Teardrop', 2)]
    const extra = [daily('Mother Mother - Hayloft II - Live', 'Sérgio Mendes - Brasil ’66 - Mas Que Nada', 'Jay-Z - Teardrop')]
    expect(artistsOf(rows, extra)).toEqual(['Hayloft II - Live: Mother Mother', 'Mas Que Nada: Sérgio Mendes - Brasil ’66', 'Teardrop: Jay-Z'])
  })

  it('prefers the album artist from the row when a title has several artists', () => {
    const rows = [song('Somebody to Love', 0, { 'Container Artist Name': 'Jefferson Airplane' })]
    expect(artistsOf(rows, [daily('Queen - Somebody to Love', 'Queen - Somebody to Love', 'Jefferson Airplane - Somebody to Love')])).toEqual([
      'Somebody to Love: Jefferson Airplane',
    ])
  })

  it('doesn’t trust an album artist the other files never pair with the title', () => {
    // A playlist's "artist" is its curator
    const rows = [song('Blue Plastic', 0, { 'Container Artist Name': 'Some Curator' })]
    expect(artistsOf(rows, [daily('Yung Lean - Blue Plastic')])).toEqual(['Blue Plastic: Yung Lean'])
  })

  it('tries a looser title match before an album artist the other files never name', () => {
    const rows = [song('Fade (feat. Someone)', 0, { 'Container Artist Name': 'Some Curator' })]
    expect(artistsOf(rows, [daily('Copper Kites - Fade')])).toEqual(['Fade (feat. Someone): Copper Kites'])
  })

  it('takes the row’s album artist over a lone match when the rest of the album agrees', () => {
    // The other files only have M83's "Intro", but this one is on The xx's album
    const rows = [song('Crystalised', 0, { 'Album Name': 'xx', 'Container Artist Name': 'The xx' }), song('Intro', 1, { 'Album Name': 'xx', 'Container Artist Name': 'The xx' })]
    expect(artistsOf(rows, [daily('The xx - Crystalised', 'M83 - Intro')])).toEqual(['Crystalised: The xx', 'Intro: The xx'])
  })

  it('believes the album a row was played from over another artist’s song of that name', () => {
    const rows = [0, 1, 2].map((i) => song('Stay', i, playedFrom('Real Album', 'Real Artist')))
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Obscure Band - Stay')])).toEqual(['Stay: Real Artist', 'Stay: Real Artist', 'Stay: Real Artist'])
  })

  it.each([
    ['no Container Type', ''],
    ['a Container Type that names nothing', '3'],
  ])('knows a row was played from an album by its Container Album Name, with %s', (_, type) => {
    const rows = [song('Stay', 0, { 'Album Name': 'Real Album (Deluxe)', 'Container Album Name': 'Real Album (Deluxe)', 'Container Artist Name': 'Real Artist', 'Container Type': type })]
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Obscure Band - Stay')])).toEqual(['Stay: Real Artist'])
  })

  it('still doesn’t believe a playlist’s curator, whatever the other columns say', () => {
    const rows = [song('Blue Plastic', 0, { 'Album Name': 'Stranger', 'Container Album Name': 'Stranger', 'Container Artist Name': 'Some Curator', 'Container Type': 'PLAYLIST' })]
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Yung Lean - Blue Plastic')])).toEqual(['Blue Plastic: Yung Lean'])
  })

  it('credits a song on someone else’s album to its own artist when that artist played that day', () => {
    const rows = [song('Nightcall', 0, playedFrom('Drive', 'Cliff Martinez'))]
    expect(artistsOf(rows, [daily('Kavinsky - Nightcall')])).toEqual(['Nightcall: Kavinsky'])
  })

  it('credits a song on someone else’s album to its own artist when the library files it there', () => {
    const rows = [song('Nightcall', 0, playedFrom('Drive', 'Cliff Martinez'))]
    expect(artistsOf(rows, [appleText('library', library([{ Title: 'Nightcall', Artist: 'Kavinsky', Album: 'Drive' }]))])).toEqual(['Nightcall: Kavinsky'])
  })

  it('moves a lone match to the rest of the album when the export has that song on other days', () => {
    const rows = [song('One', 0, { 'Album Name': 'Numbers' }), song('Two', 1, { 'Album Name': 'Numbers' }), song('Stay', 2, { 'Album Name': 'Numbers' })]
    expect(artistsOf(rows, [daily('Counting Crows - One', 'Counting Crows - Two'), dailyOn(anotherDay, 'Obscure Band - Stay')])[2]).toBe('Stay: Counting Crows')
  })

  it('moves a lone match to the rest of the album when the library has that song on another album', () => {
    const rows = [song('One', 0, { 'Album Name': 'Numbers' }), song('Stay', 1, { 'Album Name': 'Numbers' })]
    const extra = [daily('Counting Crows - One'), appleText('library', library([{ Title: 'Stay', Artist: 'Obscure Band', Album: 'Other Album' }]))]
    expect(artistsOf(rows, extra)[1]).toBe('Stay: Counting Crows')
  })

  const uncovered: [string, Row][] = [
    ['nothing else on the row', {}],
    ['a playlist’s curator on the row', { 'Container Type': 'PLAYLIST', 'Container Artist Name': 'Some Curator' }],
  ]
  it.each(uncovered)('doesn’t move a lone match to an album of the same name over a day Daily Tracks doesn’t cover, with %s', (_, row) => {
    // Daily Tracks starts after this play, so it can't say the song wasn't played that day
    const rows = [song('Bohemian Rhapsody', 0, { 'Album Name': 'Greatest Hits', ...row })]
    const eagles = library([
      { Title: 'Take It Easy', Artist: 'Eagles', Album: 'Greatest Hits' },
      { Title: 'Desperado', Artist: 'Eagles', Album: 'Greatest Hits' },
    ])
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Queen - Bohemian Rhapsody'), appleText('library', eagles)])).toEqual(['Bohemian Rhapsody: Queen'])
  })

  it('doesn’t take a song’s last played date to mean it wasn’t played before then', () => {
    // Recently Played only has a song's last play, and this one is the year before it
    const rows = [playRow(at(2023, 6, 1, 9), { 'Song Name': 'Stay', 'Album Name': 'Numbers' })]
    const extra = [appleText('recentlyPlayed', recentlyPlayed(['Obscure Band - Stay'])), appleText('library', library([{ Title: 'One', Artist: 'Counting Crows', Album: 'Numbers' }]))]
    expect(artistsOf(rows, extra)).toEqual(['Stay: Obscure Band'])
  })

  describe('by track length', () => {
    const lengthOf = (ms: number | string): Row => ({ 'Media Duration In Milliseconds': ms })
    const LENGTH = 354_000

    /** Queen's song is on another album, and the album this play names is the Eagles' */
    const bohemian = (played: number | string, known?: number) =>
      artistsOf(
        [song('Bohemian Rhapsody', 0, { 'Album Name': 'Greatest Hits', ...lengthOf(played) })],
        [
          appleText(
            'library',
            library([
              { Title: 'Bohemian Rhapsody', Artist: 'Queen', Album: 'A Night at the Opera', 'Track Duration': known },
              { Title: 'Take It Easy', Artist: 'Eagles', Album: 'Greatest Hits' },
              { Title: 'Desperado', Artist: 'Eagles', Album: 'Greatest Hits' },
            ]),
          ),
        ],
      )

    it.each([
      ['the same length', LENGTH],
      ['a slightly different length, as another release of it can be', LENGTH + 3_000],
    ])('keeps a lone match at %s, whoever the album belongs to', (_, played) => {
      expect(bohemian(played, LENGTH)).toEqual(['Bohemian Rhapsody: Queen'])
    })

    it.each<[string, number | string, number | undefined]>([
      ['a different length', LENGTH + 3_001, LENGTH],
      ['no length on the row', '', LENGTH],
      ['no length in the library', LENGTH, undefined],
    ])('moves a lone match to the rest of the album with %s', (_, played, known) => {
      expect(bohemian(played, known)).toEqual(['Bohemian Rhapsody: Eagles'])
    })

    const stays: [string, Date, number, string[]][] = [
      ['an earlier play, the same length', at(2024, 3, 8, 9), 200_000, ['Stay: Obscure Band', 'Stay: Obscure Band']],
      ['a later play, the same length', at(2024, 3, 20, 9), 200_000, ['Stay: Obscure Band', 'Stay: Obscure Band']],
      ['a later play, a different length', at(2024, 3, 20, 9), 260_000, ['Stay: Counting Crows', 'Stay: Obscure Band']],
    ]
    it.each(stays)('learns a song’s length from plays the export ties to its artist, for %s', (_, date, played, expected) => {
      const rows = [
        song('Stay', 0, lengthOf(200_000)),
        playRow(date, { 'Song Name': 'One', 'Album Name': 'Numbers' }),
        playRow(date.getTime() + 600_000, { 'Song Name': 'Stay', 'Album Name': 'Numbers', ...lengthOf(played) }),
      ]
      const artists = artistsOf(rows, [daily('Obscure Band - Stay'), dailyOn(date, 'Counting Crows - One')])
      expect(artists.filter((a) => a.startsWith('Stay')).sort()).toEqual(expected)
    })

    it('doesn’t learn a length from a play nothing ties to the artist', () => {
      // Nothing places the first play, so it's M83's by default, but it could be anyone's song of that name
      const rows = [song('Intro', 0, lengthOf(128_000)), song('Crystalised', 1, { 'Album Name': 'xx' }), song('Intro', 2, { 'Album Name': 'xx', ...lengthOf(128_000) })]
      const extra = [
        appleText(
          'library',
          library([
            { Title: 'Intro', Artist: 'M83', Album: 'Hurry Up, We’re Dreaming' },
            { Title: 'Crystalised', Artist: 'The xx', Album: 'xx' },
          ]),
        ),
      ]
      expect(artistsOf(rows, extra)).toEqual(['Intro: M83', 'Crystalised: The xx', 'Intro: The xx'])
    })

    it.each([
      ['the same length', 258_000, 'Kavinsky'],
      ['a different length', 300_000, 'Cliff Martinez'],
    ])('weighs the album a row was played from against a match at %s', (_, played, expected) => {
      const rows = [song('Nightcall', 0, { ...playedFrom('Drive', 'Cliff Martinez'), ...lengthOf(played) })]
      const extra = [appleText('library', library([{ Title: 'Nightcall', Artist: 'Kavinsky', Album: 'OutRun', 'Track Duration': 258_000 }]))]
      expect(artistsOf(rows, extra)).toEqual([`Nightcall: ${expected}`])
    })

    it.each([
      ['Home (Remastered 2011)', 200_000, 'Foo'],
      ['Home (Acoustic)', 150_000, UNMATCHED_ARTIST],
    ])('believes a trimmed title on another album only at the same length: %s', (title, played, expected) => {
      const rows = [song(title, 0, { 'Album Name': 'Real Album', ...lengthOf(played) })]
      const extra = [appleText('library', library([{ Title: 'Home', Artist: 'Foo', Album: 'Other Album', 'Track Duration': 200_000 }]))]
      expect(artistsOf(rows, extra)).toEqual([`${title}: ${expected}`])
    })
  })

  it('keeps a title’s only match when nothing else names anyone', () => {
    const rows = [song('Stay', 0, { 'Album Name': 'Real Album' })]
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Obscure Band - Stay')])).toEqual(['Stay: Obscure Band'])
  })

  it('lets a row played from an album speak for that album’s other songs', () => {
    const rows = [song('Stay', 0, playedFrom('Real Album', 'Real Artist')), song('Hidden Track', 1, { 'Album Name': 'Real Album' })]
    expect(artistsOf(rows, [dailyOn(anotherDay, 'Obscure Band - Stay')])[1]).toBe('Hidden Track: Real Artist')
  })

  it('believes the album a row was played from over another artist’s album of the same name', () => {
    const queen = [0, 1, 2, 3, 4].map((i) => song(`Song ${i}`, i, { 'Album Name': 'Greatest Hits' }))
    const rows = [...queen, song('Dancing Queen', 5, playedFrom('Greatest Hits', 'ABBA'))]
    expect(artistsOf(rows, [daily(...queen.map((_, i) => `Queen - Song ${i}`))])[5]).toBe('Dancing Queen: ABBA')
  })

  it('doesn’t take a trimmed title for someone else’s song on the album a row was played from', () => {
    const rows = [song('Home (Acoustic)', 0, playedFrom('Real Album', 'Real Artist'))]
    expect(artistsOf(rows, [daily('Obscure Band - Home')])).toEqual(['Home (Acoustic): Real Artist'])
  })

  it.each([
    ['other days', () => dailyOn(anotherDay, 'Obscure Band - Home')],
    ['another album', () => appleText('library', library([{ Title: 'Home', Artist: 'Obscure Band', Album: 'Other Album' }]))],
  ])('doesn’t believe a trimmed title when the export has that song on %s', (_, file) => {
    expect(artistsOf([song('Home (Acoustic)', 0, { 'Album Name': 'Real Album' })], [file()])).toEqual([`Home (Acoustic): ${UNMATCHED_ARTIST}`])
  })

  it('believes a trimmed title on the same album', () => {
    const rows = [song('Wires [Live]', 0, { 'Album Name': 'Wires' })]
    expect(artistsOf(rows, [appleText('library', library([{ Title: 'Wires', Artist: 'Static Bloom', Album: 'Wires' }]))])).toEqual(['Wires [Live]: Static Bloom'])
  })

  it('keeps editions of an album apart, since two artists can share a title and an album name', () => {
    const rows = [song('Lightning', 0, { 'Album Name': 'Lightning' })]
    const extra = [
      appleText('library', library([{ Title: 'Lightning', Artist: 'Lavender Static', Album: 'Lightning (Deluxe)' }])),
      appleText('trackHistory', trackPlayHistory(['Satin Season - Lightning', 'Satin Season - Lightning'])),
    ]
    expect(artistsOf(rows, extra)).toEqual(['Lightning: Satin Season'])
  })

  it('doesn’t let an album of the same name outweigh a candidate the export doesn’t place anywhere else', () => {
    const owners = [0, 1, 2].map((i) => song(`Track ${i}`, i, { 'Album Name': 'Telephone' }))
    const rows = [...owners, song('Everything Is Soft', 3, { 'Album Name': 'Telephone' })]
    const extra = [
      daily(...owners.map((_, i) => `Midnight Atlas - Track ${i}`)),
      appleText('trackHistory', trackPlayHistory(['Hana Holloway - Everything Is Soft', 'Other Band - Everything Is Soft'])),
    ]
    expect(artistsOf(rows, extra)[3]).toBe('Everything Is Soft: Hana Holloway')
  })

  it('doesn’t trim brackets that are part of the title', () => {
    expect(artistsOf([song('(Don’t Fear) The Reaper', 0)], [daily('Obscure Band - The Reaper')])).toEqual([`(Don’t Fear) The Reaper: ${UNMATCHED_ARTIST}`])
  })

  it('tells same-titled songs apart by the album Recently Played names', () => {
    const rows = [song('Intro', 0, { 'Album Name': 'xx' }), song('Intro', 1, { 'Album Name': 'Hurry Up, We’re Dreaming' })]
    const recent = appleText(
      'recentlyPlayed',
      recentlyPlayed([
        { description: 'The xx - Intro', album: 'The xx - xx' },
        { description: 'M83 - Intro', album: 'M83 - Hurry Up, We’re Dreaming' },
      ]),
    )
    expect(artistsOf(rows, [recent])).toEqual(['Intro: The xx', 'Intro: M83'])
  })

  it('learns an album’s artist from Recently Played, for songs no file names', () => {
    const rows = [song('Unlisted', 0, { 'Album Name': 'xx' })]
    const recent = appleText('recentlyPlayed', recentlyPlayed([{ description: 'The xx - Crystalised', album: 'The xx - xx' }]))
    expect(artistsOf(rows, [recent])).toEqual(['Unlisted: The xx'])
  })

  it('ignores a Recently Played album credited to someone other than the track’s artist', () => {
    const rows = [song('Unlisted', 0, { 'Album Name': 'Hits' })]
    const recent = appleText('recentlyPlayed', recentlyPlayed([{ description: 'Robyn - Dancing On My Own', album: 'Various Artists - Hits' }]))
    expect(artistsOf(rows, [recent])).toEqual([`Unlisted: ${UNMATCHED_ARTIST}`])
  })

  it('uses the album artist when nothing else names one, unless it’s a placeholder', () => {
    const rows = [song('Rare B-Side', 0, { 'Container Artist Name': 'Juniper Vale' }), song('Compilation Track', 1, { 'Container Artist Name': 'Various Artists' })]
    expect(artistsOf(rows)).toEqual(['Rare B-Side: Juniper Vale', `Compilation Track: ${UNMATCHED_ARTIST}`])
  })

  it('settles a shared title by the library’s album', () => {
    const rows = [song('Intro', 0, { 'Album Name': 'Currents' })]
    const extra = [
      daily('The xx - Intro', 'The xx - Intro', 'Tame Impala - Intro'),
      appleText('library', library([{ Title: 'Intro', Artist: 'Tame Impala', Album: 'Currents' }, { Title: 'Intro', Artist: 'The xx', Album: 'xx' }])),
    ]
    expect(artistsOf(rows, extra)).toEqual(['Intro: Tame Impala'])
  })

  it('settles a shared title by who the rest of the album belongs to', () => {
    const rows = [
      song('Let It Happen', 0, { 'Album Name': 'Currents' }),
      song('The Less I Know the Better', 1, { 'Album Name': 'Currents' }),
      song('Intro', 2, { 'Album Name': 'Currents' }),
    ]
    const extra = [daily('Tame Impala - Let It Happen', 'Tame Impala - The Less I Know the Better', 'The xx - Intro', 'The xx - Intro', 'Tame Impala - Intro')]
    expect(artistsOf(rows, extra)[2]).toBe('Intro: Tame Impala')
  })

  it('settles a shared title by who was played that day', () => {
    const tuesday = at(2024, 3, 12, 9)
    const friday = at(2024, 3, 15, 9)
    const rows = [playRow(tuesday, { 'Song Name': 'Somebody to Love', 'Album Name': '' }), playRow(friday, { 'Song Name': 'Somebody to Love', 'Album Name': '' })]
    const extra = [
      appleText(
        'dailyTracks',
        dailyTracks([
          { description: 'Queen - Somebody to Love', date: ymd(tuesday) },
          { description: 'Jefferson Airplane - Somebody to Love', date: ymd(friday) },
        ]),
      ),
      // Seen more often overall, but not on either day
      appleText('trackHistory', trackPlayHistory(['Justin Bieber - Somebody to Love', 'Justin Bieber - Somebody to Love', 'Justin Bieber - Somebody to Love'])),
    ]
    expect(artistsOf(rows, extra)).toEqual(['Somebody to Love: Queen', 'Somebody to Love: Jefferson Airplane'])
  })

  it('otherwise picks the artist seen most often, then alphabetically', () => {
    const extra = [appleText('trackHistory', trackPlayHistory(['B - Home', 'B - Home', 'A - Home', 'Y - Gold', 'X - Gold']))]
    expect(artistsOf([song('Home', 0), song('Gold', 1)], extra)).toEqual(['Home: B', 'Gold: X'])
  })

  it('tries again without "(feat. ...)", "[Live]" or " - Remastered"', () => {
    const rows = [song('Fade (feat. Someone)', 0), song('Wires [Live]', 1), song('Kites - 2011 Remaster', 2)]
    expect(artistsOf(rows, [daily('Copper Kites - Fade', 'Static Bloom - Wires', 'Desert Radio - Kites')])).toEqual([
      'Fade (feat. Someone): Copper Kites',
      'Wires [Live]: Static Bloom',
      'Kites - 2011 Remaster: Desert Radio',
    ])
  })

  it('fills in a song nothing names from the rest of its album', () => {
    const rows = [song('One', 0, { 'Album Name': 'Numbers' }), song('Two', 1, { 'Album Name': 'Numbers' }), song('Hidden Track', 2, { 'Album Name': 'Numbers' })]
    expect(artistsOf(rows, [daily('Counting Crows - One', 'Counting Crows - Two')])[2]).toBe('Hidden Track: Counting Crows')
  })

  it('looks up the artist when the row names a placeholder like Various Artists', () => {
    const rows = [song('Compilation Track', 0, { 'Artist Name': 'Various Artists' }), song('Other', 1, { 'Artist Name': 'Apple Music' })]
    expect(artistsOf(rows, [daily('Juniper Vale - Compilation Track')])).toEqual(['Compilation Track: Juniper Vale', `Other: ${UNMATCHED_ARTIST}`])
  })

  it('doesn’t fill in from an album several artists share', () => {
    const rows = [song('One', 0, { 'Album Name': 'Greatest Hits' }), song('Two', 1, { 'Album Name': 'Greatest Hits' }), song('Hidden Track', 2, { 'Album Name': 'Greatest Hits' })]
    expect(artistsOf(rows, [daily('Queen - One', 'ABBA - Two')])[2]).toBe(`Hidden Track: ${UNMATCHED_ARTIST}`)
  })

  it('keeps plays with no artist anywhere, and counts and warns about them', () => {
    const { plays, unmatchedArtists, warnings } = load([song('Mystery', 0), song('Known', 1)], [daily('Someone - Known')])
    expect(plays.map((p) => p.artist)).toEqual([UNMATCHED_ARTIST, 'Someone'])
    expect(unmatchedArtists).toBe(1)
    expect(warnings).toEqual([
      '50% of Apple Music plays had no artist anywhere in the export. Artists come from the export’s other Apple Music files, so drop the whole zip rather than the play activity alone.',
    ])
  })

  it('doesn’t warn when nearly every play has an artist', () => {
    const rows = Array.from({ length: 20 }, (_, i) => song(i === 0 ? 'Mystery' : 'Known', i))
    expect(load(rows, [daily('Someone - Known')]).warnings).toEqual([])
  })

  it('spells each artist one way, the library’s first, so case doesn’t split them', () => {
    const rows = [song('Blinding Lights', 0), song('Starboy', 1), song('Save Your Tears', 2, { 'Artist Name': 'THE WEEKND' })]
    const extra = [daily('the weeknd - Starboy'), appleText('library', library([{ Title: 'Blinding Lights', Artist: 'The Weeknd' }]))]
    expect(new Set(artistsOf(rows, extra).map((a) => a.split(': ')[1]))).toEqual(new Set(['The Weeknd']))
  })

  it('otherwise spells an artist the way the export does most', () => {
    const rows = [song('Starboy', 0), song('Blinding Lights', 1)]
    const extra = [daily('the weeknd - Starboy', 'the weeknd - Starboy'), appleText('trackHistory', trackPlayHistory(['The Weeknd - Blinding Lights']))]
    expect(artistsOf(rows, extra)).toEqual(['Starboy: the weeknd', 'Blinding Lights: the weeknd'])
    expect(artistsOf(rows, [...extra].reverse())).toEqual(['Starboy: the weeknd', 'Blinding Lights: the weeknd'])
  })

  it('gives the same answer whatever order the files come in', () => {
    const rows = [song('Home', 0), song('Gold', 1), song('Intro', 2, { 'Album Name': 'xx' })]
    const files = [
      daily('B - Home', 'A - Home'),
      appleText('trackHistory', trackPlayHistory(['A - Home', 'B - Home', 'Y - Gold', 'X - Gold'])),
      appleText('library', library([{ Title: 'Intro', Artist: 'The xx', Album: 'xx' }, { Title: 'Intro', Artist: 'Tame Impala', Album: 'Currents' }])),
    ]
    const forwards = artistsOf(rows, files)
    expect(artistsOf(rows, [...files].reverse())).toEqual(forwards)
    expect(artistsOf([...rows].reverse(), files)).toEqual(forwards)
  })
})

describe('splitDescription', () => {
  const known = new Set(['song - remastered 2011', 'mas que nada'])
  it.each([
    ['Artist - Song - Remastered 2011', ['Artist', 'Song - Remastered 2011']],
    ['Sérgio Mendes - Brasil 66 - Mas Que Nada', ['Sérgio Mendes - Brasil 66', 'Mas Que Nada']],
    ['Unknown Band - Some - Thing', ['Unknown Band', 'Some - Thing']],
    ['Band – Title', ['Band', 'Title']],
    ['No separator', null],
    ['Jay-Z-Song', null],
  ])('%s', (text, expected) => {
    expect(splitDescription(text, known, new Set())).toEqual(expected)
  })
})

describe('title keys', () => {
  it('ignores case, Unicode forms, quotes, dashes and spacing', () => {
    expect(titleKey('  Don’t  Stop—Me ')).toBe("don't stop-me")
    expect(titleKey('Ｆｕｌｌ')).toBe('full')
  })

  it('loosely, also drops featured artists, brackets and version notes', () => {
    expect(looseKey('Song (feat. X)')).toBe('song')
    expect(looseKey('Song feat. X')).toBe('song')
    expect(looseKey('Song [Live at Wembley]')).toBe('song')
    expect(looseKey('Song - 2011 Remaster')).toBe('song')
    expect(looseKey('Song (feat. X) - 2011 Remaster')).toBe('song')
    expect(looseKey('Song - Remastered (2011)')).toBe('song')
    expect(looseKey('Song (Live) [2011]')).toBe('song')
    expect(looseKey('(Untitled)')).toBe('')
  })

  it('loosely, keeps brackets that aren’t at the end', () => {
    expect(looseKey('(Don’t Fear) The Reaper')).toBe("(don't fear) the reaper")
    expect(looseKey('Hello (Goodbye) World')).toBe('hello (goodbye) world')
  })
})

describe('appleDevice', () => {
  it.each([
    ['Music/1.4.5 iOS/17.4 model/iPhone15,2 build/21E219', 'iOS'],
    ['Music/1.4 iPadOS/17.4 model/iPad13,4', 'iOS'],
    ['Music/1.4 macOS/14.4.1 model/Mac14,2', 'macOS'],
    ['iTunes/12.13 (Windows; Microsoft Windows 11)', 'Windows'],
    ['Apple Music/4.6 Android/14 model/Pixel 8', 'Android'],
    ['Music/1.0 watchOS/10.4 model/Watch6,1', 'Apple Watch'],
    ['TVMusic/1.0 tvOS/17.4 model/AppleTV11,1', 'Apple TV'],
    ['Music/1.0 audioOS/17.4 model/AudioAccessory6,1', 'Speakers & cast'],
    ['MusicKit JS/3 (Chrome 124; macOS 14)', 'Web'],
    // As real exports write them
    ['Music/3.1 iOS/12.0 model/iPhone11,6 hwp/t8020 build/16A366 (6; dt:189)', 'iOS'],
    ['Music/3.1 iOS/11.3 model/iPad7,3 hwp/t8011 build/15E216 (5; dt:168)', 'iOS'],
    ['Music/1.0.3 macOS/10.15.3 build/19D76 model/MacBookPro11,3', 'macOS'],
    ['iTunes/12.7.0.166 (Macintosh; OS X 10.12.6) AppleWebKit/603.3.8', 'macOS'],
    ['iTunes/12.8.0.150 macOS/10.13.6 build/17G65 model/MacBookPro14,3', 'macOS'],
    ['Music/3.3 Android/8.0.0 model/samsungSMG965U build/G965USQU2ARC6 (dt:66)', 'Android'],
    ['', 'Unknown'],
    ['Something/1.0', 'Other'],
  ])('%s → %s', (build, family) => {
    expect(appleDevice(build)).toBe(family)
  })
})

describe('loadApple', () => {
  it('asks for the play activity when it’s missing', () => {
    const warnings: string[] = []
    const result = loadApple([appleText('dailyTracks', dailyTracks([{ description: 'A - B', date: '20240101' }]))], warnings)
    expect(result.plays).toEqual([])
    expect(result.filesRead).toEqual(['Apple Music - Play History Daily Tracks.csv'])
    expect(warnings).toEqual([
      'Apple Music Play Activity.csv wasn’t found, and it’s the file that holds your plays. Drop the whole Apple Media Services zip (every part, if it came in several).',
    ])
  })

  it('doesn’t ask for the play activity when the loader already said it was too large', () => {
    const warnings: string[] = []
    const result = loadApple([appleText('dailyTracks', dailyTracks([{ description: 'A - B', date: '20240101' }]))], warnings, { skippedFiles: true })
    expect(result.plays).toEqual([])
    expect(warnings).toEqual([])
  })

  it('counts a song played on Spotify and Apple Music as one song', () => {
    const spotifyPlay = (uri: string, artist = 'Marlowe Fox'): Play => ({
      endTime: at(2023, 1, 1).getTime(),
      msPlayed: 200_000,
      kind: 'track',
      title: 'Old Favourite',
      artist,
      album: 'Album',
      uri,
      platform: 'Android',
      country: 'US',
      reasonStart: 'trackdone',
      reasonEnd: 'trackdone',
      shuffle: true,
      skipped: false,
      offline: false,
      incognito: false,
    })
    // The album version is played more, so it's the one Apple's plays join
    const spotify = [spotifyPlay('spotify:track:single'), spotifyPlay('spotify:track:album'), spotifyPlay('spotify:track:album'), spotifyPlay('spotify:track:x', 'Someone Else')]
    const rows = [
      playRow(at(2024, 1, 1), { 'Song Name': 'Old Favourite', 'Artist Name': 'marlowe fox' }),
      playRow(at(2024, 1, 2), { 'Song Name': 'Apple Only', 'Artist Name': 'Marlowe Fox' }),
    ]
    const { plays } = loadApple([appleText('playActivity', playActivity(rows))], [], { spotify })
    expect(plays.map((p) => p.uri)).toEqual(['spotify:track:album', ''])
    expect(summarize([...spotify.slice(1, 3), plays[0]]).tracks).toBe(1)
  })

  it('warns about files that aren’t what their name says', () => {
    const warnings: string[] = []
    const result = loadApple(
      [
        appleText('playActivity', 'not,a,play,file\n1,2,3,4\n'),
        appleText('library', '{broken'),
        appleText('dailyTracks', 'hello\nworld\n'),
        appleText('playActivity', playActivity([playRow(at(2024, 1, 1), { 'Artist Name': 'A' })])),
      ],
      warnings,
    )
    expect(result.plays).toHaveLength(1)
    expect(result.filesRead).toEqual(['Apple Music Play Activity.csv'])
    expect(warnings).toEqual([
      'Apple Music Play Activity.csv: doesn’t look like the Apple Music file it’s named after',
      'Apple Music Library Tracks.json: doesn’t look like the Apple Music file it’s named after',
      'Apple Music - Play History Daily Tracks.csv: doesn’t look like the Apple Music file it’s named after',
    ])
  })
})

describe('reading times', () => {
  const nine = Date.UTC(2024, 2, 14, 9, 0, 0)

  it.each([
    ['2024-03-14T09:00:00Z', nine],
    ['2024-03-14T09:00:00.000Z', nine],
    ['2024-03-14T09:00:00.123456Z', nine + 123],
    ['2024-03-14t09:00:00z', nine],
    ['2024-03-14 09:00:00', nine],
    ['2024-03-14 09:00', nine],
    ['2024-03-14 09:00:00 UTC', nine],
    ['2024-03-14T09:00:00+00:00', nine],
    ['2024-03-14T09:00:00+0000', nine],
    ['2024-03-14T10:30:00+01:30', nine],
    ['2024-03-14T02:00:00-07:00', nine],
    ['2024-03-14T02:00:00-07', nine],
    [' 2024-03-14T09:00:00Z ', nine],
    [String(nine), nine],
    [String(nine / 1000), nine],
    ['Thu, 14 Mar 2024 09:00:00 GMT', nine],
  ])('%s', (s, expected) => {
    expect(parseTime(s)).toBe(expected)
  })

  it.each(['', 'garbage', '2024-03-14', '2024-13-14T09:00:00Z', '2024-02-30T09:00:00Z', '2024-03-14T25:00:00Z', '03/14/2024 09:00:00', '12345'])(
    'reads %j as no time, rather than guessing a zone or a day order',
    (s) => {
      expect(parseTime(s)).toBeNull()
    },
  )

  it('reads Daily Tracks dates in any of the usual forms, as a local day', () => {
    const day = dayNumber(at(2024, 3, 14))
    for (const s of ['20240314', '2024-03-14', '2024/03/14', '2024/3/14', '2024.03.14', '2024-03-14T00:00:00Z', ' 20240314 ']) {
      expect(parseDay(s)).toBe(day)
    }
    for (const s of ['', '2024031', '202403140', '2024-02-30', '14/03/2024']) expect(parseDay(s)).toBeNull()
  })
})
