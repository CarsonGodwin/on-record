/*
 * Chart colors. Validated with the dataviz skill's validate_palette.js against
 * the page surface (#0b0a0f, dark mode):
 *  - SERIES: worst adjacent CVD ΔE 11.9, normal-vision ΔE 28, all >= 3:1 contrast
 *  - HEAT: single-hue ordinal ramp, monotone lightness, dim end 2.16:1
 * Keep the order: it's what keeps neighbours distinguishable for colorblind readers.
 */
export const SERIES = ['#ff277c', '#0ca2bc', '#e86104', '#0ba985', '#a053fd', '#b68901', '#3778f5', '#58a805']

/** Anything outside the top 8 */
export const OTHER = '#4a4652'

/** Sequential ramp for magnitude, dim to bright */
export const HEAT = ['#81254a', '#aa285d', '#d5286e', '#f74180', '#fe7999', '#feadba', '#fedade']

/**
 * Gives the view's top artists a color each. Artists in the all-time top 8 keep
 * their all-time slot, so filtering to a year never repaints a survivor.
 */
export function assignColors(viewTop: string[], allTop: string[]): Map<string, string> {
  const colors = new Map<string, string>()
  const used = new Set<number>()
  const view = viewTop.slice(0, SERIES.length)

  for (const name of view) {
    const slot = allTop.indexOf(name)
    if (slot >= 0 && slot < SERIES.length) {
      colors.set(name, SERIES[slot])
      used.add(slot)
    }
  }
  let next = 0
  for (const name of view) {
    if (colors.has(name)) continue
    while (used.has(next)) next++
    colors.set(name, SERIES[next])
    used.add(next)
  }
  return colors
}

export function colorFor(colors: Map<string, string>, name: string): string {
  return colors.get(name) ?? OTHER
}

/** Picks a HEAT step for a value, given ascending thresholds (one fewer than HEAT steps) */
export function heatStep(value: number, thresholds: number[]): string {
  let i = 0
  while (i < thresholds.length && value > thresholds[i]) i++
  return HEAT[i]
}

/** Quantile thresholds over the non-zero values, so a few huge days don't wash everything else out */
export function quantileThresholds(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return []
  return Array.from({ length: HEAT.length - 1 }, (_, i) => sorted[Math.floor(((i + 1) / HEAT.length) * (sorted.length - 1))])
}
