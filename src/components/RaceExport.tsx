import { useContext, useEffect, useRef, useState, type RefObject } from 'react'
import type { Bins, RaceData } from '../data/insights'
import { InCards } from '../lib/stage'
import { makeRaceVideo, raceVideoMode } from '../viz/raceVideo'

/*
 * "Story video": renders the race as a 9:16 video on-device, then offers it to the share sheet (so it
 * can go straight to Instagram) or as a download. Rendering takes longer than a tap stays "fresh" for
 * on iPhone, so sharing is a second tap once the video is ready.
 *
 * It keeps rendering while its card is offstage (cards stay mounted), so swiping away doesn't lose it;
 * only Cancel, or new data for the race (a new year or filter remounts it), stops it.
 */

type Phase = { kind: 'idle' } | { kind: 'rendering'; progress: number } | { kind: 'done'; file: File; url: string } | { kind: 'error' }

interface Props {
  bins: Bins
  race: RaceData
  colors: Map<string, string>
  /** The page's race board: its covers are reused for the video */
  board: RefObject<HTMLElement | null>
  /** Told when a render starts, and when it and the video it made are put away */
  onBusy?: (busy: boolean) => void
}

export function RaceExport({ bins, race, colors, board, onBusy }: Props) {
  const cards = useContext(InCards)
  const [mode] = useState(raceVideoMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const url = phase.kind === 'done' ? phase.url : null
  // Rendering, or showing what it made: either way the race on the page waits
  const busy = phase.kind === 'rendering' || phase.kind === 'done'
  const onBusyRef = useRef(onBusy)
  useEffect(() => {
    onBusyRef.current = onBusy
  })

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])
  useEffect(() => {
    onBusyRef.current?.(busy)
  }, [busy])

  async function render() {
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'rendering', progress: 0 })
    const { covers, urls } = await loadCovers(board.current, race.names)
    try {
      const file = await makeRaceVideo(
        { bins, race, colors, covers },
        // A late progress report mustn't bring back a render that was cancelled
        (progress) => !controller.signal.aborted && setPhase({ kind: 'rendering', progress }),
        controller.signal,
      )
      if (!controller.signal.aborted) setPhase({ kind: 'done', file, url: URL.createObjectURL(file) })
    } catch (err) {
      if ((err as Error).name === 'AbortError' || controller.signal.aborted) return
      console.error(err)
      setPhase({ kind: 'error' })
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }

  function cancel() {
    abort.current?.abort()
    setPhase({ kind: 'idle' })
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
    const shareable = canShareFile(file)
    if (cards) {
      // On a card the finished video takes the race's place until you close it
      return (
        <section className="race-share" aria-label="Your race video">
          <video className="race-share__video" src={phase.url} autoPlay muted loop playsInline aria-label="Your race as a story video" />
          <p className="race-share__title">Your race, ready for your story</p>
          <p className="race-share__note">Made on your phone. Nothing was uploaded.</p>
          {shareable ? (
            <button type="button" className="button race-share__go" onClick={() => share(file, phase.url)} autoFocus>
              <ShareIcon />
              Share to your story
            </button>
          ) : (
            <button type="button" className="button race-share__go" onClick={() => save(file, phase.url)} autoFocus>
              Save video
            </button>
          )}
          <div className="race-share__more">
            {shareable && (
              <button type="button" className="race-share__link" onClick={() => save(file, phase.url)}>
                Save video
              </button>
            )}
            <button type="button" className="race-share__link" onClick={() => setPhase({ kind: 'idle' })}>
              Close
            </button>
          </div>
        </section>
      )
    }
    return (
      <div className="race-export race-export--done">
        <video className="race-export__video" src={phase.url} autoPlay muted loop playsInline aria-label="Your race as a story video" />
        <div className="race-export__side">
          <p className="race-export__title">Your race, ready for your story</p>
          <p className="field__note">1080 × 1920, made on your device. Nothing is uploaded.</p>
          <div className="race-export__actions">
            {shareable && (
              <button type="button" className="button" onClick={() => share(file, phase.url)}>
                Share…
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={() => save(file, phase.url)}>
              Save video
            </button>
          </div>
          <button type="button" className="race-export__close" onClick={() => setPhase({ kind: 'idle' })}>
            Close
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'rendering') {
    const pct = Math.round(phase.progress * 100)
    return (
      <div className="race-export race-export--busy">
        <div className="race-export__meter">
          <span className="race-export__status" aria-live="polite">
            {/* Recording plays the race through once in real time, so it needs the tab in front */}
            {mode === 'record' ? `Recording, keep this tab open… ${pct}%` : `Making your video… ${pct}%`}
          </span>
          <div className="race-export__progress" role="progressbar" aria-label="Making your video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button type="button" className="race-export__cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="race-export">
      {cards ? (
        <button type="button" className="button race-export__go" onClick={render} disabled={!mode}>
          <ShareIcon />
          Share to your story
        </button>
      ) : (
        <button type="button" className="button button--ghost button--small" onClick={render} disabled={!mode}>
          Make a story video
        </button>
      )}
      {!mode && <span className="field__note">This browser can’t make videos.</span>}
      {phase.kind === 'error' && <span className="field__note">Couldn’t make the video in this browser.</span>}
    </div>
  )
}

/** The usual share mark: a box with an arrow leaving it */
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11.5V2M5.5 5.2 9 1.8l3.5 3.4" />
      <path d="M6 7.5H4.5a1.5 1.5 0 0 0-1.5 1.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5H12" />
    </svg>
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
