import type { Bins, RaceData } from '../data/insights'
import { formatDate, formatHours, formatMonthShort } from '../lib/format'
import { colorFor } from '../lib/palette'
import { clip, fit } from './posterShared'
import { DISPLAY } from './record'

/*
 * The Race as a 9:16 story video. Drawn frame by frame onto a canvas at the same pace as the page,
 * then encoded on-device (H.264 MP4 where the browser can, so Instagram takes it as is). Laid out
 * for a phone: big type, few words, and nothing under Instagram's top bar or reply box.
 */

export const RACE_TOP = 10
export const RACE_VIDEO = { width: 1080, height: 1920, fps: 30 }
/** Seconds held on the first standings, and on the last */
const LEAD = 0.6
const HOLD = 3.5

/** Milliseconds per bin: the whole race takes about 25 seconds, whatever the range */
export function raceFrameMs(frames: number): number {
  return Math.max(60, Math.min(450, 25_000 / Math.max(frames, 1)))
}

/**
 * The years a race covers, and roughly how many. A week belongs to the year it ends in, so a single
 * year's race, whose first week starts on the Monday before New Year's Day, is that year alone.
 */
export function raceYears(bins: Bins): { first: number; last: number; years: number } {
  const start = new Date(bins.starts[0])
  const firstDay = bins.size === 'week' ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) : start
  const first = Math.min(firstDay.getFullYear(), new Date(bins.end).getFullYear())
  const last = new Date(bins.end).getFullYear()
  const years = Math.max(1, Math.round((bins.end - firstDay.getTime()) / (365.25 * 86_400_000)))
  return { first, last, years }
}

export interface RaceScene {
  bins: Bins
  race: RaceData
  colors: Map<string, string>
  covers: Map<string, CanvasImageSource>
}

export interface RaceFilm {
  /** Seconds */
  duration: number
  /** Draws the frame at `time` seconds. Rows ease between ranks, so call it in time order. */
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, time: number) => void
}

export function makeRaceFilm({ bins, race, colors, covers }: RaceScene): RaceFilm {
  const frames = race.frames
  const n = race.names.length
  const step = raceFrameMs(frames) / 1000
  const raceSecs = (frames - 1) * step
  const { first: firstYear, last: lastYear, years } = raceYears(bins)
  // Smoothed row positions and opacities, standing in for the page's CSS transitions
  const pos = new Map<string, number>()
  const alpha = new Map<string, number>()
  let last: number | null = null

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, time: number) => {
    const u = W / 100
    const pad = 6.5 * u
    const ink = '#f4f1ea'
    const soft = 'rgba(244, 241, 234, 0.62)'
    const font = (weight: number, px: number) => `${weight} ${px}px ${DISPLAY}`

    const t = Math.max(0, Math.min(frames - 1, (time - LEAD) / step))
    const f0 = Math.floor(t)
    const f1 = Math.min(frames - 1, f0 + 1)
    const frac = t - f0
    const values = race.names.map((name, i) => {
      const a = race.values[f0 * n + i]
      const b = race.values[f1 * n + i]
      return { name, ms: a + (b - a) * frac }
    })
    const ranked = [...values].sort((a, b) => b.ms - a.ms)
    const rank = new Map(ranked.map((v, i) => [v.name, i]))
    const max = ranked[0]?.ms || 1
    const total = values.reduce((sum, v) => sum + v.ms, 0)

    const dt = last === null ? Infinity : Math.max(0, time - last)
    last = time
    const kPos = 1 - Math.exp(-dt / 0.16)
    const kAlpha = 1 - Math.exp(-dt / 0.12)
    for (const { name, ms } of values) {
      const r = rank.get(name)!
      const target = Math.min(r, RACE_TOP)
      const p = pos.get(name) ?? target
      pos.set(name, p + (target - p) * kPos)
      const a = alpha.get(name) ?? 0
      alpha.set(name, a + ((r < RACE_TOP && ms > 0 ? 1 : 0) - a) * kAlpha)
    }

    ctx.save()
    ctx.fillStyle = '#0b0a0f'
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

    // The key, then the date as the headline: it's the thing that moves
    ctx.textAlign = 'left'
    ctx.fillStyle = soft
    ctx.font = font(500, 3.8 * u)
    ctx.fillText('Hours per artist, as they added up', pad, 24 * u)
    const date = new Date(bins.starts[f0] ?? bins.starts[0])
    const when = bins.size === 'month' ? `${formatMonthShort(date.getMonth())} ${date.getFullYear()}` : formatDate(date)
    ctx.fillStyle = ink
    if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.03em'
    fit(ctx, when, pad, 36.5 * u, W - 2 * pad, 11 * u, (px) => font(800, px))
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
    ctx.fillStyle = soft
    ctx.font = font(500, 3.8 * u)
    ctx.fillText(`${formatHours(total)} so far`, pad, 43 * u)

    // The board
    const top = 51 * u
    const rowH = 9.4 * u
    const coverS = 7.4 * u
    const barH = 6.4 * u
    const x0 = pad + 6 * u + coverS + 2 * u
    const barMax = W - pad - x0 - 15 * u
    // Lower ranks first, so a row overtaking slides over the one it passes
    const order = [...values].sort((a, b) => pos.get(b.name)! - pos.get(a.name)!)
    for (const { name, ms } of order) {
      const a = alpha.get(name)!
      if (a < 0.01) continue
      const cy = top + pos.get(name)! * rowH + rowH / 2
      const color = colorFor(colors, name)
      ctx.globalAlpha = a

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      ctx.fillStyle = soft
      ctx.font = font(700, 3.6 * u)
      ctx.fillText(String(rank.get(name)! + 1), pad + 4.5 * u, cy)

      const cx = pad + 6 * u
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(cx, cy - coverS / 2, coverS, coverS, 1.1 * u)
      ctx.clip()
      const cover = covers.get(name)
      if (cover) ctx.drawImage(cover, cx, cy - coverS / 2, coverS, coverS)
      else {
        ctx.fillStyle = color
        ctx.fill()
      }
      ctx.restore()

      const fill = Math.max(0.8 * u, (ms / max) * barMax)
      // The page's bars: the colour coming up from 70% along the bar
      const grad = ctx.createLinearGradient(x0, 0, x0 + fill, 0)
      grad.addColorStop(0, fade(color, 0.7))
      grad.addColorStop(1, color)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(x0, cy - barH / 2, fill, barH, [0, 1 * u, 1 * u, 0])
      ctx.fill()

      ctx.textAlign = 'left'
      const hours = formatHours(ms)
      ctx.font = font(500, 3.4 * u)
      const hoursW = ctx.measureText(hours).width
      ctx.font = font(700, 3.8 * u)
      let x = x0 + fill + 1.6 * u
      // The name goes in the bar when it fits, else after it; failing both, it's clipped in whichever has more room
      const nameW = ctx.measureText(name).width
      const insideRoom = fill - 3.2 * u
      const outsideRoom = W - pad - x - hoursW - 1.6 * u
      if (nameW <= insideRoom || (nameW > outsideRoom && insideRoom > outsideRoom)) {
        ctx.fillStyle = '#ffffff'
        ctx.fillText(clip(ctx, name, insideRoom), x0 + 1.6 * u, cy + 0.2 * u)
      } else {
        const shown = clip(ctx, name, outsideRoom)
        ctx.fillStyle = ink
        ctx.fillText(shown, x, cy + 0.2 * u)
        x += ctx.measureText(shown).width + 1.6 * u
      }
      ctx.fillStyle = soft
      ctx.font = font(500, 3.4 * u)
      ctx.fillText(hours, x, cy + 0.2 * u)
    }
    ctx.globalAlpha = 1

    // The payoff, once the race is over
    const end = Math.max(0, Math.min(1, (time - LEAD - raceSecs) / 0.6))
    const winner = ranked[0]?.name
    if (end > 0 && winner) {
      ctx.globalAlpha = end
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      ctx.fillStyle = ink
      ctx.font = font(700, 4.6 * u)
      const line = firstYear === lastYear ? `won my ${firstYear}.` : `leads after ${years} year${years === 1 ? '' : 's'}.`
      const lineW = ctx.measureText(` ${line}`).width
      const who = clip(ctx, winner, W - 2 * pad - lineW)
      ctx.fillText(`${who} ${line}`, pad, top + RACE_TOP * rowH + 8 * u)
      ctx.globalAlpha = 1
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = soft
    ctx.font = font(700, 3 * u)
    ctx.fillText('On Record', pad, H - 6 * u)
    ctx.restore()
  }

  return { duration: LEAD + raceSecs + HOLD, draw }
}

/** A `#rrggbb` colour at an opacity */
function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return Number.isNaN(n) ? hex : `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * How this browser can make the video: `encode` renders faster than real time with WebCodecs; `record`
 * plays the race through MediaRecorder in real time, for browsers or pages without WebCodecs (it's only
 * exposed on https and localhost, so a dev server opened by IP from a phone lands here).
 */
export function raceVideoMode(): 'encode' | 'record' | null {
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') return 'encode'
  if (typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && recorderType()) return 'record'
  return null
}

/** Renders the whole race to a video file. Throws an AbortError if `signal` fires. */
export async function makeRaceVideo(scene: RaceScene, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<File> {
  const mode = raceVideoMode()
  if (!mode) throw new Error('This browser can’t make video.')
  await Promise.all([document.fonts.load(`800 40px ${DISPLAY}`), document.fonts.load(`500 40px ${DISPLAY}`)]).catch(() => {})
  const canvas = document.createElement('canvas')
  canvas.width = RACE_VIDEO.width
  canvas.height = RACE_VIDEO.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas.')
  const film = makeRaceFilm(scene)
  try {
    const { blob, type } = mode === 'encode' ? await encode(canvas, ctx, film, onProgress, signal) : await record(canvas, ctx, film, onProgress, signal)
    onProgress(1)
    const { first: yearA, last: yearB } = raceYears(scene.bins)
    const name = `on-record-${yearA === yearB ? yearA : `${yearA}-${yearB}`}-race.${type === 'video/mp4' ? 'mp4' : 'webm'}`
    return new File([blob], name, { type })
  } finally {
    canvas.width = canvas.height = 0
  }
}

async function encode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, film: RaceFilm, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const mb = await import('mediabunny')
  const { width: W, height: H, fps } = RACE_VIDEO
  const codec = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1', 'vp8'], { width: W, height: H })
  if (!codec) throw new Error('This browser can’t encode video.')
  // Instagram wants MP4; a browser without H.264 or HEVC encoding gets WebM instead
  const mp4 = codec === 'avc' || codec === 'hevc'

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target })
  const source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const count = Math.ceil(film.duration * fps)
  try {
    for (let i = 0; i < count; i++) {
      signal?.throwIfAborted()
      film.draw(ctx, W, H, i / fps)
      await source.add(i / fps, 1 / fps)
      if (i % 15 === 0) onProgress(i / count)
    }
    await output.finalize()
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  }
  return { blob: new Blob([target.buffer!]), type: mp4 ? 'video/mp4' : 'video/webm' }
}

/** MP4 first (Safari, recent Chrome), then WebM */
function recorderType(): string | undefined {
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
}

async function record(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, film: RaceFilm, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const { width: W, height: H, fps } = RACE_VIDEO
  const mimeType = recorderType()!
  film.draw(ctx, W, H, 0)
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise((resolve) => (recorder.onstop = resolve))
  recorder.start(1000)
  try {
    // Plays the race in real time; the recorder captures whatever the canvas shows
    await new Promise<void>((resolve, reject) => {
      const start = performance.now()
      const tick = () => {
        if (signal?.aborted) return reject(signal.reason)
        const time = Math.min(film.duration, (performance.now() - start) / 1000)
        film.draw(ctx, W, H, time)
        onProgress(time / film.duration)
        if (time >= film.duration) resolve()
        else setTimeout(tick, 1000 / fps)
      }
      // A timer rather than animation frames, which stop altogether in a hidden tab or pane
      tick()
    })
  } finally {
    recorder.stop()
    await stopped
    stream.getTracks().forEach((track) => track.stop())
  }
  return { blob: new Blob(chunks, { type: mimeType }), type: mimeType.split(';')[0] }
}
