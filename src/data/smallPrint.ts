import { formatDate, formatDuration, formatNumber, formatTime } from '../lib/format'
import type { Records } from './insights'
import { WEAR_MAX, type FunStats, type WearOut } from './stats'

/*
 * The liner notes as a phone card: a few facts from the record that you
 * couldn't have guessed, each one sentence with the evidence under it. The
 * totals, top artists, busiest hours and biggest day already have cards of
 * their own, so they aren't candidates here.
 */

/** A sentence, with song and artist names kept apart so they can be set in italics */
export type FactPart = string | { name: string }

export interface Fact {
  key: 'repeat' | 'evergreen' | 'wear' | 'dropped' | 'streak' | 'session' | 'first'
  line: FactPart[]
  /** What the sentence rests on, short enough for one small line */
  proof: string
  /** 0–1, how hard it would be to guess; the card shows the highest first */
  score: number
}

/** Long titles ("… (feat. …) - 2011 Remaster") would take over a card, so names stop near here */
export const NAME_MAX = 32

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/** Cuts a long name at a word break, with an ellipsis */
export function clipName(name: string, max = NAME_MAX): string {
  const clean = name.trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  // Only back up to a space when that keeps most of the name
  const kept = space >= max * 0.6 ? cut.slice(0, space) : cut
  return `${kept.replace(/[\s,.:;([{-]+$/, '')}…`
}

/**
 * Every fact this period has, most surprising first. Facts that need a lot
 * of listening to mean anything (an obsession, a streak) only qualify past a
 * floor, and "dropped" only makes sense over all time: inside one year,
 * "nothing since" would just mean the year ended.
 */
export function smallPrint(fun: FunStats, rec: Records, wear: WearOut | null, isAllTime: boolean): Fact[] {
  const out: Fact[] = []
  const name = (n: string) => ({ name: clipName(n) })

  // The most plays of one song in one day
  if (fun.onRepeat && fun.onRepeat.count >= 4) {
    const r = fun.onRepeat
    out.push({
      key: 'repeat',
      // Non-breaking spaces keep "21 times in one day" together, so a line break falls after the title
      line: [name(r.title), `, ${formatNumber(r.count)}\u00a0times\u00a0in\u00a0one\u00a0day.`],
      proof: `${clipName(r.artist)}, ${formatDate(r.date)}`,
      score: clamp((r.count - 3) / 15),
    })
  }

  // The song that kept coming back, month after month
  if (rec.evergreen && rec.evergreen.activeMonths >= 6 && rec.evergreen.months / rec.evergreen.activeMonths >= 0.5) {
    const e = rec.evergreen
    const all = e.months === e.activeMonths
    out.push({
      key: 'evergreen',
      line: [name(e.title), all ? ` played in all ${e.activeMonths} months you listened.` : ` played in ${e.months} of the ${e.activeMonths} months you listened.`],
      // Several songs can tie for the most months, so this never claims it beat them all
      proof: `By ${clipName(e.artist)}. No other song came back more often`,
      score: clamp((e.months / e.activeMonths - 0.4) / 0.6),
    })
  }

  // How many plays it takes before a song gets skipped as often as anything else
  if (wear && wear.wornOut !== null) {
    const n = wear.wornOut
    const low = wear.best === 1 ? 'Skipped least the first time you hear it' : `Skipped least on its ${ordinal(wear.best)} play`
    out.push({
      key: 'wear',
      line: [n >= WEAR_MAX ? `You tire of a song after about ${WEAR_MAX} plays.` : `You tire of a song by about play ${n}.`],
      // "Tire of" means it's skipped as often as your songs are on average
      proof: n >= WEAR_MAX ? `${low}, then more and more` : `${low}, then more and more until play ${n}`,
      score: 0.7,
    })
  }

  // A big artist that went quiet
  if (isAllTime && rec.forgotten && rec.forgotten.ms >= 10 * 3_600_000) {
    const f = rec.forgotten
    out.push({
      key: 'dropped',
      line: [`${formatDuration(f.ms)} of `, name(f.artist), ', then nothing.'],
      proof: `Last played ${formatDate(f.lastPlayed)}`,
      score: 0.6,
    })
  }

  // Days in a row with at least one play
  if (fun.longestStreak && fun.longestStreak.days >= 7) {
    const s = fun.longestStreak
    out.push({
      key: 'streak',
      line: [`You pressed play ${formatNumber(s.days)} days in a row.`],
      proof: `${formatDate(s.start)} to ${formatDate(s.end)}`,
      score: clamp((s.days - 7) / 120),
    })
  }

  // The longest stretch with no break over 20 minutes; only worth saying once it's long
  if (rec.marathon && rec.marathon.ms >= 3 * 3_600_000) {
    const m = rec.marathon
    out.push({
      key: 'session',
      line: [`${formatDuration(m.ms)} in one sitting, your longest.`],
      proof: `From ${formatTime(m.start)}, ${formatDate(m.start)}`,
      score: clamp((m.ms / 3_600_000 - 3) / 9) * 0.8,
    })
  }

  // Always there, so a quiet period still has something to say
  if (rec.firstPlay) {
    const f = rec.firstPlay
    out.push({
      key: 'first',
      line: [isAllTime ? 'It all started with ' : 'The year started with ', name(f.title), '.'],
      proof: `${clipName(f.artist)}, ${formatDate(f.date)}`,
      score: 0.1,
    })
  }

  // A stable sort keeps the order above between equal scores
  return out.sort((a, b) => b.score - a.score)
}

/** The sentence as plain text, for labels and keys */
export function factText(fact: Fact): string {
  return fact.line.map((p) => (typeof p === 'string' ? p : p.name)).join('')
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}
