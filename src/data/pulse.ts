/*
 * Small readings for "Pulse", the ridgeline of your top artists over time.
 */

/**
 * The bin where `artist` got the most listening, going by the hours themselves rather than the smoothed
 * ridge (so it names a real month or week). The earliest wins a tie; -1 if they weren't played at all.
 */
export function peakBin(totals: Map<string, number>[], artist: string): number {
  let best = -1
  let most = 0
  totals.forEach((bin, i) => {
    const ms = bin.get(artist) ?? 0
    if (ms > most) {
      most = ms
      best = i
    }
  })
  return best
}
