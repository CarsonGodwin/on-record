import { describe, expect, it } from 'vitest'
import { formatMonthShort } from '../../src/lib/format'
import { clock, driftScale, monthly, renderBlob, type BlobCanvas, type RenderedImage } from '../../src/viz/posterShared'
import { SLOT_OTHER, SLOT_PODCAST, buildRecord, MINUTES } from '../../src/viz/record'
import { at, play, sorted } from '../helpers'

const HOUR = 3_600_000

const distance = (a: number, b: number) => {
  const d = Math.abs(a - b) % MINUTES
  return Math.min(d, MINUTES - d)
}

describe('monthly', () => {
  const plays = sorted([
    play(at(2024, 1, 15, 20), { artist: 'A', msPlayed: HOUR }),
    play(at(2024, 2, 10, 8), { artist: 'B', msPlayed: HOUR / 2 }),
    play(at(2024, 3, 5, 20), { artist: 'A', msPlayed: HOUR }),
  ])
  const model = buildRecord(plays, ['A'], null)

  it('splits the rings at calendar month starts', () => {
    const months = monthly(model, 'month', false)
    expect(months.map((m) => m.month)).toEqual([0, 1, 2])
    expect(months[0].ring0).toBe(0)
    expect(months[0].ring1).toBe(months[1].ring0)
    expect(months[1].ring1).toBe(months[2].ring0)
    expect(months[2].ring1).toBe(model.days)
    // Jan 15 to Jan 31 is 17 grooves
    expect(months[0].ring1 - months[0].ring0).toBe(17)
  })

  it('labels by month, with the year when asked', () => {
    expect(monthly(model, 'month', false)[0].label).toBe(formatMonthShort(0))
    expect(monthly(model, 'month', true)[0].label).toBe(`${formatMonthShort(0)} ’24`)
  })

  it('groups by quarter and by year', () => {
    const wide = buildRecord(sorted([play(at(2023, 11, 20)), play(at(2024, 5, 2))]), [], null)
    expect(monthly(wide, 'quarter', false).map((m) => [m.year, m.month])).toEqual([
      [2023, 10],
      [2024, 0],
      [2024, 3],
    ])
    const years = monthly(wide, 'year', true)
    expect(years.map((m) => m.label)).toEqual(['2023', '2024'])
  })

  it('totals listening and splits music by top-artist slot', () => {
    const mixed = buildRecord(
      sorted([
        play(at(2024, 1, 10, 10), { artist: 'A', msPlayed: HOUR }),
        play(at(2024, 1, 11, 10), { artist: 'Nobody', msPlayed: HOUR / 2 }),
        play(at(2024, 1, 12, 10), { kind: 'episode', msPlayed: HOUR / 4 }),
      ]),
      ['A'],
      null,
    )
    const [jan] = monthly(mixed, 'month', false)
    expect(jan.slots[0]).toBeCloseTo(60)
    expect(jan.slots.slice(1).every((v) => v === 0)).toBe(true)
    // Other artists and podcasts count toward the total but have no slot of their own
    expect(jan.total).toBeCloseTo(60 + 30 + 15)
    expect(SLOT_PODCAST).toBeGreaterThan(SLOT_OTHER)
    expect(jan.slots).toHaveLength(SLOT_OTHER)
  })

  it('finds the usual time of day', () => {
    // 8 pm to 9 pm: the middle is 8:30 pm
    const [jan] = monthly(buildRecord([play(at(2024, 1, 15, 20), { msPlayed: HOUR })], [], null), 'month', false)
    expect(jan.minute).toBeCloseTo(20.5 * 60, 3)
  })

  it('leaves the time null when there is hardly any listening', () => {
    const [jan] = monthly(buildRecord([play(at(2024, 1, 15, 20), { msPlayed: 30 * 60_000 })], [], null), 'month', false)
    expect(jan.total).toBeCloseTo(30)
    expect(jan.minute).toBeNull()
  })

  it('smooths a month toward its neighbours', () => {
    const smoothed = monthly(
      buildRecord(
        sorted([
          play(at(2024, 1, 15, 2), { msPlayed: HOUR }),
          play(at(2024, 2, 15, 2), { msPlayed: HOUR }),
          play(at(2024, 3, 15, 8), { msPlayed: HOUR }),
        ]),
        [],
        null,
      ),
      'month',
      false,
    )
    // February sits at 2:30 am by itself; March at 8:30 am pulls it later
    expect(smoothed[1].minute!).toBeGreaterThan(2.5 * 60)
    expect(smoothed[1].minute!).toBeLessThan(8.5 * 60)
    // February's own weight is double, so it stays closer to itself than to March
    expect(distance(smoothed[1].minute!, 2.5 * 60)).toBeLessThan(distance(smoothed[1].minute!, 8.5 * 60))
  })
})

describe('driftScale', () => {
  const days = (n: number) => ({ days: n }) as Parameters<typeof driftScale>[0]

  it('traces a single year by month whatever its length', () => {
    expect(driftScale(days(5000), false)).toBe('month')
  })

  it('goes quarterly, then yearly, as history grows', () => {
    expect(driftScale(days(3 * 365), true)).toBe('quarter')
    expect(driftScale(days(6 * 365), true)).toBe('quarter')
    expect(driftScale(days(6 * 365 + 1), true)).toBe('year')
  })
})

describe('clock', () => {
  it('rounds to the nearest half hour', () => {
    expect(clock(0)).toBe('12 am')
    expect(clock(20 * 60)).toBe('8 pm')
    expect(clock(22.5 * 60)).toBe('10:30 pm')
    expect(clock(12 * 60)).toBe('12 pm')
    expect(clock(8 * 60 + 14)).toBe('8 am')
    expect(clock(8 * 60 + 16)).toBe('8:30 am')
  })

  it('wraps the end of the day to midnight', () => {
    expect(clock(1440)).toBe('12 am')
  })
})

describe('renderBlob', () => {
  type Outcome = 'ok' | 'no context' | 'throws' | 'lost while drawing' | 'lost unseen' | 'lost while encoding' | 'no blob'

  /** Canvases that each behave as told, in order, remembering the size they were drawn at and whether they were freed */
  function canvases(outcomes: Outcome[]) {
    const made: { drawnAt: [number, number] | null; freed: boolean }[] = []
    let next = 0
    const create = (): BlobCanvas => {
      const outcome = outcomes[next++]
      const record: (typeof made)[number] = { drawnAt: null, freed: false }
      made.push(record)
      let lost = false
      const ctx = {
        // 'lost unseen' is a browser that can't say its canvas was lost, so only the blank pixels give it away
        isContextLost: outcome === 'lost unseen' ? undefined : () => lost,
        getImageData: () => ({ data: [0, 0, 0, lost ? 0 : 255] }),
      } as unknown as CanvasRenderingContext2D
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => (outcome === 'no context' ? null : ctx),
        toBlob(callback: BlobCallback) {
          if (outcome === 'lost while encoding') lost = true
          callback(outcome === 'no blob' ? null : new Blob([`${this.width}x${this.height}`]))
        },
      }
      const draw = (w: number, h: number) => {
        record.drawnAt = [w, h]
        if (outcome === 'throws') throw new Error('out of memory')
        if (outcome === 'lost while drawing' || outcome === 'lost unseen') lost = true
      }
      // Watch for the canvas being emptied once it's done with
      return new Proxy(canvas, {
        set(target, key, value) {
          if (key === 'width' && value === 0 && record.drawnAt) record.freed = true
          return Reflect.set(target, key, value)
        },
        get(target, key) {
          return key === 'draw' ? draw : Reflect.get(target, key)
        },
      }) as BlobCanvas
    }
    let current: BlobCanvas | null = null
    const tracked = () => (current = create())
    const draw = (_: CanvasRenderingContext2D, w: number, h: number) => (current as unknown as { draw: (w: number, h: number) => void }).draw(w, h)
    return { made, create: tracked, draw }
  }

  /** The image's contents and size, which the stand-in canvases write as "WxH" */
  const contents = async (image: RenderedImage | null) => (image ? { text: await image.blob.text(), width: image.width, height: image.height } : null)

  it('draws at the first scale when it works, rounding the size', async () => {
    const c = canvases(['ok'])
    expect(await contents(await renderBlob(2160, 2700, [0.333, 0.5], c.draw, c.create))).toEqual({ text: '719x899', width: 719, height: 899 })
    expect(c.made).toEqual([{ drawnAt: [719, 899], freed: true }])
  })

  it('steps down past every way a canvas can fail, and says what size it settled on', async () => {
    const fails: Outcome[] = ['no context', 'throws', 'lost while drawing', 'lost unseen', 'lost while encoding', 'no blob']
    const c = canvases([...fails, 'ok'])
    const image = await renderBlob(1000, 1000, [1, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5], c.draw, c.create)
    expect(await contents(image)).toEqual({ text: '500x500', width: 500, height: 500 })
    expect(c.made).toHaveLength(7)
    // Each one that got drawn on was emptied afterwards
    expect(c.made.filter((m) => m.drawnAt).every((m) => m.freed)).toBe(true)
  })

  it('gives up with null when no scale works', async () => {
    const c = canvases(['lost while drawing', 'no blob'])
    expect(await renderBlob(1000, 1000, [1, 0.5], c.draw, c.create)).toBeNull()
  })

  it('throws the error rather than null when a scale threw and none worked, so a bug in draw shows', async () => {
    const c = canvases(['throws', 'no context'])
    await expect(renderBlob(1000, 1000, [1, 0.5], c.draw, c.create)).rejects.toThrow('out of memory')
  })
})
