import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatNumber } from '../lib/format'
import { isLaunchKey } from '../lib/keys'
import type { YearRange } from '../data/stats'

interface ModalProps {
  open: boolean
  /** Escape or a click on the backdrop: the dialog asks, and the owner decides what closing means */
  onClose: () => void
  /** The browser closed it without asking (Android's back gesture can); defaults to onClose */
  onGone?: () => void
  label: string
  className?: string
  children: ReactNode
}

/**
 * A native modal dialog: it traps focus, hands it back on close, and keeps the
 * page underneath inert.
 */
export function Modal({ open, onClose, onGone, label, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const openRef = useRef(open)
  // Whether the last press began on the backdrop. A click that starts in the search box and ends
  // outside (selecting text) also lands on the dialog itself, and mustn't close it.
  const downOnBackdrop = useRef(false)

  useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal focuses the first button it finds; start on the heading (or the launcher's search) instead
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  /*
   * Keys pressed in the dialog stop at its onKeyDown below. Focus can still end up on <body> (a
   * focused button that goes away, or in some browsers a click on plain text), and keys from there
   * would skip the dialog and reach the page's window listeners: the tour's arrows and Escape would
   * act behind it. Those stop here, and focus goes back in so the next key works. The browser still
   * closes the dialog on Escape as usual.
   */
  useEffect(() => {
    if (!open) return
    const guard = (e: KeyboardEvent) => {
      const dialog = ref.current
      if (!dialog || isLaunchKey(e) || dialog.contains(e.target as Node)) return
      e.stopPropagation()
      if (e.key !== 'Tab') dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    window.addEventListener('keydown', guard, true)
    return () => window.removeEventListener('keydown', guard, true)
  }, [open])

  return (
    <dialog
      ref={ref}
      className={className ? `modal ${className}` : 'modal'}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // Closing it ourselves happens once `open` is already false; a close while it's still true came from the browser
      onClose={() => {
        if (openRef.current) (onGone ?? onClose)()
      }}
      // Keys pressed in a dialog stay in it, so the tour's arrows and Escape don't act behind it.
      // ⌘K still gets through, so it can close the launcher again.
      onKeyDown={(e) => {
        if (isLaunchKey(e)) return
        e.stopPropagation()
        // An Escape that cancels an input method's composition is the input's, not a close
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
        e.preventDefault()
        onClose()
      }}
      // The dialog itself has no padding, so a press that lands on it (not its content) is on the backdrop
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
        downOnBackdrop.current = false
      }}
    >
      {open && <div className="modal__body">{children}</div>}
    </dialog>
  )
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="modal__head">
      <h2 tabIndex={-1} data-autofocus>
        {title}
      </h2>
      <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </header>
  )
}

interface MissingHistoryProps {
  open: boolean
  onClose: () => void
  onReset: () => void
  /** What went wrong with each file */
  failures: string[]
}

/**
 * Says up front when some files couldn't be read. The charts look just as finished
 * without them, and on a phone's deck there's no Load details to find out from.
 */
export function MissingHistoryPanel({ open, onClose, onReset, failures }: MissingHistoryProps) {
  return (
    <Modal open={open} onClose={onClose} label="Part of your history is missing" className="modal--panel">
      <ModalHead title="Part of your history is missing" onClose={onClose} />
      <ul className="missing__files">
        {[...new Set(failures)].map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
      <p className="settings__note">The charts only show the files that did load. To include the rest, start over and add all your files together.</p>
      <div className="missing__actions">
        <button type="button" className="button button--small" onClick={onClose}>
          Show what loaded
        </button>
        <button type="button" className="button button--ghost button--small" onClick={onReset}>
          Start over
        </button>
      </div>
    </Modal>
  )
}

interface SettingsProps {
  open: boolean
  onClose: () => void
  onGone: () => void
  musicOnly: boolean
  onMusicOnly: (on: boolean) => void
  /** Podcast and audiobook plays in the whole export; 0 hides the switch's effect */
  otherPlays: number
  /** False when the export has no music at all, so music only would leave nothing */
  hasAnyMusic: boolean
}

export function SettingsPanel({ open, onClose, onGone, musicOnly, onMusicOnly, otherPlays, hasAnyMusic }: SettingsProps) {
  const canToggle = hasAnyMusic && otherPlays > 0
  return (
    <Modal open={open} onClose={onClose} onGone={onGone} label="Settings" className="modal--panel">
      <ModalHead title="Settings" onClose={onClose} />

      <section className="settings__row">
        <label className="switch">
          <input type="checkbox" checked={musicOnly && hasAnyMusic} disabled={!canToggle} onChange={(e) => onMusicOnly(e.target.checked)} />
          <span className="switch__track" aria-hidden="true" />
          <span className="switch__label">Music only</span>
        </label>
        <p className="settings__note">
          {!hasAnyMusic
            ? 'There’s no music in this history, so podcasts and audiobooks stay in.'
            : otherPlays === 0
              ? 'There are no podcasts or audiobooks in this history.'
              : `Leaves out ${formatNumber(otherPlays)} podcast and audiobook play${otherPlays === 1 ? '' : 's'}.`}
        </p>
      </section>
    </Modal>
  )
}

export interface YearsProps {
  /** Plays that started in each year of the whole export */
  yearCounts: ReadonlyMap<number, number>
  /** The years kept, or null for all of them */
  range: YearRange | null
  /** Asks for a new range; false when it would leave nothing to show, and the slider stays where it was */
  onRange: (range: YearRange) => boolean
}

/**
 * Two thumbs on one track over a bar for each year's plays, so a gap in the history shows up as the
 * empty stretch it is and can be slid past. Years are whole calendar years, empty ones included.
 */
export function YearsControl({ yearCounts, range, onRange }: YearsProps) {
  const [refused, setRefused] = useState(false)
  const all = [...yearCounts.keys()]
  const first = Math.min(...all)
  const last = Math.max(...all)
  if (last <= first) return <p className="settings__note">Everything here is from {first}, so there are no years to leave out.</p>
  const [from, to] = range ?? [first, last]
  const peak = Math.max(...yearCounts.values())
  let left = 0
  for (const [y, n] of yearCounts) if (y < from || y > to) left += n
  const steps = last - first
  const span = Array.from({ length: steps + 1 }, (_, i) => first + i)
  const change = (next: YearRange) => setRefused(!onRange(next))
  return (
    <div className="years-control">
      <h3>
        Showing <span className="years__span">{from === to ? from : `${from}–${to}`}</span>
      </h3>
      <div className="years">
        <div className="years__bars" aria-hidden="true">
          {span.map((y) => (
            <span key={y} className={y < from || y > to ? 'years__bar is-out' : 'years__bar'} style={{ height: `${((yearCounts.get(y) ?? 0) / peak) * 100}%` }} />
          ))}
        </div>
        <div className="years__range" style={{ '--from': (from - first) / steps, '--to': (to - first) / steps } as CSSProperties}>
          <span className="years__fill" aria-hidden="true" />
          {/* The first-year thumb rides on top when both sit at the far end, or it could never be pulled back */}
          <input
            type="range"
            className={from === last ? 'is-top' : undefined}
            min={first}
            max={last}
            step={1}
            value={from}
            aria-label="First year"
            onChange={(e) => change([Math.min(Number(e.target.value), to), to])}
          />
          <input type="range" min={first} max={last} step={1} value={to} aria-label="Last year" onChange={(e) => change([from, Math.max(Number(e.target.value), from)])} />
        </div>
        <div className="years__ends" aria-hidden="true">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      </div>
      <p className="settings__note" role="status">
        {refused
          ? 'Can’t leave out those years: that would leave nothing on the record.'
          : left === 0
            ? 'Slide the ends in to leave out years, like ones from a service you stopped using.'
            : `Leaves out ${formatNumber(left)} play${left === 1 ? '' : 's'} from other years. The charts update when you close this.`}
      </p>
    </div>
  )
}
