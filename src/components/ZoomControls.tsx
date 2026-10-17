import { COARSE } from '../lib/pointer'
import type { PanZoom } from '../lib/zoom'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** − / + / reset buttons for a pan-zoom box, with a hint for the gestures */
export function ZoomControls({ zoom, className }: { zoom: PanZoom; className?: string }) {
  const { s } = zoom.view
  const zoomed = s > 1.01
  return (
    <div className={className ? `zoombar ${className}` : 'zoombar'} role="group" aria-label="Zoom">
      <button type="button" className="zoombar__button" aria-label="Zoom out" onClick={() => zoom.zoomBy(1 / 2)} disabled={!zoomed}>
        −
      </button>
      <span className="zoombar__level" aria-live="polite">
        {s < 10 ? s.toFixed(1) : Math.round(s)}×
      </span>
      <button type="button" className="zoombar__button" aria-label="Zoom in" onClick={() => zoom.zoomBy(2)} disabled={s >= zoom.max - 0.01}>
        +
      </button>
      {zoomed ? (
        <button type="button" className="zoombar__reset" onClick={zoom.reset}>
          Reset
        </button>
      ) : (
        <span className="zoombar__hint">{COARSE ? 'Pinch to zoom' : `Pinch or ${mac ? '⌘' : 'Ctrl'}-scroll to zoom`}</span>
      )}
    </div>
  )
}
