import { useCallback, useEffect, useRef, useState } from 'react'
import { useWidth } from '../lib/hooks'
import { COARSE } from '../lib/pointer'
import { POSTER_DESIGN_SIZES, POSTER_SIZES, SOLID_PAPER_DESIGNS, isDarkPaper, renderPoster, type PosterData, type PosterDesign, type PosterPaper, type PosterSize } from '../viz/poster'
import { isLost, renderBlob, type RenderedImage } from '../viz/posterShared'
import { Segmented } from './ui'

/*
 * "Take it home": pick a design, size and background, see it live, then download
 * it or (on phones) send it straight to the share sheet. Rendered on-device.
 */

const DESIGNS: { value: PosterDesign; label: string }[] = [
  { value: 'deep', label: 'Deep dive' },
  { value: 'record', label: 'The Record' },
  { value: 'sleeve', label: 'Sleeve' },
  { value: 'annotated', label: 'Annotated' },
  // Archived for now (renderers kept in viz/poster.ts): macro, constellation, pulse
]

/** iPhone and iPad (which calls itself a Mac): there the share sheet's "Save Image" is the way into Photos */
const IOS = COARSE && typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)

/** On phones and tablets saving goes through the share sheet, the only way a web page can reach the camera roll */
const SAVE_LABEL = IOS ? 'Save to Photos' : 'Save or share…'

/** Every poster carries the same title */
const TITLE = 'On Record'

/** Deep dive can also come out this many times bigger, so a single day's groove gets real pixels */
const ULTRA_SCALES = [4, 3, 2]

/** The full-size poster, then smaller fallbacks for phones whose canvas gives out on a big record */
const FULL_SCALES = [1, 0.75, 0.5]

const PAPERS: { value: PosterPaper; label: string; swatch: string }[] = [
  { value: 'midnight', label: 'Black gradient', swatch: '#0b0a0f' },
  { value: 'cream', label: 'Cream gradient', swatch: '#efe8da' },
]

/** Flat versions, for the designs in SOLID_PAPER_DESIGNS */
const SOLID_PAPERS: { value: PosterPaper; label: string; swatch: string }[] = [
  { value: 'black', label: 'Black', swatch: '#0e0d12' },
  { value: 'solid-cream', label: 'Cream', swatch: '#efe8da' },
]

interface Props {
  data: PosterData
  design: PosterDesign
  onDesign: (design: PosterDesign) => void
}

export function PosterStudio({ data, design, onDesign }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useWidth(wrapRef, 420)
  const [size, setSize] = useState<PosterSize>('post')
  const [paper, setPaper] = useState<PosterPaper>('midnight')
  const [fontsReady, setFontsReady] = useState(false)
  // Bumped when the browser hands back a preview canvas it had dropped, so the poster is drawn again
  const [restored, setRestored] = useState(0)
  const [busy, setBusy] = useState<'download' | 'ultra' | 'share' | null>(null)
  const [canShare] = useState(supportsFileShare)
  // Safari only opens the share sheet straight after a tap, so on phones the full-size image is made ahead of time
  const readyBlob = useRef<{ key: string; data: PosterData; blob: Blob } | null>(null)
  // On touch screens that full-size image also sits over the preview, so touch and hold saves it like any photo
  const [pressImage, setPressImage] = useState<{ key: string; data: PosterData; url: string } | null>(null)
  // Ultra HD takes too long to render inside one tap, so on phones it's made first and shared with a second tap
  const [ultra, setUltra] = useState<{ key: string; data: PosterData; blob: Blob } | null>(null)
  // When the last image made for these options came out smaller than its size promises (`made`), or not at all (null)
  const [shortfall, setShortfall] = useState<{ key: string; data: PosterData; made: { width: number; height: number } | null } | null>(null)
  const mobile = COARSE && canShare

  // Some designs are drawn for one size only, so the size picker narrows to what they support
  const sizes = POSTER_DESIGN_SIZES[design] ?? (Object.keys(POSTER_SIZES) as PosterSize[])
  const activeSize = sizes.includes(size) ? size : sizes[0]
  const spec = POSTER_SIZES[activeSize]
  const cssW = Math.min(width, activeSize === 'story' ? 330 : 440)
  const cssH = (cssW * spec.height) / spec.width
  const hasUltra = design === 'deep'
  // Only some designs offer the solid backgrounds; elsewhere a solid pick falls back to its textured twin
  const papers = SOLID_PAPER_DESIGNS.includes(design) ? [...PAPERS, ...SOLID_PAPERS] : PAPERS
  const activePaper = papers.some((p) => p.value === paper) ? paper : isDarkPaper(paper) ? 'midnight' : 'cream'
  const fileName = `on-record-${data.period.replace(/[^\d–-]+/g, '').replace('–', '-') || 'all-time'}-${design}.png`
  const optionsKey = `${design}|${activeSize}|${activePaper}`

  useEffect(() => {
    let live = true
    // Canvas text only uses fonts that are already loaded, so ask for every face the poster uses
    Promise.all([
      document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
      document.fonts.load('600 40px "JetBrains Mono Variable"'),
      document.fonts.load('italic 40px "Instrument Serif"'),
    ]).finally(() => live && setFontsReady(true))
    return () => {
      live = false
    }
  }, [])

  // Phones can drop a canvas's pixels when the GPU runs short; draw the poster again once it's handed back.
  // (Cancelling 'contextlost' would tell a 2D canvas not to come back, so that event is left alone.)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const back = () => setRestored((n) => n + 1)
    canvas.addEventListener('contextrestored', back)
    return () => canvas.removeEventListener('contextrestored', back)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    renderPoster(ctx, canvas.width, canvas.height, data, { design, paper: activePaper, title: TITLE })
  }, [data, design, activePaper, cssW, cssH, fontsReady, restored])

  const fullSize = useCallback(
    async (scales: number[] = FULL_SCALES): Promise<Blob | null> => {
      await document.fonts.ready
      let image: RenderedImage | null = null
      try {
        image = await renderBlob(spec.width, spec.height, scales, (ctx, w, h) => renderPoster(ctx, w, h, data, { design, paper: activePaper, title: TITLE }))
      } catch (err) {
        console.error(err)
      }
      // A big render can cost the preview its pixels too, in browsers that never say so
      const preview = canvasRef.current?.getContext('2d')
      if (preview && isLost(preview)) setRestored((n) => n + 1)
      // Ultra HD only promises "up to" its size, so it only owns up to not working at all
      const regular = scales === FULL_SCALES
      if (!image) setShortfall({ key: optionsKey, data, made: null })
      else if (regular) setShortfall(image.width < spec.width ? { key: optionsKey, data, made: { width: image.width, height: image.height } } : null)
      return image?.blob ?? null
    },
    [spec, data, design, activePaper, optionsKey],
  )

  useEffect(() => {
    if (!(canShare || COARSE) || !fontsReady) return
    let live = true
    const timer = setTimeout(async () => {
      const blob = await fullSize()
      if (!blob || !live) return
      readyBlob.current = { key: optionsKey, data, blob }
      if (COARSE) setPressImage({ key: optionsKey, data, url: URL.createObjectURL(blob) })
    }, 700)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [canShare, fontsReady, fullSize, optionsKey, data])

  const pressUrl = pressImage?.url
  useEffect(() => {
    if (!pressUrl) return
    return () => URL.revokeObjectURL(pressUrl)
  }, [pressUrl])

  const pressReady = pressImage && pressImage.key === optionsKey && pressImage.data === data ? pressImage.url : null
  const ultraReady = ultra && ultra.key === optionsKey && ultra.data === data ? ultra.blob : null
  const ultraName = fileName.replace(/\.png$/, '-ultra.png')
  const short = shortfall && shortfall.key === optionsKey && shortfall.data === data ? shortfall : null

  function save(blob: Blob, name = fileName) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  async function download() {
    setBusy('download')
    try {
      const blob = await fullSize()
      if (blob) save(blob)
    } finally {
      setBusy(null)
    }
  }

  async function downloadUltra() {
    setBusy('ultra')
    try {
      // Let the button repaint as "Rendering…" before the long draw blocks the page
      await new Promise((resolve) => setTimeout(resolve, 50))
      const blob = await fullSize(ULTRA_SCALES)
      if (!blob) return
      if (mobile) setUltra({ key: optionsKey, data, blob })
      else save(blob, ultraName)
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    const cached = readyBlob.current
    let blob = cached && cached.key === optionsKey && cached.data === data ? cached.blob : null
    if (!blob) {
      setBusy('share')
      blob = await fullSize()
      setBusy(null)
    }
    if (!blob) return
    try {
      await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: TITLE })
    } catch (err) {
      const name = (err as Error).name
      // The tap "expired" while rendering: save the file instead
      if (name === 'NotAllowedError') save(blob)
      // AbortError just means the share sheet was closed
      else if (name !== 'AbortError') console.error(err)
    }
  }

  async function shareUltra(blob: Blob) {
    try {
      await navigator.share({ files: [new File([blob], ultraName, { type: 'image/png' })], title: TITLE })
    } catch (err) {
      // Closing the sheet is fine; anything else (often a file too big to hand over) falls back to a plain download
      if ((err as Error).name !== 'AbortError') save(blob, ultraName)
    }
  }

  return (
    <div className="studio">
      <div className="studio__preview" ref={wrapRef}>
        <div className="studio__poster" style={{ width: cssW, height: cssH }}>
          <canvas
            ref={canvasRef}
            className="studio__canvas"
            style={{ width: cssW, height: cssH }}
            role="img"
            aria-label={`Preview of your ${design} poster`}
          />
          {pressReady && <img className="studio__press" src={pressReady} alt="" />}
        </div>
      </div>

      <div className="studio__controls">
        <div className="field">
          <span className="field__label">Design</span>
          <Segmented label="Poster design" scrollable value={design} onChange={onDesign} options={DESIGNS} />
        </div>

        <div className="field">
          <span className="field__label">Size</span>
          <Segmented
            label="Poster size"
            value={activeSize}
            onChange={setSize}
            options={sizes.map((key) => ({
              value: key,
              label: `${POSTER_SIZES[key].label} ${POSTER_SIZES[key].ratio}`,
            }))}
          />
          <span className="field__note">
            {spec.width} × {spec.height} px · {spec.note}
          </span>
        </div>

        <div className="field">
          <span className="field__label">Background</span>
          <div className="swatches" role="group" aria-label="Background">
            {papers.map((p) => (
              <button key={p.value} type="button" className="swatch" aria-pressed={activePaper === p.value} onClick={() => setPaper(p.value)}>
                <i style={{ background: p.swatch }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {mobile ? (
          <div className="studio__actions">
            <button type="button" className="button button--big" onClick={share} disabled={busy !== null}>
              {busy === 'share' ? 'Rendering…' : SAVE_LABEL}
            </button>
            <button type="button" className="button button--big button--ghost" onClick={download} disabled={busy !== null}>
              {busy === 'download' ? 'Rendering…' : '↓ Download PNG'}
            </button>
          </div>
        ) : (
          <div className="studio__actions">
            <button type="button" className="button button--big" onClick={download} disabled={busy !== null}>
              {busy === 'download' ? 'Rendering…' : '↓ Download PNG'}
            </button>
            {canShare && (
              <button type="button" className="button button--big button--ghost" onClick={share} disabled={busy !== null}>
                {busy === 'share' ? 'Rendering…' : 'Share…'}
              </button>
            )}
          </div>
        )}
        {short && (
          <p className="studio__notice" role="status">
            {short.made
              ? `This device could only make it ${short.made.width} × ${short.made.height} px, not the full ${spec.width} × ${spec.height}. A computer can make it full size.`
              : 'This device couldn’t make the image. Try again, or make it on a computer.'}
          </p>
        )}
        {hasUltra && (
          <div className="studio__ultra">
            {ultraReady ? (
              <button type="button" className="button" onClick={() => shareUltra(ultraReady)}>
                {IOS ? 'Save Ultra HD to Photos' : 'Save or share Ultra HD…'}
              </button>
            ) : (
              <button type="button" className="button button--ghost" onClick={downloadUltra} disabled={busy !== null}>
                {busy === 'ultra' ? 'Rendering… this takes a moment' : mobile ? 'Make Ultra HD' : '↓ Ultra HD PNG'}
              </button>
            )}
            <span className="field__note">
              Up to {spec.width * ULTRA_SCALES[0]} × {spec.height * ULTRA_SCALES[0]} px · zoom in until every groove is a single day
            </span>
          </div>
        )}
        <p className="hint">
          {COARSE && 'You can also touch and hold the poster to save it. '}Made right here on your device. Nothing is uploaded.
        </p>
      </div>
    </div>
  )
}

/** True where the browser can hand an image file to the system share sheet (iPhone, Android, Safari) */
function supportsFileShare(): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([new Blob()], 'poster.png', { type: 'image/png' })] })
    )
  } catch {
    return false
  }
}
