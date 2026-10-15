import { useRef, type PointerEvent } from 'react'
import type { Profile, Records } from '../data/insights'
import type { FunStats, Ranked, Summary } from '../data/stats'
import { formatDate, formatDuration, formatNumber, formatPercent, formatTime } from '../lib/format'
import { prefersReducedMotion } from '../lib/hooks'
import { SERIES } from '../lib/palette'

interface Props {
  profile: Profile
  fun: FunStats
  rec: Records
  summary: Summary
  devices: Ranked[]
  isAllTime: boolean
}

export function LinerNotes({ profile, fun, rec, summary, devices, isAllTime }: Props) {
  const podcastShare = summary.totalMs ? summary.podcastMs / summary.totalMs : 0

  const records: { label: string; value: string; detail: string }[] = []
  if (fun.longestStreak) {
    records.push({
      label: 'Longest streak',
      value: `${formatNumber(fun.longestStreak.days)} days`,
      detail: `${formatDate(fun.longestStreak.start)} to ${formatDate(fun.longestStreak.end)}, music every single day`,
    })
  }
  if (rec.marathon) {
    records.push({
      label: 'The marathon',
      value: formatDuration(rec.marathon.ms),
      detail: `Without a break, from ${formatTime(rec.marathon.start)} on ${formatDate(rec.marathon.start)}: ${formatNumber(rec.marathon.plays)} plays`,
    })
  }
  if (fun.biggestDay) {
    records.push({ label: 'Biggest day', value: formatDuration(fun.biggestDay.ms), detail: formatDate(fun.biggestDay.date) })
  }
  if (fun.onRepeat) {
    records.push({
      label: 'On repeat',
      value: `${fun.onRepeat.count}× in one day`,
      detail: `${fun.onRepeat.title} by ${fun.onRepeat.artist}, ${formatDate(fun.onRepeat.date)}`,
    })
  }
  if (rec.evergreen) {
    records.push({
      label: 'Evergreen',
      value: `${formatNumber(rec.evergreen.months)} months`,
      detail: `${rec.evergreen.title} by ${rec.evergreen.artist} kept coming back`,
    })
  }
  if (rec.firstPlay) {
    records.push({
      label: isAllTime ? 'Where it all began' : 'First song of the year',
      value: rec.firstPlay.title,
      detail: `${rec.firstPlay.artist}, ${formatDate(rec.firstPlay.date)}`,
    })
  }
  if (isAllTime && rec.forgotten) {
    records.push({
      label: 'Gone quiet',
      value: rec.forgotten.artist,
      detail: `${formatDuration(rec.forgotten.ms)} together, then nothing since ${formatDate(rec.forgotten.lastPlayed)}`,
    })
  }
  records.push({
    label: 'Average session',
    value: formatDuration(rec.avgSessionMs),
    detail: 'From pressing play to a 20-minute pause',
  })

  const habits = [
    { label: 'Songs skipped', value: summary.skipRate },
    { label: 'Shuffle on', value: summary.shuffleRate },
    { label: 'Offline listening', value: summary.offlineShare },
    { label: 'Podcasts', value: podcastShare },
  ]
  const deviceMax = Math.max(...devices.map((d) => d.ms), 1)

  return (
    <div className="liner">
      <ProfileCard profile={profile} />

      <div className="liner__notes">
        <dl className="records">
          {records.map((r) => (
            <div key={r.label} className="record">
              <dt>{r.label}</dt>
              <dd>
                <b>{r.value}</b>
                <span>{r.detail}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="liner__columns">
          <section>
            <h3 className="liner__heading">Habits</h3>
            <ul className="meters">
              {habits.map((h) => (
                <li key={h.label}>
                  <span>{h.label}</span>
                  <b>{formatPercent(h.value)}</b>
                  <i aria-hidden="true">
                    <i style={{ width: `${h.value * 100}%` }} />
                  </i>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="liner__heading">Where you listen</h3>
            <ul className="meters">
              {devices.map((d) => (
                <li key={d.key}>
                  <span>{d.label}</span>
                  <b>{formatPercent(d.ms / Math.max(summary.totalMs, 1))}</b>
                  <i aria-hidden="true">
                    <i style={{ width: `${(d.ms / deviceMax) * 100}%` }} />
                  </i>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

/** A collectible-card take on your listening habits. Tilts toward the pointer. */
function ProfileCard({ profile }: { profile: Profile }) {
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--rx', `${(0.5 - py) * 14}deg`)
    el.style.setProperty('--ry', `${(px - 0.5) * 18}deg`)
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
  }

  function onLeave() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div className="holo" ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="holo__inner">
        <span className="holo__kicker">Listener type</span>
        <h3 className="holo__title">{profile.title}</h3>
        <Radar profile={profile} />
        <ul className="holo__traits">
          {profile.traits.map((t) => (
            <li key={t.label}>
              <span className="holo__trait-name">
                {t.label} <b>{Math.round(t.value * 100)}</b>
              </span>
              <span className="holo__trait-detail">{t.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Radar({ profile }: { profile: Profile }) {
  const C = 130
  const R = 82
  const n = profile.traits.length
  const point = (i: number, f: number) => {
    const a = (i / n) * Math.PI * 2
    return [C + Math.sin(a) * R * f, C - Math.cos(a) * R * f]
  }
  const shape = profile.traits.map((t, i) => point(i, 0.08 + t.value * 0.92).join(',')).join(' ')

  return (
    <svg viewBox="0 0 260 260" className="radar" role="img" aria-label={profile.traits.map((t) => `${t.label} ${Math.round(t.value * 100)}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={profile.traits.map((_, i) => point(i, f).join(',')).join(' ')} className="radar__grid" />
      ))}
      {profile.traits.map((_, i) => {
        const [x, y] = point(i, 1)
        return <line key={i} x1={C} y1={C} x2={x} y2={y} className="radar__grid" />
      })}
      <polygon points={shape} fill={SERIES[0]} fillOpacity={0.28} stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" />
      {profile.traits.map((t, i) => {
        const [x, y] = point(i, 0.08 + t.value * 0.92)
        return <circle key={t.label} cx={x} cy={y} r={4} fill={SERIES[0]} stroke="#0b0a0f" strokeWidth={2} />
      })}
      {profile.traits.map((t, i) => {
        const [x, y] = point(i, 1.24)
        return (
          <text key={t.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar__label">
            {t.label}
          </text>
        )
      })}
    </svg>
  )
}
