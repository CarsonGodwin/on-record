import { hashString, mulberry32 } from '../lib/random'

/*
 * Cover art for names. The export has no artwork and this app never fetches any, so the one thing we
 * really know about a record is what it's called. Every cover is therefore a small print job: one
 * paper, one or two inks, and the name set as the picture, the way sleeves were designed when the
 * budget ran to a typesetter and no photographer. Same name, same cover, every time.
 *
 * A cover is worked out here as a list of marks on a 100 x 100 square, so the page (SVG) and the race
 * video (canvas) draw the same thing. An SVG turned into an image can't reach the page's fonts, which
 * is why the video doesn't just reuse the page's covers.
 */

export type Voice = 'display' | 'serif'

/** How wide a piece of text is, in ems of the given voice */
export type Measure = (text: string, voice: Voice) => number

export type Mark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | {
      kind: 'text'
      text: string
      x: number
      y: number
      size: number
      voice: Voice
      fill: string
      /** The width the line was fitted to, so a slightly different measurement can't break a flush edge */
      fit?: number
      /** Degrees clockwise around (x, y) */
      rotate?: number
    }
  | { kind: 'clip'; x: number; y: number; w: number; h: number; marks: Mark[] }

export interface CoverDesign {
  paper: string
  marks: Mark[]
}

export interface Stock {
  paper: string
  ink: string
  /** A second ink, used sparingly */
  alt: string
}

/**
 * Paper and ink chosen together, like a printer's swatch book, rather than two picks from a list of
 * brights: that's what keeps a wall of these looking like a record shop and not a theme generator.
 * Dark papers are the minority because the page itself is near-black and a cover should stand off it.
 */
export const STOCKS: Stock[] = [
  { paper: '#ece4d3', ink: '#17130f', alt: '#d2401e' },
  { paper: '#e2401f', ink: '#190b07', alt: '#f6e7cf' },
  { paper: '#1c3bb0', ink: '#f2ecdc', alt: '#f4c430' },
  { paper: '#e0a81c', ink: '#1a1405', alt: '#a32a12' },
  { paper: '#5c1418', ink: '#f6b8a4', alt: '#f2e6d0' },
  { paper: '#15402e', ink: '#dcdb63', alt: '#f2ecdc' },
  { paper: '#bb976c', ink: '#1a120a', alt: '#6f1d14' },
  { paper: '#c7b6e6', ink: '#2a1540', alt: '#c0252f' },
  { paper: '#141116', ink: '#ff6a2b', alt: '#f2ecdc' },
  { paper: '#bcd7dd', ink: '#10243f', alt: '#c23a22' },
  { paper: '#f2a0bd', ink: '#430b1c', alt: '#1c3bb0' },
  { paper: '#70702a', ink: '#f6efd8', alt: '#16140a' },
  { paper: '#0f5a5c', ink: '#f7cba6', alt: '#f2ecdc' },
  { paper: '#f0d640', ink: '#1b2aa6', alt: '#c9301e' },
  { paper: '#f4f1ea', ink: '#1c3bb0', alt: '#e2401f' },
]

const MARGIN = 6
const FULL = 100 - MARGIN * 2
/** The height of a capital, and the gap between tightly set lines, in ems of each voice */
const CAP: Record<Voice, number> = { display: 0.7, serif: 0.66 }
const GAP: Record<Voice, number> = { display: 0.1, serif: 0.3 }
/** How tall Chinese, Japanese and Korean characters stand, in ems: they fill the em where a capital doesn't */
const CJK_HEIGHT = 0.9
/** How far the tallest letters reach above the baseline, in ems: ascenders and round capitals go past the cap height */
const REACH: Record<Voice, number> = { display: 0.73, serif: 0.8 }
/** Extra room over a line of accented capitals, in ems, so the accent doesn't run into the line above */
const ACCENT_ROOM = 0.2
/** The small second line, like an artist under a song title */
const SUB_SIZE = 5.6
const SUB_STRIP = 11
/** Below this the small line can't be read at any size a cover is shown, so it gets shorter rather than smaller */
const SMALL_MIN = 5
/** Type shorter than this leaves a sleeve that looks blank at list size, so the name gets a bolder layout */
const THIN = 30
/** A line of type can only be cut in two and still be read if its capitals are at least this tall */
const CUTTABLE = 25
/** Words that read wrong alone on a huge line of their own */
const GLUE = new Set(['the', 'a', 'an', 'of', 'and', '&', 'de', 'la', 'le', 'el', 'los', 'las', 'les', 'du', 'des', 'in', 'on', 'to', 'for', 'feat.', 'ft.', 'mr.', 'mrs.', 'dr.', 'st.'])
const BLOCK_MIN = 6
const BLOCK_MIN_CJK = 2
const BLOCK_MAX = 28
const BLOCK_GAP = { min: 1.2, max: 3.2 }
/** The press sheet needs rows you can see as words */
const REPEAT_MAX = 18
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
/** Emoji come out as the phone's own glossy pictures, which aren't type and can't print in one ink */
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣/gu

const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean)
const inWords = (text: string) => splitWords(text.replace(PICTOGRAPH, '')).join(' ')
const isCjk = (text: string) => CJK.test(text)
const emsWide = (text: string, voice: Voice, measure: Measure) => Math.max(measure(text, voice), 0.01)

const letterSplitter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Letters as a reader sees them, so an accent or an emoji is never cut in half */
export function graphemes(text: string): string[] {
  return [...letterSplitter.segment(text)].map((s) => s.segment)
}

/** How tall a line stands, in ems */
const standing = (text: string, voice: Voice) => (isCjk(text) ? CJK_HEIGHT : CAP[voice])

/** Only capitals need the room: the serif keeps lowercase, whose accents sit below the line above */
const accentRoom = (line: Line, voice: Voice) =>
  voice === 'display' && !isCjk(line.text) && /\p{M}/u.test(line.text.normalize('NFD')) ? line.size * ACCENT_ROOM : 0

/** The name's words grouped so "the", "of", "&" stay on a line with what follows them */
function phrases(words: string[]): string[] {
  const out: string[] = []
  let held = ''
  for (const word of words) {
    const joined = held ? `${held} ${word}` : word
    if (GLUE.has(word.toLowerCase())) held = joined
    else {
      out.push(joined)
      held = ''
    }
  }
  if (held) {
    if (out.length) out[out.length - 1] += ` ${held}`
    else out.push(held)
  }
  return out
}

/** Breaks phrases into `n` lines of roughly even width, keeping their order */
function breakLines(parts: string[], n: number, voice: Voice, measure: Measure): string[] {
  const total = measure(parts.join(' '), voice)
  const target = total / n
  const lines: string[] = []
  let line = ''
  parts.forEach((part, i) => {
    const next = line ? `${line} ${part}` : part
    const left = n - lines.length - 1
    const mustBreak = parts.length - i <= left
    // Break when this line is nearer the target without the new part than with it
    const over = line !== '' && measure(next, voice) - target > target - measure(line, voice)
    if (line && left > 0 && (over || mustBreak)) {
      lines.push(line)
      line = part
    } else line = next
  })
  if (line) lines.push(line)
  return lines
}

interface Line {
  text: string
  size: number
  /** How wide the line is set */
  width: number
}

const gapAbove = (line: Line, voice: Voice) => line.size * GAP[voice] + accentRoom(line, voice)

const heightOf = (lines: Line[], voice: Voice) =>
  lines.reduce((sum, l) => sum + l.size * standing(l.text, voice), 0) + lines.slice(1).reduce((sum, l) => sum + gapAbove(l, voice), 0)

/** Each line sized to fill `width` exactly: as many lines as the height allows, since more lines means bigger type */
function fitStack(text: string, width: number, height: number, voice: Voice, measure: Measure): Line[] {
  const parts = phrases(splitWords(text))
  let best: Line[] = []
  for (let n = 1; n <= parts.length; n++) {
    const lines = breakLines(parts, n, voice, measure).map((line) => ({ text: line, size: width / emsWide(line, voice, measure), width }))
    if (best.length === 0 || heightOf(lines, voice) <= height) best = lines
  }
  // A lone narrow letter, like "I", would otherwise fill the width by growing far past the top of the sleeve
  const reach = (text: string) => (isCjk(text) ? CJK_HEIGHT : REACH[voice])
  if (best.length === 1 && best[0].size * reach(best[0].text) > height) {
    const size = height / reach(best[0].text)
    best = [{ text: best[0].text, size, width: size * emsWide(best[0].text, voice, measure) }]
  }
  return best
}

/** A stack's lines as marks, from `top`, in a box whose left edge is `x` */
function stackMarks(lines: Line[], x: number, top: number, voice: Voice, fill: string): Extract<Mark, { kind: 'text' }>[] {
  let y = top
  return lines.map((line, i) => {
    if (i > 0) y += gapAbove(line, voice)
    y += line.size * standing(line.text, voice)
    return { kind: 'text' as const, text: line.text, x, y, size: line.size, voice, fill, fit: line.width }
  })
}

/** As much of `text` as fits at the smallest readable size, ending at a clause if there is one, or null if not even a word does */
function shorten(text: string, width: number, voice: Voice, measure: Measure): string | null {
  const fits = (t: string) => emsWide(t, voice, measure) * SMALL_MIN <= width
  let kept = ''
  for (const word of splitWords(text)) {
    const next = kept ? `${kept} ${word}` : word
    if (!fits(next)) break
    kept = next
  }
  if (!kept) return null
  const clause = kept.match(/^(.*[^\s])[:;,]\s/)
  return (clause ? clause[1] : kept).replace(/[\s,:;(/–—-]+$/, '') || null
}

/** The small line's text and size: whichever of `tries` fits first, else the last one shortened */
function smallLine(tries: string[], width: number, largest: number, voice: Voice, measure: Measure): { text: string; size: number } | null {
  for (const text of tries) {
    const size = width / emsWide(text, voice, measure)
    if (size >= SMALL_MIN) return { text, size: Math.min(largest, size) }
  }
  const short = shorten(tries[tries.length - 1], width, voice, measure)
  return short === null ? null : { text: short, size: Math.min(largest, width / emsWide(short, voice, measure)) }
}

/** The second line across the top of the sleeve, or nothing if none of it would be readable */
function subMarks(sub: string, voice: Voice, fill: string, measure: Measure): Mark[] {
  const line = sub ? smallLine([sub], FULL, SUB_SIZE, voice, measure) : null
  return line ? [{ kind: 'text', text: line.text, x: MARGIN, y: MARGIN + SUB_SIZE * 0.8, size: line.size, voice, fill }] : []
}

/** For a name too long and narrow for stacks or the spine: broken into a block if it's one word, otherwise cropped */
function bolder(title: string, sub: string, voice: Voice, stock: Stock, measure: Measure): Mark[] {
  const letters = graphemes(title).length
  const cjk = isCjk(title)
  const blockable = (voice === 'display' || cjk) && letters >= (cjk ? BLOCK_MIN_CJK : BLOCK_MIN) && letters <= BLOCK_MAX && splitWords(title).length === 1
  return blockable ? block(title, sub, stock, measure) : cropped(title, sub, voice, stock, measure)
}

/** The name set solid at the bottom, the rest of the sleeve left empty */
function stacked(title: string, sub: string, voice: Voice, stock: Stock, measure: Measure): Mark[] {
  const lines = fitStack(title, FULL, FULL - (sub ? SUB_STRIP : 0), voice, measure)
  const tall = heightOf(lines, voice)
  if (tall < THIN) return bolder(title, sub, voice, stock, measure)
  return [...stackMarks(lines, MARGIN, 100 - MARGIN - tall, voice, stock.ink), ...subMarks(sub, voice, stock.ink, measure)]
}

/** One word broken across rows into a solid block. Only for one word: a break inside a two-word name reads as a typo */
function block(title: string, sub: string, stock: Stock, measure: Measure): Mark[] {
  const letters = graphemes(title)
  const height = FULL - (sub ? SUB_STRIP : 0)
  const line = (text: string): Line => ({ text, size: FULL / emsWide(text, 'display', measure), width: FULL })
  const rowsOf = (across: number) => {
    const rows: Line[] = []
    for (let i = 0; i < letters.length; i += across) rows.push(line(letters.slice(i, i + across).join('')))
    // A short last row would come out far bigger than the rest, so it shares the row above
    if (rows.length > 1 && graphemes(rows[rows.length - 1].text).length < Math.ceil(across / 2)) {
      const tail = rows.pop()!
      rows[rows.length - 1] = line(rows[rows.length - 1].text + tail.text)
    }
    return rows
  }
  const typeHeight = (rows: Line[]) => rows.reduce((sum, r, i) => sum + r.size * standing(r.text, 'display') + (i ? accentRoom(r, 'display') : 0), 0)
  // The fewest letters a row, so the biggest type, that still fits the whole name on the sleeve
  let across = 2
  while (across < letters.length && typeHeight(rowsOf(across)) + BLOCK_GAP.min * (rowsOf(across).length - 1) > height) across++
  const rows = rowsOf(across)
  const type = typeHeight(rows)
  // What the type leaves goes between the rows, up to a point: past that they stop reading as one block
  const gap = rows.length > 1 ? Math.min(BLOCK_GAP.max, Math.max(BLOCK_GAP.min, (height - type) / (rows.length - 1))) : 0
  let y = 100 - MARGIN - type - gap * (rows.length - 1)
  const marks: Mark[] = rows.map((row, i) => {
    if (i) y += accentRoom(row, 'display')
    y += row.size * standing(row.text, 'display')
    const mark: Mark = { kind: 'text', text: row.text, x: MARGIN, y, size: row.size, voice: 'display', fill: stock.ink, fit: FULL }
    y += gap
    return mark
  })
  return [...marks, ...subMarks(sub, 'display', stock.ink, measure)]
}

/** The name turned to run up the left edge, the way it does on a spine. Characters set upright and lone letters stay out: on their side they can't be read */
function spine(title: string, sub: string, voice: Voice, stock: Stock, measure: Measure): Mark[] {
  if (isCjk(title) || graphemes(title).length < 2) return stacked(title, sub, voice, stock, measure)
  const lines = fitStack(title, FULL, 74, voice, measure)
  if (heightOf(lines, voice) < THIN) return bolder(title, sub, voice, stock, measure)
  let across = MARGIN
  const marks: Mark[] = lines.map((line, i) => {
    if (i > 0) across += gapAbove(line, voice)
    across += line.size * standing(line.text, voice)
    return { kind: 'text', text: line.text, x: across, y: 100 - MARGIN, size: line.size, voice, fill: stock.ink, fit: line.width, rotate: -90 }
  })
  const x = across + 4
  const small = sub ? smallLine([sub], 100 - MARGIN - x, SUB_SIZE, voice, measure) : null
  if (small) marks.push({ kind: 'text', text: small.text, x, y: 100 - MARGIN, size: small.size, voice, fill: stock.ink })
  return marks
}

/** The first word bigger than the sleeve and cut off by its right edge, with the whole name small above. The first letter always shows whole, or the name reads as something else */
function cropped(title: string, sub: string, voice: Voice, stock: Stock, measure: Measure): Mark[] {
  const words = splitWords(title)
  const main = words.find((w) => !GLUE.has(w.toLowerCase()) && graphemes(w).length > 1) ?? words[0] ?? '?'
  const tries = sub ? [`${title}, ${sub}`, title] : [title]
  const small = smallLine(tries, FULL, SUB_SIZE + 1.4, voice, measure)
  const room = 100 - (small ? MARGIN + small.size + 3 : MARGIN) - 3
  const first = graphemes(main)[0] ?? main
  const size = Math.min(room / (isCjk(main) ? CJK_HEIGHT : REACH[voice]), FULL / emsWide(first, voice, measure))
  const marks: Mark[] = [{ kind: 'text', text: main, x: Math.max(0, MARGIN - size * 0.05), y: 97, size, voice, fill: stock.ink }]
  if (small) marks.push({ kind: 'text', text: small.text, x: MARGIN, y: MARGIN + small.size * 0.75, size: small.size, voice, fill: stock.ink })
  return marks
}

/** The name run again and again like a press sheet, with one line picked out in the second ink */
function repeated(title: string, sub: string, stock: Stock, seed: number, measure: Measure): Mark[] {
  const height = FULL - (sub ? SUB_STRIP : 0)
  const size = FULL / emsWide(title, 'display', measure)
  const pitch = size * (standing(title, 'display') + GAP.display * 1.4)
  const rows = Math.max(1, Math.floor((height + size * GAP.display * 1.4) / pitch))
  const picked = seed % rows
  const marks: Mark[] = Array.from({ length: rows }, (_, i) => ({
    kind: 'text' as const,
    text: title,
    x: MARGIN,
    y: 100 - MARGIN - i * pitch,
    size,
    voice: 'display' as const,
    fill: i === picked ? stock.alt : stock.ink,
    fit: FULL,
  }))
  return [...marks, ...subMarks(sub, 'display', stock.ink, measure)]
}

/** Two fields of colour with the name straddling the line, each half printed in the other's colour */
function counterchange(title: string, sub: string, voice: Voice, stock: Stock, seed: number, measure: Measure): Mark[] {
  const lines = fitStack(title, FULL, 52, voice, measure)
  const tall = heightOf(lines, voice)
  const top = 100 - MARGIN - tall - (seed % 3) * 6
  const set = stackMarks(lines, MARGIN, top, voice, stock.ink)
  const biggest = set.reduce((a, b) => (b.size > a.size ? b : a))
  const height = biggest.size * standing(biggest.text, voice)
  // Small type cut in half is a smear at list size, so this needs one line big enough to take it
  if (height < CUTTABLE) return stacked(title, sub, voice, stock, measure)
  // Through that line at a point that isn't its middle, or it reads as a table row
  const cut = biggest.y - height * (0.35 + ((seed >> 3) % 3) * 0.15)
  const type = (fill: string) => stackMarks(lines, MARGIN, top, voice, fill)
  return [
    { kind: 'rect', x: 0, y: cut, w: 100, h: 100 - cut, fill: stock.ink },
    { kind: 'clip', x: 0, y: 0, w: 100, h: cut, marks: type(stock.ink) },
    { kind: 'clip', x: 0, y: cut, w: 100, h: 100 - cut, marks: type(stock.paper) },
    ...subMarks(sub, voice, stock.ink, measure),
  ]
}

/** Capitals for the grotesque, which sets as a solid block; the serif keeps the name as it's written */
const inVoice = (text: string, voice: Voice) => (voice === 'display' ? text.toLocaleUpperCase() : text)

/**
 * Works out the cover for a name. `Title|Artist` puts the artist in small type under the title.
 * The same name always gets the same paper, voice and layout.
 */
export function designCover(name: string, measure: Measure): CoverDesign {
  const rand = mulberry32(hashString(name))
  const [rawTitle, ...rest] = name.split('|')
  const rawSub = inWords(rest.join(' '))
  const stock = STOCKS[Math.floor(rand() * STOCKS.length)]
  const voice: Voice = rand() < 0.28 ? 'serif' : 'display'
  const seed = Math.floor(rand() * 1024)
  const pick = rand()

  const title = inVoice(inWords(rawTitle) || '?', voice)
  const sub = rawSub && inVoice(rawSub, voice === 'display' ? 'serif' : voice)
  const letters = graphemes(title).length

  let marks: Mark[]
  if (voice === 'serif') {
    // The block and the press sheet are built on capitals, so the serif stays with the quieter layouts
    marks = pick < 0.45 ? stacked(title, sub, voice, stock, measure) : pick < 0.75 ? spine(title, sub, voice, stock, measure) : cropped(title, sub, voice, stock, measure)
  } else if (pick < 0.24) marks = stacked(title, sub, voice, stock, measure)
  else if (pick < 0.44 && letters >= BLOCK_MIN && letters <= BLOCK_MAX && splitWords(title).length === 1) marks = block(title, sub, stock, measure)
  else if (pick < 0.6) marks = spine(title, sub, voice, stock, measure)
  else if (pick < 0.74) marks = cropped(title, sub, voice, stock, measure)
  else if (pick < 0.86 && letters >= 4 && letters <= REPEAT_MAX) marks = repeated(title, sub, stock, seed, measure)
  else marks = counterchange(title, sub, voice, stock, seed, measure)

  return { paper: stock.paper, marks }
}

const FAMILY: Record<Voice, string> = {
  display: "'Bricolage Grotesque Variable', system-ui, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
}
const WEIGHT: Record<Voice, number> = { display: 800, serif: 400 }

export const voiceFont = (voice: Voice, size: number) => `${WEIGHT[voice]} ${size}px ${FAMILY[voice]}`
export const voiceFamily = (voice: Voice) => FAMILY[voice]
export const voiceWeight = (voice: Voice) => WEIGHT[voice]

let measuring: CanvasRenderingContext2D | null = null

/** Text widths from the page's real fonts */
export const pageMeasure: Measure = (text, voice) => {
  measuring ??= document.createElement('canvas').getContext('2d')
  if (!measuring) return text.length * 0.6
  measuring.font = voiceFont(voice, 100)
  return measuring.measureText(text).width / 100
}

const designs = new Map<string, CoverDesign>()
/** A plain letter and an accented one: the fonts come in pieces, and names need both before they're measured */
const FONT_SAMPLE = 'A\u0151'
let fontsWanted: Promise<unknown> | null = null

/** Settles once both voices are in, or have failed to load and won't be coming */
export function whenCoverFonts(): Promise<unknown> {
  fontsWanted ??= Promise.all([document.fonts.load(voiceFont('display', 16), FONT_SAMPLE), document.fonts.load(voiceFont('serif', 16), FONT_SAMPLE)]).catch(() => undefined)
  return fontsWanted
}

export const coverFontsIn = () => document.fonts.check(voiceFont('display', 16), FONT_SAMPLE) && document.fonts.check(voiceFont('serif', 16), FONT_SAMPLE)

/**
 * The cover for a name as the page should draw it. The race board asks for a cover on every frame, so
 * they're kept, but only once the fonts are in: a design measured against a fallback font wouldn't fit.
 */
export function coverFor(name: string): CoverDesign {
  const kept = designs.get(name)
  if (kept) return kept
  const design = designCover(name, pageMeasure)
  if (coverFontsIn()) designs.set(name, design)
  return design
}

/** Draws a cover into a square on a canvas: how the race video gets the same covers as the page */
export function drawCover(ctx: CanvasRenderingContext2D, design: CoverDesign, x: number, y: number, size: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 100, size / 100)
  ctx.beginPath()
  ctx.rect(0, 0, 100, 100)
  ctx.clip()
  ctx.fillStyle = design.paper
  ctx.fillRect(0, 0, 100, 100)
  drawMarks(ctx, design.marks)
  ctx.restore()
}

function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[]): void {
  for (const mark of marks) {
    if (mark.kind === 'rect') {
      ctx.fillStyle = mark.fill
      ctx.fillRect(mark.x, mark.y, mark.w, mark.h)
    } else if (mark.kind === 'clip') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(mark.x, mark.y, mark.w, mark.h)
      ctx.clip()
      drawMarks(ctx, mark.marks)
      ctx.restore()
    } else {
      ctx.save()
      ctx.translate(mark.x, mark.y)
      if (mark.rotate) ctx.rotate((mark.rotate * Math.PI) / 180)
      ctx.font = voiceFont(mark.voice, mark.size)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = mark.fill
      ctx.fillText(mark.text, 0, 0, mark.fit)
      ctx.restore()
    }
  }
}
