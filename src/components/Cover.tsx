import { memo, useEffect, useId, useState, type ReactNode } from 'react'
import { coverFontsIn, coverFor, voiceFamily, voiceWeight, whenCoverFonts, type CoverDesign, type Mark } from '../viz/cover'

interface Props {
  name: string
  size?: number
  className?: string
}

function renderMarks(marks: Mark[], id: string): ReactNode {
  return marks.map((mark, i) => {
    if (mark.kind === 'rect') return <rect key={i} x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill={mark.fill} />
    if (mark.kind === 'clip') {
      const clip = `${id}c${i}`
      return (
        <g key={i}>
          <clipPath id={clip}>
            <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} />
          </clipPath>
          <g clipPath={`url(#${CSS.escape(clip)})`}>{renderMarks(mark.marks, clip)}</g>
        </g>
      )
    }
    return (
      <text
        key={i}
        x={mark.x}
        y={mark.y}
        fontSize={mark.size}
        fontFamily={voiceFamily(mark.voice)}
        fontWeight={voiceWeight(mark.voice)}
        fill={mark.fill}
        textLength={mark.fit}
        lengthAdjust={mark.fit ? 'spacing' : undefined}
        transform={mark.rotate ? `rotate(${mark.rotate} ${mark.x} ${mark.y})` : undefined}
      >
        {mark.text}
      </text>
    )
  })
}

/** A designed cover as an SVG */
export function CoverArt({ design, size = 48, className }: { design: CoverDesign; size?: number; className?: string }) {
  const id = useId()
  // The art fills the square as a pattern instead of being drawn on it directly. Type that runs past
  // the edge is cut off either way, but this way no part of a cover reports a box bigger than the
  // cover itself, which is what layout checks (like the phone cards' overflow test) go by.
  return (
    <svg className={className ? `cover ${className}` : 'cover'} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <pattern id={`${id}p`} width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill={design.paper} />
          {renderMarks(design.marks, id)}
        </pattern>
      </defs>
      <rect width="100" height="100" fill={`url(#${CSS.escape(id)}p)`} />
    </svg>
  )
}

/** The cover for an artist, song or album, worked out from its name (see viz/cover.ts) */
export const Cover = memo(function Cover({ name, size, className }: Props) {
  // A cover measured before its fonts arrived is the wrong fit, and nothing else would draw it again.
  // This goes by what was true for this render: they can land between here and the effect below.
  const [, setFontsIn] = useState(false)
  const measuredWithFonts = coverFontsIn()
  useEffect(() => {
    if (measuredWithFonts) return
    let live = true
    void whenCoverFonts().then(() => {
      if (live) setFontsIn(true)
    })
    return () => {
      live = false
    }
  }, [measuredWithFonts])
  return <CoverArt design={coverFor(name)} size={size} className={className} />
})
