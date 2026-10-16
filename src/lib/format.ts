const number = new Intl.NumberFormat()
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
const date = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })

export function formatNumber(n: number): string {
  return number.format(Math.round(n))
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

/** Hour of day as "12 AM", "9 PM" */
export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const monthYearShort = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' })

/** "9:41 PM" */
export function formatTime(d: number | Date): string {
  return time.format(d)
}

/** "Tuesday, March 4, 2024" */
export function formatLongDate(d: number | Date): string {
  return longDate.format(d)
}

/** "Mar 2024" */
export function formatMonthYearShort(d: number | Date): string {
  return monthYearShort.format(d)
}

/** Fun yardsticks for a big pile of listening time */
export function equivalents(ms: number): { days: number; flights: number; marathons: number } {
  const hours = ms / 3_600_000
  return {
    days: hours / 24,
    // New York to Tokyo, about 14 hours
    flights: hours / 14,
    // All eight Harry Potter films back to back, 19 hours 41 minutes (1,181 minutes)
    marathons: (hours * 60) / 1181,
  }
}
