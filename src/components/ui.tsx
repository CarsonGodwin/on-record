import { useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Offstage, OnStage } from '../lib/stage'

/** Small shared building blocks used across the dashboard. */

interface SegmentedProps<T> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** Long lists: drag with the mouse to scroll sideways (touch scrolls natively) */
  scrollable?: boolean
}

/** A row of toggle buttons where exactly one is selected */
export function Segmented<T>({ label, options, value, onChange, className, scrollable }: SegmentedProps<T>) {
  const classes = ['segmented', scrollable && 'segmented--scroll', className].filter(Boolean).join(' ')
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = e.currentTarget
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false }
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = ev.clientX - d.x
      if (!d.moved && Math.abs(dx) < 4) return
      d.moved = true
      el.scrollLeft = d.left - dx
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      // Leave `moved` set just long enough to swallow the click that follows a drag
      setTimeout(() => (drag.current = null), 50)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div
      className={classes}
      role="group"
      aria-label={label}
      onPointerDown={scrollable ? onPointerDown : undefined}
      onClickCapture={
        scrollable
          ? (e) => {
              if (drag.current?.moved) e.stopPropagation()
            }
          : undefined
      }
    >
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
  /** On a phone's card, a line that stands in for the lede: what to do here, in a few words */
  hint?: ReactNode
  /** Extra controls in the header */
  actions?: ReactNode
  /** If given, adds a "Show table" toggle that swaps the visual for this table */
  table?: () => ReactNode
  children: ReactNode
}

/** One section of the dashboard, styled like a track on a record */
export function Chapter({ id, num, title, lede, hint, actions, table, children }: ChapterProps) {
  const [showTable, setShowTable] = useState(false)
  // Offstage chapters stay mounted and laid out at full width, so they keep their state and show up ready
  const stage = useContext(OnStage)
  const offstage = stage !== null && stage !== id
  return (
    <section id={id} className={offstage ? 'chapter is-offstage' : 'chapter'} aria-labelledby={`${id}-title`} aria-hidden={offstage || undefined}>
      <header className="chapter__head">
        <span className="chapter__num" aria-hidden="true">
          {num}
        </span>
        <div className="chapter__titles">
          <h2 id={`${id}-title`}>{title}</h2>
          {lede && <p className="chapter__lede">{lede}</p>}
          {hint && <p className="chapter__hint">{hint}</p>}
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
      <Offstage value={offstage}>
        <div className="chapter__body">{showTable && table ? <div className="table-wrap">{table()}</div> : children}</div>
      </Offstage>
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
  // It lives at the body, so it has to leave with its chapter by itself (a pinned tip comes back when the chapter does)
  const offstage = useContext(Offstage)
  useEffect(() => {
    window.addEventListener('scroll', onDismiss, { passive: true, once: true })
    return () => window.removeEventListener('scroll', onDismiss)
  }, [onDismiss])
  if (offstage) return null
  const left = Math.max(130, Math.min(window.innerWidth - 130, x))
  const below = y < 140
  return createPortal(
    <div className={['float-tip', below && 'float-tip--below', className].filter(Boolean).join(' ')} style={{ left, top: y }} role="status">
      {children}
    </div>,
    document.body,
  )
}

interface GuideItem {
  /** Marks drawn in a 28×16 box, echoing the chart's own */
  glyph: ReactNode
  text: ReactNode
}

/**
 * How to read a chart, before you have to figure it out: a one-line takeaway
 * from your data, then a key that ties each kind of mark to what it means.
 */
export function ReadingGuide({ takeaway, items }: { takeaway?: ReactNode; items: GuideItem[] }) {
  return (
    <div className="guide">
      {takeaway && <p className="guide__takeaway">{takeaway}</p>}
      <ul className="guide__key" aria-label="How to read it">
        {items.map((item, i) => (
          <li key={i}>
            <svg className="guide__glyph" viewBox="0 0 28 16" width={28} height={16} aria-hidden="true">
              {item.glyph}
            </svg>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
