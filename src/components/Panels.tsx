import { useEffect, useRef, type ReactNode } from 'react'
import { formatNumber } from '../lib/format'

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
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return
        e.stopPropagation()
        // An Escape that cancels an input method's composition is the input's, not a close
        if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
        e.preventDefault()
        onClose()
      }}
      // The dialog itself has no padding, so a click that lands on it (not its content) is on the backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
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

      <p className="settings__foot">These reset when you leave the page. Nothing is stored.</p>
    </Modal>
  )
}
