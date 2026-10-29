import { useRef, useState } from 'react'
import { filesFromDrop } from '../lib/dropFiles'
import { COARSE } from '../lib/pointer'

interface Props {
  onFiles: (files: File[]) => void
}

/** The file drop target, dressed as a record sleeve. The record slides out when you hover or drag over it. */
export function DropZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  return (
    <div
      className={dragging ? 'sleeve is-dragging' : 'sleeve'}
      role="button"
      tabIndex={0}
      aria-label="Drop your Spotify or Apple Music data here, or press Enter to choose files"
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openPicker()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        filesFromDrop(e.dataTransfer).then((files) => {
          if (files.length > 0) onFiles(files)
        })
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.json,.csv"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = '' // so picking the same file again still fires onChange
          if (files.length > 0) onFiles(files)
        }}
      />
      <div className="sleeve__record" aria-hidden="true">
        <span className="sleeve__label" />
      </div>
      <div className="sleeve__cover">
        <p className="sleeve__title">
          {dragging ? (
            <>
              Drop it
              <br />
              <em>right here.</em>
            </>
          ) : (
            <>
              {/* Phones can't drag files, so there it's a tap */}
              {COARSE ? 'Add your' : 'Drop your'}{' '}
              <br className="sleeve__break" />
              music export
              <br />
              <em>here.</em>
            </>
          )}
        </p>
        <p className="sleeve__hint">
          The <code>.zip</code> from Spotify or Apple
          <span className="landing__more"> (every part, if Apple sent several), or the folder it unzips to</span>
          .
        </p>
        <span className="sleeve__cta" aria-hidden="true">
          <b>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
            </svg>
            Choose file
          </b>
          {!COARSE && <span>or drag it here</span>}
        </span>
      </div>
    </div>
  )
}
