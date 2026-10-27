import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCloseOnBack } from '../lib/back'

/*
 * The tracklist for phones, where the side nav doesn't fit: the top bar names
 * the section you're in, and tapping it drops down every section to jump to.
 */

export interface Track {
  id: string
  /** Track number, e.g. "A1"; the letter is the side */
  num: string
  title: string
}

interface Props {
  tracks: Track[]
  /** Side letter → side title, e.g. A → "Time" */
  sides: Record<string, string>
  current: string | null
  onPoster: () => void
  onReset: () => void
  /** On the phone's deck of cards there's nothing to scroll to: picking a track deals its card instead */
  onJump?: (id: string) => void
  /** Opens upwards, for the bar at the bottom of the deck */
  up?: boolean
  /** What the button says, when something else already names the track */
  label?: ReactNode
}

export function TrackMenu({ tracks, sides, current, onPoster, onReset, onJump, up, label }: Props) {
  const [open, setOpen] = useState(false)
  useCloseOnBack(open, () => setOpen(false))
  const ref = useRef<HTMLDivElement>(null)
  const track = tracks.find((t) => t.id === current)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className={up ? 'trackmenu trackmenu--up' : 'trackmenu'} ref={ref}>
      <button type="button" className="trackmenu__button" aria-expanded={open} aria-controls="trackmenu-sheet" onClick={() => setOpen(!open)}>
        {label ? (
          <span className="trackmenu__title">{label}</span>
        ) : track ? (
          <>
            <span className="trackmenu__num">{track.num}</span>
            <span className="trackmenu__title">{track.title}</span>
          </>
        ) : (
          <span className="trackmenu__title">Tracklist</span>
        )}
        <span className="trackmenu__chevron" aria-hidden="true" />
      </button>

      {open && (
        <nav className="trackmenu__sheet" id="trackmenu-sheet" aria-label="Sections">
          <div className="trackmenu__sides">
            {Object.entries(sides).map(([side, title]) => (
              <div key={side}>
                <p className="trackmenu__side">
                  Side {side} <span>{title}</span>
                </p>
                <ol>
                  {tracks
                    .filter((t) => t.num.startsWith(side))
                    .map((t) => (
                      <li key={t.id}>
                        <a
                          href={`#${t.id}`}
                          aria-current={t.id === current ? 'true' : undefined}
                          onClick={(e) => {
                            setOpen(false)
                            if (!onJump) return
                            e.preventDefault()
                            onJump(t.id)
                          }}
                        >
                          <span>{t.num}</span>
                          {t.title}
                        </a>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="trackmenu__foot">
            {!onJump && (
              <a href="#top" onClick={() => setOpen(false)}>
                Back to the top
              </a>
            )}
            <button type="button" className="button button--ghost button--small" onClick={onReset}>
              New data
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                setOpen(false)
                onPoster()
              }}
            >
              Poster
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
