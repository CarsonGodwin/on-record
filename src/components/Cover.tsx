import { useId, type ReactNode } from 'react'
import { hashString, mulberry32 } from '../lib/random'

/*
 * Generative "cover art". The export has no artwork and this app never calls
 * out to fetch any, so every artist, song and album gets a cover drawn from a
 * hash of its name: same name, same cover, every time.
 */

const INKS = ['#ff277c', '#0ca2bc', '#e86104', '#0ba985', '#a053fd', '#b68901', '#3778f5', '#58a805', '#ffd23d', '#f4f1ea']
const GROUNDS = ['#16131c', '#1d1030', '#0d1f24', '#2a0f1c', '#f4f1ea', '#1a1a10', '#101a33']

interface Props {
  name: string
  size?: number
  className?: string
}

export function Cover({ name, size = 48, className }: Props) {
  const id = useId()
  const rand = mulberry32(hashString(name))
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]

  const ground = pick(GROUNDS)
  const inkA = pick(INKS)
  let inkB = pick(INKS)
  if (inkB === inkA) inkB = INKS[(INKS.indexOf(inkA) + 3) % INKS.length]
  const style = Math.floor(rand() * 7)

  let art: ReactNode
  switch (style) {
    case 0: {
      // Sunset: a sun sinking behind horizontal slats
      const cy = 45 + rand() * 25
      art = (
        <>
          <rect width="100" height="100" fill={`url(#${CSS.escape(id)}g)`} />
          <circle cx="50" cy={cy} r={26 + rand() * 10} fill={inkB} />
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x="0" y={cy + 2 + i * 6} width="100" height={1.5 + i * 0.9} fill={ground} />
          ))}
          <rect x="0" y={cy + 38} width="100" height="40" fill={ground} />
        </>
      )
      break
    }
    case 1: {
      // Target rings
      const rings = 4 + Math.floor(rand() * 5)
      const cx = 30 + rand() * 40
      const cy = 30 + rand() * 40
      art = Array.from({ length: rings }, (_, i) => (
        <circle key={i} cx={cx} cy={cy} r={(rings - i) * (78 / rings)} fill={i % 2 ? ground : i % 4 === 0 ? inkA : inkB} />
      ))
      break
    }
    case 2: {
      // Halftone dot grid
      const n = 5 + Math.floor(rand() * 4)
      const step = 100 / n
      const angle = rand() * Math.PI * 2
      art = Array.from({ length: n * n }, (_, k) => {
        const x = (k % n) + 0.5
        const y = Math.floor(k / n) + 0.5
        const t = (Math.sin(x * Math.cos(angle) + y * Math.sin(angle)) + 1) / 2
        return <circle key={k} cx={x * step} cy={y * step} r={step * (0.12 + t * 0.38)} fill={t > 0.5 ? inkA : inkB} />
      })
      break
    }
    case 3: {
      // Diagonal bands
      const bands = 3 + Math.floor(rand() * 4)
      art = (
        <g transform={`rotate(${rand() > 0.5 ? 45 : -45} 50 50)`}>
          {Array.from({ length: bands * 2 }, (_, i) => (
            <rect key={i} x={-50 + i * (200 / (bands * 2))} y="-50" width={100 / (bands * 2)} height="200" fill={i % 2 ? inkA : ground} />
          ))}
          <circle cx="50" cy="50" r={14 + rand() * 12} fill={inkB} />
        </g>
      )
      break
    }
    case 4: {
      // Bauhaus quarter circles
      art = Array.from({ length: 4 }, (_, k) => {
        const x = (k % 2) * 50
        const y = Math.floor(k / 2) * 50
        const corner = Math.floor(rand() * 4)
        const cx = x + (corner % 2) * 50
        const cy = y + Math.floor(corner / 2) * 50
        return (
          <g key={k}>
            <rect x={x} y={y} width="50" height="50" fill={k % 3 === 0 ? inkB : ground} />
            <clipPath id={`${id}c${k}`}>
              <rect x={x} y={y} width="50" height="50" />
            </clipPath>
            <circle cx={cx} cy={cy} r="50" fill={k % 3 === 0 ? ground : inkA} clipPath={`url(#${CSS.escape(`${id}c${k}`)})`} />
          </g>
        )
      })
      break
    }
    case 5: {
      // Stacked waves
      const lines = 7 + Math.floor(rand() * 6)
      const freq = 1 + rand() * 3
      const amp = 4 + rand() * 8
      art = Array.from({ length: lines }, (_, i) => {
        const y = 8 + i * (86 / lines)
        const d = Array.from({ length: 21 }, (_, k) => {
          const x = k * 5
          const yy = y + Math.sin((x / 100) * Math.PI * 2 * freq + i * 0.6) * amp * Math.sin((x / 100) * Math.PI)
          return `${k ? 'L' : 'M'}${x},${yy.toFixed(1)}`
        }).join('')
        return <path key={i} d={d} fill="none" stroke={i % 3 === 0 ? inkB : inkA} strokeWidth={2.2} strokeLinecap="round" />
      })
      break
    }
    default: {
      // A giant cropped initial
      const letter = (name.replace(/^the\s+/i, '').trim()[0] ?? '?').toUpperCase()
      art = (
        <>
          <rect width="100" height="100" fill={`url(#${CSS.escape(id)}g)`} />
          <text
            x={20 + rand() * 30}
            y={92 + rand() * 20}
            fontSize={110 + rand() * 40}
            fontFamily="'Bricolage Grotesque Variable', sans-serif"
            fontWeight={800}
            fill={inkB}
            textAnchor="middle"
          >
            {letter}
          </text>
        </>
      )
    }
  }

  // The art fills the square as a pattern instead of being drawn on it directly. Shapes that run past
  // the edge are cut off either way, but this way no part of a cover reports a box bigger than the
  // cover itself, which is what layout checks (like the phone cards' overflow test) go by.
  return (
    <svg className={className ? `cover ${className}` : 'cover'} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={inkA} />
          <stop offset="1" stopColor={ground} />
        </linearGradient>
        <pattern id={`${id}p`} width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill={ground} />
          {art}
        </pattern>
      </defs>
      <rect width="100" height="100" fill={`url(#${CSS.escape(id)}p)`} />
    </svg>
  )
}
