import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ARCS_PER_STROKE,
  DIMMED,
  GLOW_MAX,
  MINUTES,
  SLOT_OTHER,
  SLOT_PODCAST,
  buildRecord,
  drawRecord,
  quietestMinute,
  recordGeometry,
  recordGuides,
  visibleWindow,
  type DrawOptions,
  type RecordModel,
} from '../../src/viz/record'
import { formatMonthShort } from '../../src/lib/format'
import { at, play, sorted } from '../helpers'

describe('visibleWindow', () => {
  it('shows everything when no rectangle is given', () => {
    expect(visibleWindow(500, undefined, 10)).toEqual({ rMin: 0, rMax: Infinity, from: 0, to: MINUTES })
  })

  it('shows every time of day while the center is on screen', () => {
    const w = visibleWindow(500, { x0: 0, y0: 0, x1: 1000, y1: 1000 }, 0)
    expect(w.rMin).toBe(0)
    expect(w.rMax).toBeCloseTo(Math.hypot(500, 500))
    expect([w.from, w.to]).toEqual([0, MINUTES])
  })

  it('narrows to the radii and times that reach a rectangle off to one side', () => {
    // To the right of the center: around 6 am, since midnight is at the top and time runs clockwise
    const w = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 0)
    expect(w.rMin).toBe(100)
    expect(w.rMax).toBeCloseTo(Math.hypot(200, 50))
    expect(w.from).toBeLessThan(360)
    expect(w.to).toBeGreaterThan(360)
    expect((w.from + w.to) / 2).toBeCloseTo(360)
    // The corners at 100 across and 50 up/down are atan(0.5) either side of 6 am
    expect(w.to - w.from).toBeCloseTo(((2 * Math.atan(0.5)) / (2 * Math.PI)) * MINUTES)
  })

  it('runs past midnight for a rectangle above the center', () => {
    const w = visibleWindow(0, { x0: -50, y0: -200, x1: 50, y1: -100 }, 0)
    expect(w.rMin).toBe(100)
    expect(w.from).toBeGreaterThan(MINUTES / 2)
    expect(w.to).toBeGreaterThan(MINUTES)
    expect((w.from + w.to) / 2).toBeCloseTo(MINUTES)
  })

  it('looks the other way for a rectangle below the center', () => {
    const w = visibleWindow(0, { x0: -50, y0: 100, x1: 50, y1: 200 }, 0)
    expect((w.from + w.to) / 2).toBeCloseTo(MINUTES / 2)
  })

  it('grows with the padding', () => {
    const tight = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 0)
    const loose = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 20)
    expect(loose.rMin).toBeLessThan(tight.rMin)
    expect(loose.rMax).toBeGreaterThan(tight.rMax)
    expect(loose.to - loose.from).toBeGreaterThan(tight.to - tight.from)
  })

  it('covers every time of day once padding brings the center on screen', () => {
    const w = visibleWindow(0, { x0: 10, y0: 10, x1: 100, y1: 100 }, 20)
    expect(w.rMin).toBe(0)
    expect([w.from, w.to]).toEqual([0, MINUTES])
  })
})

describe('buildRecord', () => {
  it('puts each play on its day, at its time of day', () => {
    const m = buildRecord(sorted([play(at(2024, 1, 10, 9), { msPlayed: 3_600_000 }), play(at(2024, 1, 12, 21, 30), { msPlayed: 600_000 })]), [], null)
    expect(m.days).toBe(3)
    expect(m.count).toBe(2)
    expect([m.ring[0], m.from[0], m.to[0]]).toEqual([0, 540, 600])
    expect([m.ring[1], m.from[1], m.to[1]]).toEqual([2, 1290, 1300])
    expect(m.dayMinutes[0]).toBeCloseTo(60)
    expect(m.dayMinutes[1]).toBe(0)
  })

  it('splits a play that crosses midnight into two arcs', () => {
    const m = buildRecord([play(at(2024, 1, 10, 23, 30), { msPlayed: 3_600_000 })], [], null)
    expect(m.count).toBe(2)
    expect([m.ring[0], m.from[0], m.to[0]]).toEqual([0, 1410, MINUTES])
    expect([m.ring[1], m.from[1], m.to[1]]).toEqual([1, 0, 30])
    expect(m.play[0]).toBe(0)
    expect(m.play[1]).toBe(0)
  })

  it('assigns slots by legend, other artists, and podcasts', () => {
    const m = buildRecord(
      [
        play(at(2024, 1, 10, 9), { artist: 'B' }),
        play(at(2024, 1, 10, 10), { artist: 'Stranger' }),
        play(at(2024, 1, 10, 11), { kind: 'episode' }),
      ],
      ['A', 'B'],
      null,
    )
    expect([...m.slot.slice(0, 3)]).toEqual([1, SLOT_OTHER, SLOT_PODCAST])
  })

  it('spans a whole calendar year when given one, dropping plays outside it', () => {
    const m = buildRecord([play(at(2023, 12, 31, 12)), play(at(2024, 2, 1, 12))], [], 2024)
    expect(m.days).toBe(366)
    expect(m.count).toBe(1)
    expect(m.ring[0]).toBe(31)
  })
})

describe('recordGeometry', () => {
  it('keeps the grooves between the label and the rim', () => {
    const g = recordGeometry(1000, 100)
    expect(g.center).toBe(500)
    expect(g.inner).toBeLessThan(g.outer)
    expect(g.outer).toBeLessThan(g.disc)
    expect(g.label).toBeLessThan(g.inner)
    expect(g.inner + 100 * g.ring).toBeCloseTo(g.outer)
  })
})

describe('recordGuides', () => {
  const guideModel = (from: Date, to: Date) => buildRecord([play(from), play(to)], [], null)

  it('marks month starts for a year or so of history', () => {
    const guides = recordGuides(guideModel(at(2024, 1, 10), at(2024, 4, 20)))
    expect(guides.map((g) => g.label)).toEqual([1, 2, 3].map(formatMonthShort))
    expect(guides[0].ring).toBe(22)
  })

  it('marks year starts for longer history', () => {
    const guides = recordGuides(guideModel(at(2021, 6, 1), at(2024, 6, 1)))
    expect(guides.map((g) => g.label)).toEqual(['2022', '2023', '2024'])
  })

  it('has none for a single month', () => {
    expect(recordGuides(guideModel(at(2024, 1, 2), at(2024, 1, 28)))).toEqual([])
  })
})

describe('quietestMinute', () => {
  it('picks the middle of the two quietest hours', () => {
    // Listening from 6 am to 6 pm every day leaves the evening and night quiet
    const plays = Array.from({ length: 10 }, (_, d) => play(at(2024, 1, 10 + d, 6), { msPlayed: 12 * 3_600_000 }))
    const quiet = quietestMinute(buildRecord(plays, [], null))
    // Anywhere in 6 pm to 6 am, away from the busy daytime
    expect(quiet >= 18 * 60 + 60 || quiet <= 6 * 60 - 60).toBe(true)
    expect(quiet % 30).toBe(0)
  })
})

describe('drawRecord', () => {
  /** Every play stroke drawRecord makes: its color, how many arcs went into the path, and the glow and opacity it had */
  interface Stroke {
    style: string
    arcs: number
    blur: number
    alpha: number
  }

  interface Recording {
    strokes: Stroke[]
    /** The opacity of each layer laid down with drawImage */
    laid: number[]
  }

  /** A stand-in 2D context that records strokes and layers laid down into `out`, and ignores everything else */
  function recorder(out: Recording, canvas: object = { width: 1000, height: 1000 }) {
    let arcs = 0
    const state: Record<string, unknown> = { globalAlpha: 1, shadowBlur: 0, strokeStyle: '', canvas }
    const calls: Record<string, (...args: unknown[]) => unknown> = {
      beginPath: () => (arcs = 0),
      arc: () => arcs++,
      stroke: () => out.strokes.push({ style: String(state.strokeStyle), arcs, blur: Number(state.shadowBlur), alpha: Number(state.globalAlpha) }),
      drawImage: () => out.laid.push(Number(state.globalAlpha)),
      measureText: () => ({ width: 10 }),
    }
    return new Proxy(state, {
      get: (target, key: string) => (key in calls ? calls[key] : key in target ? target[key] : () => ({ addColorStop() {} })),
      set: (target, key: string, value) => ((target[key] = value), true),
    }) as unknown as CanvasRenderingContext2D
  }

  // drawRecord keeps its scratch layer between draws, so the layer records into whichever draw is current
  const onLayer: Recording = { strokes: [], laid: [] }
  class FakeOffscreenCanvas {
    width: number
    height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
    }
    getContext() {
      return recorder(onLayer, this)
    }
  }
  beforeAll(() => vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas))
  afterAll(() => vi.unstubAllGlobals())

  /** A record of `count` short plays spread over 100 days, all in one slot */
  function model(count: number, slot: number): RecordModel {
    const from = Float32Array.from({ length: count }, (_, k) => (k * 7) % (MINUTES - 10))
    return {
      firstDay: 0,
      days: 100,
      count,
      ring: Int32Array.from({ length: count }, (_, k) => k % 100),
      from,
      to: from.map((m) => m + 5),
      slot: new Uint8Array(count).fill(slot),
      play: Int32Array.from({ length: count }, (_, k) => k),
      dayMinutes: new Float64Array(100),
    }
  }

  const options = (o: Partial<DrawOptions> = {}): DrawOptions => ({
    size: 1000,
    colors: Array.from({ length: SLOT_PODCAST + 1 }, (_, i) => `slot${i}`),
    focus: null,
    title: '',
    subtitle: '',
    labelColor: '#ff277c',
    sheen: false,
    ink: 'transparent',
    guides: [],
    guideMinute: 0,
    noGuideLabels: true,
    ...o,
  })

  /** The play strokes (the ones in a slot color) made on the canvas and on the scratch layer, and the layers laid down */
  const render = (m: RecordModel, o?: Partial<DrawOptions>) => {
    const main: Recording = { strokes: [], laid: [] }
    onLayer.strokes = []
    onLayer.laid = []
    drawRecord(recorder(main), m, options(o))
    const plays = (strokes: Stroke[]) => strokes.filter((s) => s.style.startsWith('slot'))
    return { strokes: plays(main.strokes), layer: plays(onLayer.strokes), laid: main.laid }
  }
  const draw = (m: RecordModel, o?: Partial<DrawOptions>) => render(m, o).strokes

  it('glows the top artists on a record of up to GLOW_MAX plays', () => {
    const strokes = draw(model(GLOW_MAX, 0))
    const top = strokes.filter((s) => s.style === 'slot0')
    expect(top).toHaveLength(1)
    expect(top[0].blur).toBeGreaterThan(0)
    // Everyone else and podcasts never glow
    const rest = strokes.filter((s) => s.style === `slot${SLOT_OTHER}` || s.style === `slot${SLOT_PODCAST}`)
    expect(rest.map((s) => s.blur)).toEqual([0, 0])
  })

  it('leaves the glow off on a bigger record, unless asked for', () => {
    const big = model(GLOW_MAX + 1, 0)
    expect(draw(big).every((s) => s.blur === 0)).toBe(true)
    expect(draw(big, { glow: true }).find((s) => s.style === 'slot0')?.blur).toBeGreaterThan(0)
    expect(draw(model(10, 0), { glow: false }).every((s) => s.blur === 0)).toBe(true)
  })

  it('splits a big slot into strokes of at most ARCS_PER_STROKE arcs, and loses none', () => {
    const count = Math.round(ARCS_PER_STROKE * 2.5)
    const strokes = draw(model(count, SLOT_OTHER)).filter((s) => s.style === `slot${SLOT_OTHER}`)
    expect(strokes.map((s) => s.arcs)).toEqual([ARCS_PER_STROKE, ARCS_PER_STROKE, count - 2 * ARCS_PER_STROKE])
  })

  it('keeps a glowing slot in one stroke, in focus or not, so its glow does not show seams', () => {
    const count = ARCS_PER_STROKE * 2
    const glowing = draw(model(count, 0), { glow: true }).filter((s) => s.style === 'slot0')
    expect(glowing.map((s) => s.arcs)).toEqual([count])
    const dimmed = render(model(count, 0), { glow: true, focus: 1 })
    expect(dimmed.strokes.filter((s) => s.style === 'slot0').map((s) => [s.arcs, s.alpha])).toEqual([[count, DIMMED]])
    expect(dimmed.laid).toEqual([])
  })

  it('draws a big see-through slot solid and in pieces on a layer, then lays it down see-through in one go', () => {
    const count = ARCS_PER_STROKE * 2 + 10
    const { strokes, layer, laid } = render(model(count, SLOT_OTHER), { focus: 0 })
    expect(layer.map((s) => [s.style, s.arcs, s.alpha])).toEqual([
      [`slot${SLOT_OTHER}`, ARCS_PER_STROKE, 1],
      [`slot${SLOT_OTHER}`, ARCS_PER_STROKE, 1],
      [`slot${SLOT_OTHER}`, 10, 1],
    ])
    expect(laid).toEqual([DIMMED])
    expect(strokes.filter((s) => s.style === `slot${SLOT_OTHER}`)).toEqual([])
  })

  it('strokes a small see-through slot straight onto the canvas', () => {
    const { strokes, layer, laid } = render(model(100, SLOT_OTHER), { focus: 0 })
    expect(strokes.filter((s) => s.style === `slot${SLOT_OTHER}`)).toEqual([{ style: `slot${SLOT_OTHER}`, arcs: 100, blur: 0, alpha: DIMMED }])
    expect(layer).toEqual([])
    expect(laid).toEqual([])
  })

  it('splits every slot it draws, on a big record shared between them', () => {
    // Half the plays to the top artist, half to everyone else, with the top artist in focus
    const m = model(GLOW_MAX + ARCS_PER_STROKE * 2, SLOT_OTHER)
    m.slot.fill(0, 0, m.count / 2)
    const { strokes, layer, laid } = render(m, { focus: 0 })
    expect(strokes.filter((s) => s.style === 'slot0').every((s) => s.arcs <= ARCS_PER_STROKE && s.alpha === 1)).toBe(true)
    expect(layer.length).toBeGreaterThan(1)
    expect(layer.every((s) => s.style === `slot${SLOT_OTHER}` && s.arcs <= ARCS_PER_STROKE)).toBe(true)
    expect(laid).toEqual([DIMMED])
    expect([...strokes, ...layer].reduce((sum, s) => sum + s.arcs, 0)).toBe(m.count)
  })
})
