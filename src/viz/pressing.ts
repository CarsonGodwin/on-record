import { DISPLAY, DRAW_ORDER, MINUTES, TAU, fitText, mix, recordGeometry, type RecordModel } from './record'

/*
 * The record for The Long Play, pressed a groove at a time. The disc and the
 * data are separate canvases, so pressing further only draws the new arcs
 * instead of the whole record every frame, and one artist can be lifted out
 * onto a third canvas while everything else dims.
 */

/**
 * How many arcs belong to grooves up to and including `ring`. Arcs are stored in
 * play order, which is day order but for the odd play that runs past midnight,
 * so a binary search lands within an arc or two of exact.
 */
export function arcsThrough(model: RecordModel, ring: number): number {
  let lo = 0
  let hi = model.count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (model.ring[mid] <= ring) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The empty disc and its label */
export function drawDisc(ctx: CanvasRenderingContext2D, size: number, days: number, title: string, labelColor: string) {
  const g = recordGeometry(size, days)
  const c = g.center
  ctx.clearRect(0, 0, size, size)

  const body = ctx.createRadialGradient(c, c, 0, c, c, g.disc)
  body.addColorStop(0, '#1d1b24')
  body.addColorStop(0.7, '#100f15')
  body.addColorStop(1, '#060508')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(c, c, g.disc, 0, TAU)
  ctx.fill()

  // Fine grooves for texture, so the unpressed part still reads as vinyl
  ctx.lineWidth = Math.max(1, size / 1400)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
  for (let r = g.inner; r < g.disc; r += size * 0.0055) {
    ctx.beginPath()
    ctx.arc(c, c, r, 0, TAU)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = Math.max(1, size / 700)
  ctx.beginPath()
  ctx.arc(c, c, g.disc, 0, TAU)
  ctx.stroke()

  const lr = g.label
  const label = ctx.createRadialGradient(c - lr * 0.4, c - lr * 0.5, lr * 0.1, c, c, lr)
  label.addColorStop(0, mix(labelColor, '#ffffff', 0.3))
  label.addColorStop(1, labelColor)
  ctx.fillStyle = label
  ctx.beginPath()
  ctx.arc(c, c, lr, 0, TAU)
  ctx.fill()

  ctx.fillStyle = '#0b0a0f'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitText(ctx, title, c, c - lr * 0.42, lr * 1.4, lr * 0.36, `800 {px}px ${DISPLAY}`)
  ctx.beginPath()
  ctx.arc(c, c, lr * 0.07, 0, TAU)
  ctx.fill()
}

/** Strokes arcs [from, to), optionally only one slot's (drawn bolder, since it's on its own), one path per color */
export function drawArcs(
  ctx: CanvasRenderingContext2D,
  model: RecordModel,
  size: number,
  colors: string[],
  from: number,
  to: number,
  only: number | null = null,
) {
  if (to <= from) return
  const g = recordGeometry(size, model.days)
  const c = g.center
  const paths = new Map<number, Path2D>()
  for (let k = from; k < to; k++) {
    const slot = model.slot[k]
    if (only !== null && slot !== only) continue
    let path = paths.get(slot)
    if (!path) {
      path = new Path2D()
      paths.set(slot, path)
    }
    const r = g.inner + (model.ring[k] + 0.5) * g.ring
    const a0 = (model.from[k] / MINUTES) * TAU - Math.PI / 2
    const a1 = Math.max((model.to[k] / MINUTES) * TAU - Math.PI / 2, a0 + 0.002)
    path.moveTo(c + r * Math.cos(a0), c + r * Math.sin(a0))
    path.arc(c, c, r, a0, a1)
  }
  ctx.lineCap = 'butt'
  // Bolder than the record chapter's: the story shows the record smaller, and without its glow
  ctx.lineWidth = Math.max(g.ring * 0.95, size / 420) * (only === null ? 1 : 2.4)
  for (const slot of DRAW_ORDER) {
    const path = paths.get(slot)
    if (!path) continue
    ctx.strokeStyle = colors[slot]
    ctx.stroke(path)
  }
}

export interface Press {
  /** The last groove pressed, -1 for none */
  ring: number
  /** Presses up to and including `ring`; going backwards starts over */
  pressTo: (ring: number) => void
  /** Lifts one slot's arcs onto the focus layer, or clears it with null */
  setFocus: (slot: number | null) => void
}

/** Drives the data canvas, and the focus canvas if there is one. They must already be sized and scaled to `size`. */
export function createPress(
  data: CanvasRenderingContext2D,
  focus: CanvasRenderingContext2D | null,
  model: RecordModel,
  size: number,
  colors: string[],
): Press {
  let count = 0
  let focusSlot: number | null = null
  const clear = (ctx: CanvasRenderingContext2D) => ctx.clearRect(0, 0, size, size)

  const press: Press = {
    ring: -1,
    pressTo(ring) {
      if (ring < press.ring) {
        clear(data)
        if (focus) clear(focus)
        count = 0
      }
      const to = arcsThrough(model, ring)
      drawArcs(data, model, size, colors, count, to)
      if (focus && focusSlot !== null) drawArcs(focus, model, size, colors, count, to, focusSlot)
      count = Math.max(count, to)
      press.ring = ring
    },
    setFocus(slot) {
      if (slot === focusSlot || !focus) return
      focusSlot = slot
      clear(focus)
      if (slot !== null) drawArcs(focus, model, size, colors, 0, count, slot)
    },
  }
  return press
}
