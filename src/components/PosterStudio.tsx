import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useWidth } from '../lib/hooks'
import { POSTER_SIZES, renderPoster, type PosterData, type PosterDesign, type PosterPaper, type PosterSize } from '../viz/poster'
import { Segmented } from './ui'

/*
 * "Take it home": pick a design, size and paper, see it live, then download
 * it or (on phones) send it straight to the share sheet. Rendered on-device.
 */

const DESIGNS: { value: PosterDesign; label: string }[] = [
  { value: 'record', label: 'The Record' },
  { value: 'constellation', label: 'Constellation' },
  { value: 'pulse', label: 'Pulse' },
]

const PAPERS: { value: PosterPaper; label: string; swatch: string }[] = [
  { value: 'midnight', label: 'Midnight', swatch: '#0b0a0f' },
  { value: 'cream', label: 'Cream', swatch: '#efe8da' },
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
  const [title, setTitle] = useState('On Record')
  const deferredTitle = useDeferredValue(title)
  const [fontsReady, setFontsReady] = useState(false)
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const [canShare] = useState(supportsFileShare)
  // Safari only opens the share sheet straight after a tap, so on phones the full-size image is made ahead of time
  const readyBlob = useRef<{ key: string; data: PosterData; blob: Blob } | null>(null)

  const spec = POSTER_SIZES[size]
  const cssW = Math.min(width, size === 'story' ? 330 : 440)
  const cssH = (cssW * spec.height) / spec.width
  const finalTitle = deferredTitle.trim() || 'On Record'
  const fileName = `on-record-${data.period.replace(/[^\d–-]+/g, '').replace('–', '-') || 'all-time'}-${design}.png`

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

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    renderPoster(ctx, canvas.width, canvas.height, data, { design, paper, title: finalTitle })
  }, [data, design, paper, finalTitle, cssW, cssH, fontsReady])

  const fullSize = useCallback(async (): Promise<Blob | null> => {
    await document.fonts.ready
    const canvas = document.createElement('canvas')
    canvas.width = spec.width
    canvas.height = spec.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    renderPoster(ctx, spec.width, spec.height, data, { design, paper, title: finalTitle })
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  }, [spec, data, design, paper, finalTitle])

  const optionsKey = `${design}|${size}|${paper}|${finalTitle}`

  useEffect(() => {
    if (!canShare || !fontsReady) return
    const timer = setTimeout(async () => {
      const blob = await fullSize()
      if (blob) readyBlob.current = { key: optionsKey, data, blob }
    }, 700)
    return () => clearTimeout(timer)
  }, [canShare, fontsReady, fullSize, optionsKey, data])

  function save(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
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
      await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: finalTitle })
    } catch (err) {
      const name = (err as Error).name
      // The tap "expired" while rendering: save the file instead
      if (name === 'NotAllowedError') save(blob)
      // AbortError just means the share sheet was closed
      else if (name !== 'AbortError') console.error(err)
    }
  }

  return (
    <div className="studio">
      <div className="studio__preview" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="studio__canvas"
          style={{ width: cssW, height: cssH }}
          role="img"
          aria-label={`Preview of your ${design} poster`}
        />
      </div>

      <div className="studio__controls">
        <div className="field">
          <span className="field__label">Design</span>
          <Segmented label="Poster design" value={design} onChange={onDesign} options={DESIGNS} />
        </div>

        <div className="field">
          <span className="field__label">Size</span>
          <Segmented
            label="Poster size"
            value={size}
            onChange={setSize}
            options={(Object.keys(POSTER_SIZES) as PosterSize[]).map((key) => ({
              value: key,
              label: `${POSTER_SIZES[key].label} ${POSTER_SIZES[key].ratio}`,
            }))}
          />
          <span className="field__note">
            {spec.width} × {spec.height} px · {spec.note}
          </span>
        </div>

        <div className="field">
          <span className="field__label">Paper</span>
          <div className="swatches" role="group" aria-label="Paper">
            {PAPERS.map((p) => (
              <button key={p.value} type="button" className="swatch" aria-pressed={paper === p.value} onClick={() => setPaper(p.value)}>
                <i style={{ background: p.swatch }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Title</span>
          <input className="text-input" value={title} maxLength={24} onChange={(e) => setTitle(e.target.value)} placeholder="On Record" />
        </label>

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
        <p className="hint">Made right here on your device. Nothing is uploaded.</p>
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
