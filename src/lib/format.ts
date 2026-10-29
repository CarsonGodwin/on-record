import type { DataSource } from '../types'

const number = new Intl.NumberFormat()
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
const date = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })

export function formatNumber(n: number): string {
  return number.format(Math.round(n))
}

/** "1 play", "312 plays" */
export function formatPlays(n: number): string {
  return `${formatNumber(n)} play${n === 1 ? '' : 's'}`
}

/** A span of listening in days, for when "0 days" or "1 days" would read wrong: "less than a day", "1 day", "12 days" */
export function formatDays(ms: number): string {
  const days = ms / 86_400_000
  // Rounded the same way formatNumber does, so "less than a day" covers exactly what would have printed as 0
  const rounded = Math.round(days)
  if (rounded < 1) return 'less than a day'
  if (rounded === 1) return '1 day'
  return `${formatNumber(days)} days`
}

export function formatHours(ms: number): string {
  return `${formatNumber(ms / 3_600_000)} hrs`
}

/** Picks a readable unit: "45 min", "4.5 hrs", "1,234 hrs" */
export function formatDuration(ms: number): string {
  const hours = ms / 3_600_000
  if (hours < 1) return `${formatNumber(ms / 60_000)} min`
  if (hours < 10) return `${oneDecimal.format(hours)} hrs`
  return formatHours(ms)
}

export function formatPercent(fraction: number): string {
  return percent.format(fraction)
}

export function formatDate(d: number | Date): string {
  return date.format(d)
}

export function formatMonthShort(month: number): string {
  return monthShort.format(new Date(2000, month, 1))
}

/** What the history is called where a poster credits its data */
export function historyName(sources: DataSource[]): string {
  if (sources.includes('apple')) return sources.includes('spotify') ? 'Spotify and Apple Music listening history' : 'Apple Music listening history'
  return 'Spotify Extended Streaming History'
}

/** Hour of day as "12 AM", "9 PM" */
export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const monthYearShort = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

/** "9:41 PM" */
export function formatTime(d: number | Date): string {
  return time.format(d)
}

/** "Tuesday, March 4, 2024" */
export function formatLongDate(d: number | Date): string {
  return longDate.format(d)
}

/** "Tue, Mar 4, 2024": the long date for a phone's narrow card */
export function formatShortDate(d: number | Date): string {
  return shortDate.format(d)
}

/** "Mar 2024" */
export function formatMonthYearShort(d: number | Date): string {
  return monthYearShort.format(d)
}

const monthYear = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' })

/** "March 2024" */
export function formatMonthYear(d: number | Date): string {
  return monthYear.format(d)
}

/** "Jan – Jul 2024", or "Nov 2023 – Feb 2024" across a new year */
export function formatMonthRange(from: number | Date, to: number | Date): string {
  return monthYearShort.formatRange(from, to)
}
