import { describe, expect, it } from 'vitest'
import { loadApple } from '../../src/data/apple'
import { hourProfile, sessions } from '../../src/data/insights'
import { loadSample } from '../../src/data/load'
import { generateSampleRecords } from '../../src/data/sample'
import { isSkip, summarize, topItems, weekHourGrid } from '../../src/data/stats'
import type { Play } from '../../src/types'
import { appleExportFrom } from '../apple'

/*
 * The demo history run through both pipelines: once as the Spotify export it is,
 * once rewritten as Apple Music's export would have it. Apple's version has no
 * artists in its play activity and no podcasts, so it's compared with the
 * demo's music only. Whatever differs here is a real difference between the two.
 */

// The demo has the odd pair of plays ending in the same millisecond, so ties sort by title
const byEnd = (a: Play, b: Play) => a.endTime - b.endTime || a.title.localeCompare(b.title)
const spotify = loadSample()
  .plays.filter((p) => p.kind === 'track')
  .sort(byEnd)
const warnings: string[] = []
const apple = loadApple(appleExportFrom(generateSampleRecords()), warnings)
const plays = [...apple.plays].sort(byEnd)

describe('the demo as an Apple Music export', () => {
  it('loads every music play, one for one, without warnings', () => {
    expect(warnings).toEqual([])
    expect(apple.skippedRows).toBe(0)
    expect(apple.duplicateRows).toBe(0)
    expect(plays).toHaveLength(spotify.length)
  })

  it('agrees with Spotify on when, what and how long', () => {
    const fields = (p: Play) => [p.endTime, p.msPlayed, p.title, p.album, isSkip(p), p.platform]
    expect(plays.map(fields)).toEqual(spotify.map(fields))
  })

  it('finds the right artist for nearly every play', () => {
    const wrong = plays.filter((p, i) => p.artist !== spotify[i].artist).length
    expect(apple.unmatchedArtists).toBe(0)
    // Titles in the demo repeat across artists far more than real music does
    // ("Gold", "River"...), so this is a hard case for matching by title
    expect(wrong / plays.length).toBeLessThan(0.01)
  })

  it('gives the same time-based charts', () => {
    expect(hourProfile(plays)).toEqual(hourProfile(spotify))
    expect(weekHourGrid(plays)).toEqual(weekHourGrid(spotify))
    expect(sessions(plays).length).toBe(sessions(spotify).length)
  })

  it('gives the same summary, apart from shuffle', () => {
    const a = summarize(plays)
    const s = summarize(spotify)
    expect({ ...a, artists: 0, tracks: 0, shuffleRate: 0 }).toEqual({ ...s, artists: 0, tracks: 0, shuffleRate: 0 })
    expect(a.shuffleRate).toBeNull()
    expect(s.shuffleRate).toBeGreaterThan(0)
  })

  it('ranks the same top artists', () => {
    const top = (list: Play[]) => topItems(list, 'artist', 'time', 10).map((r) => r.label)
    expect(top(plays)).toEqual(top(spotify))
  })
})
