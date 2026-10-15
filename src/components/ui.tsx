import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Small shared building blocks used across the dashboard. */

interface SegmentedProps<T> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** A row of toggle buttons where exactly one is selected */
export function Segmented<T>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={className ? `segmented ${className}` : 'segmented'} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="segmented__option"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface ChapterProps {
  id: string
  /** Track number, e.g. "A1" */
  num: string
  title: string
  lede?: ReactNode
  /** Extra controls in the header */
  actions?: ReactNode
  /** If given, adds a "Show table" toggle that swaps the visual for this table */
  table?: () => ReactNode
  children: ReactNode
}

/** One section of the dashboard, styled like a track on a record */
export function Chapter({ id, num, title, lede, actions, table, children }: ChapterProps) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section id={id} className="chapter" aria-labelledby={`${id}-title`}>
      <header className="chapter__head">
        <span className="chapter__num" aria-hidden="true">
          {num}
        </span>
        <div className="chapter__titles">
          <h2 id={`${id}-title`}>{title}</h2>
          {lede && <p className="chapter__lede">{lede}</p>}
        </div>
        {(actions || table) && (
          <div className="chapter__actions">
            {actions}
            {table && (
              <button type="button" className="chip-button" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>
                {showTable ? 'Show visual' : 'Show table'}
              </button>
            )}
          </div>
        )}
      </header>
      {showTable && table ? <div className="table-wrap">{table()}</div> : children}
    </section>
  )
}

/** A divider between groups of chapters, like the sides of a record */
export function Side({ label, title }: { label: string; title: string }) {
  return (
    <div className="side" role="presentation">
      <span className="side__label">{label}</span>
      <span className="side__rule" />
      <span className="side__title">{title}</span>
    </div>
  )
}

interface TipProps {
  /** Pointer position in viewport coordinates */
  x: number
  y: number
  /** Called when the page scrolls, since a tapped tooltip would otherwise float away from its mark */
  onDismiss: () => void
  /** Extra class, e.g. `float-tip--fixed` for a tip whose content changes while hovering */
  className?: string
  children: ReactNode
}

/** A tooltip that follows the pointer. Rendered at the body so no container can clip it. */
export function FloatTip({ x, y, onDismiss, className, children }: TipProps) {
  useEffect(() => {
    window.addEventListener('scroll', onDismiss, { passive: true, once: true })
    return () => window.removeEventListener('scroll', onDismiss)
  }, [onDismiss])
  const left = Math.max(130, Math.min(window.innerWidth - 130, x))
  const below = y < 140
  return createPortal(
    <div className={['float-tip', below && 'float-tip--below', className].filter(Boolean).join(' ')} style={{ left, top: y }} role="status">
      {children}
    </div>,
    document.body,
  )
}
