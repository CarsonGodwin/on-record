import { describe, expect, it } from 'vitest'
import type { Records } from '../../src/data/insights'
import type { FunStats } from '../../src/data/stats'
import { formatDate, formatDuration } from '../../src/lib/format'
import { posterMoments } from '../../src/viz/poster'
import { MINUTES, buildRecord } from '../../src/viz/record'
import { at, play, sorted } from '../helpers'

// January 10 to 20, 2024: ring 0 is the 10th
const model = buildRecord(sorted([play(at(2024, 1, 10, 9)), play(at(2024, 1, 20, 21))]), [], null)

const noFun: FunStats = { longestStreak: null, biggestDay: null, onRepeat: null, topWeek: null }
const noRecords: Records = { firstPlay: null, marathon: null, avgSessionMs: 0, evergreen: null, forgotten: null }

describe('posterMoments', () => {
  it('has nothing to point out without stats', () => {
    expect(model.days).toBe(11)
    expect(posterMoments(model, noFun, noRecords)).toEqual([])
  })

  it('places the longest day on its groove', () => {
    const date = at(2024, 1, 12, 0)
    const [day] = posterMoments(model, { ...noFun, biggestDay: { date, ms: 9.2 * 3_600_000 } }, noRecords)
    expect(day).toEqual({ kind: 'day', label: 'LONGEST DAY', value: formatDuration(9.2 * 3_600_000), detail: formatDate(date), ring: 2 })
  })

  it('runs a streak across its grooves, but only when it is more than a day', () => {
    const streak = (days: number) => ({ ...noFun, longestStreak: { days, start: at(2024, 1, 14, 0), end: at(2024, 1, 14 + days - 1, 0) } })
    expect(posterMoments(model, streak(1), noRecords)).toEqual([])
    const [s] = posterMoments(model, streak(4), noRecords)
    expect(s).toMatchObject({ kind: 'streak', label: 'LONGEST STREAK', value: '4 days', ring: 4, ringEnd: 7 })
    expect(s.detail).toBe(`${formatDate(at(2024, 1, 14))} – ${formatDate(at(2024, 1, 17))}`)
  })

  it('places the longest session by its time of day', () => {
    const marathon = (start: Date, minutes: number) => ({ ...noRecords, marathon: { start: start.getTime(), end: start.getTime() + minutes * 60_000, ms: minutes * 60_000, plays: 5 } })
    const [a] = posterMoments(model, noFun, marathon(at(2024, 1, 15, 20), 90))
    expect(a).toMatchObject({ kind: 'session', label: 'LONGEST SESSION', value: formatDuration(90 * 60_000), ring: 5, from: 1200, to: 1290 })
    // A session that runs past midnight stops at the end of its groove
    const [b] = posterMoments(model, noFun, marathon(at(2024, 1, 15, 23), 120))
    expect([b.from, b.to]).toEqual([1380, MINUTES])
  })

  it('marks the first spin by the minute it started', () => {
    const date = at(2024, 1, 10, 9, 30).getTime()
    const [first] = posterMoments(model, noFun, { ...noRecords, firstPlay: { title: 'Opener', artist: 'Band', date } })
    expect(first).toEqual({ kind: 'first', label: 'FIRST SPIN', value: 'Opener', detail: 'Band', ring: 0, from: 570 })
  })

  it('lists them in a fixed order', () => {
    const date = at(2024, 1, 12, 0)
    const moments = posterMoments(
      model,
      { ...noFun, biggestDay: { date, ms: 1 }, longestStreak: { days: 2, start: date, end: at(2024, 1, 13, 0) } },
      { ...noRecords, firstPlay: { title: 'T', artist: 'A', date: date.getTime() }, marathon: { start: date.getTime(), end: date.getTime() + 60_000, ms: 60_000, plays: 1 } },
    )
    expect(moments.map((m) => m.kind)).toEqual(['day', 'streak', 'session', 'first'])
  })

  it('drops moments that fall outside the record', () => {
    const before = at(2023, 12, 25, 0)
    const after = at(2024, 2, 5, 0)
    const moments = posterMoments(
      model,
      { ...noFun, biggestDay: { date: before, ms: 1 } },
      { ...noRecords, firstPlay: { title: 'T', artist: 'A', date: after.getTime() } },
    )
    expect(moments).toEqual([])
  })

  it('marks each play of the week’s top song, but only once it repeats', () => {
    const topWeek = (count: number) => ({ ...noFun, topWeek: { title: 'Loop', artist: 'Band', start: at(2024, 1, 12, 0), end: at(2024, 1, 14, 0), count, plays: [at(2024, 1, 12, 8), at(2024, 1, 14, 22, 30)].slice(0, count) } })
    expect(posterMoments(model, topWeek(1), noRecords)).toEqual([])
    const [w] = posterMoments(model, topWeek(2), noRecords)
    expect(w).toMatchObject({ kind: 'week', value: 'Loop', ring: 2, ringEnd: 4, plays: [{ ring: 2, minute: 480 }, { ring: 4, minute: 1350 }] })
    expect(w.detail).toBe(`Band · 2 plays the week of ${formatDate(at(2024, 1, 12))}`)
  })
})
