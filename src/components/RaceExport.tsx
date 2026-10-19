import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Bins, RaceData } from '../data/insights'
import { makeRaceVideo, raceVideoMode } from '../viz/raceVideo'

/*
 * "Story video": renders the race as a 9:16 video on-device, then offers it to the share sheet (so it
 * can go straight to Instagram) or as a download. Rendering takes longer than a tap stays "fresh" for
 * on iPhone, so sharing is a second tap once the video is ready.
 */

type Phase = { kind: 'idle' } | { kind: 'rendering'; progress: number } | { kind: 'done'; file: File; url: string } | { kind: 'error' }

interface Props {
  bins: Bins
  race: RaceData
  colors: Map<string, string>
  /** The page's race board: its covers are reused for the video */
  board: RefObject<HTMLElement | null>
}

export function RaceExport({ bins, race, colors, board }: Props) {
  const [mode] = useState(raceVideoMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const url = phase.kind === 'done' ? phase.url : null

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  async function render() {
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'rendering', progress: 0 })
    const { covers, urls } = await loadCovers(board.current, race.names)
    try {
      const file = await makeRaceVideo({ bins, race, colors, covers }, (progress) => setPhase({ kind: 'rendering', progress }), controller.signal)
      setPhase({ kind: 'done', file, url: URL.createObjectURL(file) })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.error(err)
      setPhase({ kind: 'error' })
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }

  function save(file: File, href: string) {
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    a.click()
  }

  async function share(file: File, href: string) {
    try {
      await navigator.share({ files: [file] })
    } catch (err) {
      const name = (err as Error).name
      if (name === 'NotAllowedError') save(file, href)
      else if (name !== 'AbortError') console.error(err)
    }
  }

  if (phase.kind === 'done') {
    const { file } = phase
    return (
      <div className="race-export race-export--done">
        <video className="race-export__video" src={phase.url} autoPlay muted loop playsInline aria-label="Your race as a story video" />
        <div className="race-export__side">
          <p className="race-export__title">Your race, ready for your story</p>
          <p className="field__note">1080 × 1920 · made on your device, nothing uploaded</p>
          <div className="race-export__actions">
            {canShareFile(file) && (
              <button type="button" className="button" onClick={() => share(file, phase.url)}>
                Share…
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={() => save(file, phase.url)}>
              ↓ Download
            </button>
          </div>
          <button type="button" className="race-export__close" onClick={() => setPhase({ kind: 'idle' })}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="race-export">
      <button type="button" className="button button--ghost button--small" onClick={render} disabled={!mode || phase.kind === 'rendering'}>
        {phase.kind === 'rendering' ? `Making video… ${Math.round(phase.progress * 100)}%` : 'Make a story video'}
      </button>
      {!mode && <span className="field__note">This browser can’t make videos.</span>}
      {mode === 'record' && phase.kind === 'rendering' && <span className="field__note">Creating video now, keep this tab open</span>}
      {phase.kind === 'error' && <span className="field__note">Couldn’t make the video in this browser.</span>}
    </div>
  )
}

/** The board's generated covers as images, in `names` order (the board renders a row per name, in that order) */
async function loadCovers(board: HTMLElement | null, names: string[]) {
  const covers = new Map<string, CanvasImageSource>()
  const urls: string[] = []
  const svgs = board ? [...board.querySelectorAll<SVGSVGElement>('svg.race__cover')] : []
  await Promise.all(
    names.map(async (name, i) => {
      const svg = svgs[i]
      if (!svg) return
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', '256')
      clone.setAttribute('height', '256')
      const href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
      urls.push(href)
      const img = new Image()
      img.src = href
      try {
        await img.decode()
        covers.set(name, img)
      } catch {
        // Falls back to a plain colour square
      }
    }),
  )
  return { covers, urls }
}

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}
