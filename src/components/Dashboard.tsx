import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  artistGraph,
  artistSeries,
  binArtistTotals,
  dailyTotals,
  dayparts,
  findEras,
  firstListens,
  hourProfile,
  makeBins,
  raceFrames,
  records,
  sessions,
  songStats,
  takes,
} from '../data/insights'
import {
  canHide,
  filterByYear,
  filterPlays,
  funStats,
  getYears,
  newArtistsIn,
  platforms,
  sameFilter,
  summarize,
  topItems,
  UNMATCHED_ARTIST,
  wearOut,
  weekHourGrid,
} from '../data/stats'
import { formatHour, formatNumber, historyName } from '../lib/format'
import { useMediaQuery } from '../lib/hooks'
import { isLaunchKey, LAUNCH_KEY } from '../lib/keys'
import { COARSE } from '../lib/pointer'
import { assignColors, OTHER, TOP_ARTISTS } from '../lib/palette'
import { InCards, OnStage, resolveStop } from '../lib/stage'
import { closeTopmost, useCloseOnBack } from '../lib/back'
import { useSwipe } from '../lib/swipe'
import type { DataSource, LoadResult } from '../types'
import { layoutConstellation } from '../viz/constellation'
import { posterMoments, type PosterData, type PosterDesign } from '../viz/poster'
import { buildRecord, GROOVE, PODCAST } from '../viz/record'
import { Calendar } from './Calendar'
import { CardNav } from './CardNav'
import { Clock, ClockTable } from './Clock'
import { Constellation, ConstellationTable } from './Constellation'
import { Hero } from './Hero'
import { Launcher, type LauncherMode } from './Launcher'
import { LinerNotes } from './LinerNotes'
import { LoveHate, LoveHateTable } from './LoveHate'
import { SettingsPanel } from './Panels'
import { PosterStudio } from './PosterStudio'
import { Pulse } from './Pulse'
import { Race } from './Race'
import { River, RiverTable } from './River'
import { TopCharts } from './TopCharts'
import { Tour, UpNext } from './Tour'
import { TrackMenu, type Track } from './TrackMenu'
import { Chapter, Segmented, Side } from './ui'
import { Vinyl } from './Vinyl'

const TRACKS: Track[] = [
  { id: 'record', num: 'A1', title: 'The Record' },
  { id: 'eras', num: 'A2', title: 'Eras' },
  { id: 'race', num: 'A3', title: 'The Race' },
  { id: 'clock', num: 'B1', title: 'Around the Clock' },
  { id: 'days', num: 'B2', title: 'Every Day' },
  { id: 'lovehate', num: 'B3', title: 'Love / Hate' },
  { id: 'constellation', num: 'C1', title: 'Constellation' },
  { id: 'pulse', num: 'C2', title: 'Pulse' },
  { id: 'charts', num: 'C3', title: 'The Charts' },
  { id: 'notes', num: 'D1', title: 'Liner Notes' },
  { id: 'poster', num: 'D2', title: 'The Poster' },
]

const SIDES: Record<string, string> = { A: 'Time', B: 'Rhythm', C: 'Taste', D: 'Take it home' }

/**
 * A phone held upright gets the record as a deck of cards: one track fills the screen, nothing scrolls,
 * and you deal the next one with a swipe or the bar at the bottom. Turned sideways it's the page again.
 */
const CARDS = '(pointer: coarse) and (max-width: 699px) and (orientation: portrait)'

/** What a swipe can't start on: things you drag, and fields you type or slide in */
const OWN_GESTURES = '[data-drag], input, select, textarea, .day-panel, .table-wrap'

interface Props {
  result: LoadResult
  isSample: boolean
  onReset: () => void
}

export function Dashboard({ result, isSample, onReset }: Props) {
  // Music only and hidden artists come off before anything else, so every chart, color and poster leaves them out.
  // Neither is stored: they reset with the page, like everything else here.
  const [musicOnly, setMusicOnly] = useState(true)
  // Apple Music plays with no artist in the export would rank as one big unknown artist on the
  // charts and the poster, so they start hidden, as long as some other artist is left (see canHide).
  // They have their own name, so Spotify's tracks without an artist stay put.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() =>
    result.unmatchedArtists > 0 && result.plays.some((p) => p.kind === 'track' && p.artist !== UNMATCHED_ARTIST) ? new Set([UNMATCHED_ARTIST]) : new Set(),
  )
  const otherPlays = useMemo(() => result.plays.filter((p) => p.kind !== 'track').length, [result.plays])
  // Older Apple Music rows don't say whether shuffle was on
  const noShuffle = useMemo(() => result.plays.filter((p) => p.shuffle === null).length, [result.plays])
  const hasAnyMusic = otherPlays < result.plays.length
  const [launcher, setLauncher] = useState<LauncherMode | null>(null)
  // Settings opens from the launcher and goes back to it on close, like the launcher's own pages
  const [settingsOpen, setSettingsOpen] = useState(false)
  // A history with no music at all keeps its podcasts, or there would be nothing to show
  const chosen = useMemo(() => ({ musicOnly: musicOnly && hasAnyMusic, hidden }), [musicOnly, hasAnyMusic, hidden])
  /*
   * The charts follow `applied`, which catches up with `chosen` once the launcher and Settings are
   * closed and an "Updating" note has painted. Re-running every chart over a long history holds the
   * page for a moment, so it happens once when you're done choosing, not once per artist, and never
   * without saying so. `version` counts the changes that have reached the charts, for `viewKey`.
   */
  const [applied, setApplied] = useState({ filter: chosen, version: 0 })
  const choosing = launcher !== null || settingsOpen
  const updating = !choosing && !sameFilter(applied.filter, chosen)
  useEffect(() => {
    if (!updating) return
    let timer = 0
    // requestAnimationFrame runs just before the paint, so the timeout after it lands just after
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setApplied((a) => ({ filter: chosen, version: a.version + 1 })))
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [updating, chosen])
  const all = useMemo(() => filterPlays(result.plays, applied.filter), [result.plays, applied.filter])
  const years = useMemo(() => getYears(all), [all])
  const [pickedYear, setYear] = useState<number | null>(null)
  // Hiding an artist can empty a year; the page then falls back to all time
  const year = pickedYear !== null && years.includes(pickedYear) ? pickedYear : null
  const [posterDesign, setPosterDesign] = useState<PosterDesign>('deep')
  const [current, setCurrent] = useState<string | null>(null)
  // Where The Long Play is: the id of the stop on stage, or null when it's put away. An id, not an index,
  // so hiding artists or switching years mid-tour (which can shorten the record) doesn't strand it.
  const [tourAt, setTourAt] = useState<string | null>(null)
  const cards = useMediaQuery(CARDS)
  // The phone's deck can't be toured: it already is one card at a time
  const touring = !cards && tourAt !== null
  // The card on screen, by id for the same reason as the tour's stop
  const [cardAt, setCardAt] = useState(TRACKS[0].id)
  // Which way the last card was dealt, so the new one comes in from that side
  const [dealt, setDealt] = useState<'next' | 'prev'>('next')
  // Turning the phone upright again deals the card for the section you'd scrolled to on the page
  const [wasCards, setWasCards] = useState(cards)
  if (cards !== wasCards) {
    setWasCards(cards)
    if (cards && current !== null) setCardAt(current)
  }
  // Once a finger has scrubbed the record, its how-to stays hidden until new data comes in
  const [scrubLearned, setScrubLearned] = useState(false)
  const topbarRef = useRef<HTMLElement>(null)

  // Everything below is computed from `plays`, so the year filter scopes the whole page
  const plays = useMemo(() => filterByYear(all, year), [all, year])
  const summary = useMemo(() => summarize(plays), [plays])

  // Colors follow the artist: all-time top 10 keep their color when you pick a year
  const allTop = useMemo(() => topItems(all, 'artist', 'time', TOP_ARTISTS).map((r) => r.label), [all])
  const topArtists = useMemo(() => topItems(plays, 'artist', 'time', 16), [plays])
  const legend = useMemo(() => topArtists.slice(0, TOP_ARTISTS).map((r) => r.label), [topArtists])
  const colors = useMemo(() => assignColors(legend, allTop), [legend, allTop])

  const bins = useMemo(() => makeBins(plays, year), [plays, year])
  const totals = useMemo(() => binArtistTotals(plays, bins), [plays, bins])
  const eras = useMemo(() => findEras(totals, bins.size), [totals, bins])
  const race = useMemo(() => raceFrames(totals, 10), [totals])

  const hours = useMemo(() => hourProfile(plays), [plays])
  const parts = useMemo(() => dayparts(plays), [plays])
  const grid = useMemo(() => weekHourGrid(plays), [plays])
  const days = useMemo(() => dailyTotals(plays), [plays])
  const songs = useMemo(() => songStats(plays, 250), [plays])
  const graph = useMemo(() => artistGraph(plays, 36, 3), [plays])

  const firstHeard = useMemo(() => firstListens(all), [all])
  // Every music artist, most-listened first, ranked once. The launcher's lists split it by what's hidden,
  // which stays quick with thousands of artists.
  const musicArtists = useMemo(() => topItems(result.plays, 'artist', 'time', Infinity), [result.plays])
  const hiddenPlays = useMemo(
    () => (applied.filter.hidden.size === 0 ? 0 : result.plays.filter((p) => p.kind === 'track' && applied.filter.hidden.has(p.artist)).length),
    [result.plays, applied.filter.hidden],
  )
  const pulseArtists = useMemo(
    () =>
      topArtists
        .map((r) => r.label)
        .sort((a, b) => (firstHeard.get(a) ?? 0) - (firstHeard.get(b) ?? 0)),
    [topArtists, firstHeard],
  )
  // On the page every ridge gets its own color, so only the colored top 10 make the cut
  const pulseLines = useMemo(() => pulseArtists.filter((a) => colors.has(a)), [pulseArtists, colors])

  const sessionList = useMemo(() => sessions(plays), [plays])
  const rec = useMemo(() => records(plays, sessionList), [plays, sessionList])
  const fun = useMemo(() => funStats(plays), [plays])
  const lines = useMemo(() => takes(plays, summary, rec, fun, hours, year === null), [plays, summary, rec, fun, hours, year])
  const devices = useMemo(() => platforms(plays), [plays])
  const wear = useMemo(() => wearOut(all, year), [all, year])
  const newArtists = useMemo(() => (year === null ? null : newArtistsIn(all, year)), [all, year])

  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0])
  const hasMusic = summary.musicMs > 0
  const peak = hours.reduce((best, h) => (h.ms > best.ms ? h : best), hours[0])

  // The record and the poster draw from the same model
  const record = useMemo(() => buildRecord(plays, legend, year), [plays, legend, year])
  const slotColors = useMemo(
    () => [...Array.from({ length: TOP_ARTISTS }, (_, i) => colors.get(legend[i]) ?? OTHER), GROOVE, PODCAST],
    [colors, legend],
  )
  /*
   * Charts that hold on to a groove, a pinned song or ridge, a hovered week or a finished video start
   * over whenever their data is worked out again: a new year, or a filter change reaching the charts
   * (hiding an artist can shift the days, the songs and the racers). One key for all of them can't
   * miss an input the way a key per chart, listing what its state points into, can.
   */
  const viewKey = `${year ?? 'all'}|${applied.version}`
  const recordTitle = year === null ? 'ALL TIME' : String(year)
  const recordSubtitle = `${formatNumber(summary.totalMs / 3_600_000)} HRS  ·  ${formatNumber(summary.artists)} ARTISTS`

  const posterData = useMemo<PosterData>(
    () => ({
      period: year === null ? span : String(year),
      subtitle: year === null ? `every day, ${span}` : `every day of ${year}`,
      record,
      recordColors: slotColors,
      recordTitle,
      tracklist: topArtists.slice(0, TOP_ARTISTS).map((r) => ({ name: r.label, color: colors.get(r.label) ?? OTHER, ms: r.ms })),
      graph: { ...graph, layout: layoutConstellation(graph.nodes, graph.links) },
      colors,
      pulse: { artists: pulseArtists, series: artistSeries(totals, pulseArtists, bins.size === 'month' ? 1 : 2) },
      stats: { hours: summary.totalMs / 3_600_000, streams: summary.streams, artists: summary.artists, songs: summary.tracks, peak: formatHour(peak.hour) },
      wearOut: wear,
      moments: posterMoments(record, fun, rec),
      source: historyName(result.sources),
    }),
    [year, span, record, slotColors, recordTitle, topArtists, colors, graph, pulseArtists, totals, bins, summary, wear, peak, fun, rec, result.sources],
  )

  /*
   * The Long Play walks through the page itself, one chapter on stage at a
   * time, so every chart is the real one. A period with no music gets the
   * shorter record of what it can still draw.
   */
  const tourTracks = hasMusic ? TRACKS : TRACKS.filter((t) => t.id === 'charts' || t.id === 'notes' || t.id === 'poster')
  const tourStops = tourTracks.map((t) => t.id)
  const tourStep = !touring || tourAt === null ? null : resolveStop(tourStops, tourAt, TRACKS.map((t) => t.id))
  const setTourStep = (step: number | null) => setTourAt(step === null ? null : (tourStops[step] ?? null))
  const cardStep = resolveStop(tourStops, cardAt, TRACKS.map((t) => t.id))
  const setCardStep = (step: number) => {
    const id = tourStops[Math.max(0, Math.min(tourStops.length - 1, step))]
    setDealt(step < cardStep ? 'prev' : 'next')
    setCardAt(id)
  }
  const onStage = cards ? tourStops[cardStep] : tourStep === null ? null : tourStops[tourStep]
  const tourTopRef = useRef<HTMLDivElement>(null)

  /*
   * The tour gets its own history entry, so the back gesture (an edge swipe on
   * iPhone, the back button on Android) puts it away instead of leaving the site.
   * The entry carries a token for this opening, since history.state outlives a
   * reload and a stale entry must not count as the tour's.
   * Opened by a tap, phones that allow it also go fullscreen (the browser only
   * grants that from a gesture); iPhone Safari doesn't, so there the tour just
   * fills the window. Leaving fullscreen, as Escape or Android's back does, ends it.
   */
  const tourEntry = useRef<string | null>(null)
  const tourFullscreen = useRef(false)
  // history.back() lands later, so an entry pushed before it would be the one it pops: a reopen waits for it
  const backPending = useRef(false)

  function openTour(fromGesture: boolean) {
    tourEntry.current = `${Date.now()}-${Math.random()}`
    if (!backPending.current) history.pushState({ longPlay: tourEntry.current }, '')
    setTourAt(tourStops[0])
    const root = document.documentElement
    if (fromGesture && COARSE && document.fullscreenEnabled && !document.fullscreenElement) {
      root
        .requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => (tourFullscreen.current = true))
        .catch(() => {})
    }
  }

  // Where the page lands when the tour is put away: the chapter you were on, or the top once you've seen it all
  const lastStop = useRef<string | null>(null)
  const landAtTop = useRef(false)

  function closeTour(finished = false) {
    landAtTop.current = finished
    setTourAt(null)
    tourFullscreen.current = false
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    const ours = tourEntry.current !== null && history.state?.longPlay === tourEntry.current
    tourEntry.current = null
    if (ours) {
      backPending.current = true
      history.back()
    }
  }

  useLayoutEffect(() => {
    if (onStage !== null) {
      lastStop.current = onStage
      return
    }
    const id = lastStop.current
    if (id === null) return
    lastStop.current = null
    const target = landAtTop.current ? null : document.getElementById(id)
    landAtTop.current = false
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
    else window.scrollTo({ top: 0, behavior: 'instant' })
    // The top bar names where you landed; the tour's last stop could otherwise linger there
    setCurrent(target ? id : null)
  }, [onStage])

  useEffect(() => {
    // Going back to where the tour was opened shouldn't scroll the page anywhere
    const restoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const onPop = () => {
      if (backPending.current) {
        // Our own back from closing the tour; if it was reopened meanwhile, its entry goes on now
        backPending.current = false
        if (tourEntry.current !== null) history.pushState({ longPlay: tourEntry.current }, '')
        return
      }
      if (tourEntry.current !== null && history.state?.longPlay === tourEntry.current) return
      tourEntry.current = null
      tourFullscreen.current = false
      setTourAt(null)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
    const onFullscreen = () => {
      if (!document.fullscreenElement && tourFullscreen.current) closeTour()
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      history.scrollRestoration = restoration
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [])

  // The deck owns the screen: the page behind it doesn't scroll or bounce. A layout effect, so that turning
  // the phone sideways frees the page before it scrolls to the track you were on (see the effect on onStage).
  useLayoutEffect(() => {
    if (!cards) return
    const root = document.documentElement
    root.classList.add('cards-open')
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => root.classList.remove('cards-open')
  }, [cards])

  /*
   * Leaving the page loses the export (nothing is kept), so on the deck the back gesture
   * (an edge swipe on iPhone, the back button on Android) steps back a card instead, and
   * from the first card goes back to the start page rather than off the site.
   */
  const backTo = useRef({ stops: tourStops, step: cardStep, onReset })
  useLayoutEffect(() => {
    backTo.current = { stops: tourStops, step: cardStep, onReset }
  })
  useEffect(() => {
    if (!cards) return
    // One entry for the deck, however often the phone turns back to it
    if (!history.state?.onRecordCards) history.pushState({ onRecordCards: true }, '')
    const onPop = () => {
      // Something open over the card closes first, and the deck keeps its entry
      if (closeTopmost()) return history.pushState({ onRecordCards: true }, '')
      const { stops, step, onReset: reset } = backTo.current
      if (step === 0) return reset()
      history.pushState({ onRecordCards: true }, '')
      setDealt('prev')
      setCardAt(stops[step - 1])
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [cards])

  useCloseOnBack(launcher !== null, () => setLauncher(null))
  useCloseOnBack(settingsOpen, () => setSettingsOpen(false))

  // Arrow keys deal cards too, except where a slider or the day details want them
  useEffect(() => {
    if (!cards) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as Element).closest?.(OWN_GESTURES)) return
      if (e.key === 'ArrowRight') setCardStep(cardStep + 1)
      else if (e.key === 'ArrowLeft') setCardStep(cardStep - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // A quick sideways swipe on a card deals the next one; drags on things that move stay theirs
  const swipe = useSwipe((dir) => setCardStep(cardStep + dir), OWN_GESTURES)
  const swipeHandlers = cards ? swipe : {}

  /** Jumps to the poster studio with a design picked (on the tour, its last stop) */
  function makePoster(design: PosterDesign) {
    setPosterDesign(design)
    if (cards) setCardAt('poster')
    else if (touring) setTourStep(tourStops.indexOf('poster'))
    else document.getElementById('poster')?.scrollIntoView({ behavior: 'smooth' })
  }

  /** Hides artists everywhere, but always leaves at least one (see canHide) */
  function hideArtists(artists: string[]): boolean {
    if (!canHide(musicArtists, hidden, artists)) return false
    setHidden((prev) => new Set([...prev, ...artists]))
    return true
  }

  function unhideArtists(artists: string[]) {
    setHidden((prev) => {
      const next = new Set(prev)
      for (const a of artists) next.delete(a)
      return next
    })
  }

  /** From the launcher: on the tour, its stop for that chapter; otherwise a scroll */
  function jumpTo(id: string) {
    setLauncher(null)
    if (cards) return setCardStep(resolveStop(tourStops, id, TRACKS.map((t) => t.id)))
    if (touring) {
      const stop = tourStops.indexOf(id)
      if (stop >= 0) return setTourStep(stop)
      // The shorter tour skips that chapter: put the tour away, and the page lands on it
      lastStop.current = id
      return closeTour()
    }
    // After the dialog closes and hands focus back, so that doesn't pull the page anywhere
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function pickYear(y: number | null) {
    setYear(y)
    setLauncher(null)
  }

  /** Back to the landing page, putting the tour away first so its history entry and fullscreen go with it */
  function clearData() {
    setLauncher(null)
    if (touring) closeTour()
    onReset()
  }

  function openSettings() {
    setLauncher(null)
    setSettingsOpen(true)
  }

  // ⌘K (Ctrl K) opens the launcher from anywhere, the tour included, and closes it again
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isLaunchKey(e)) return
      e.preventDefault()
      setSettingsOpen(false)
      setLauncher((open) => (open ? null : 'root'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sticky things and jump targets sit just under the top bar, whose height changes with the screen.
  // While the tour is up, its bar stands in for the page's.
  useEffect(() => {
    const bar = touring ? tourTopRef.current : topbarRef.current
    if (!bar) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty('--topbar-h', `${bar.getBoundingClientRect().height}px`))
    observer.observe(bar)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--topbar-h')
    }
  }, [touring])

  // Light up the current track in the side nav
  useEffect(() => {
    if (cards) return
    const sections = TRACKS.map((t) => document.getElementById(t.id)).filter((el): el is HTMLElement => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id)
      },
      { rootMargin: '-35% 0px -60% 0px' },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [hasMusic, cards])

  return (
    <div className={['dash', touring && 'is-touring', cards && 'is-cards', updating && 'is-updating'].filter(Boolean).join(' ')}>
      <header className="topbar" ref={topbarRef}>
        <a
          className="brand"
          href="#top"
          aria-label={cards ? 'My Listening Record, back to the first track' : 'My Listening Record, back to the top'}
          onClick={(e) => {
            if (!cards) return
            e.preventDefault()
            setCardStep(0)
          }}
        >
          <span className="brand__name">My Listening Record</span>
          <span className="brand__dot" aria-hidden="true" />
        </a>
        {/* Phones get a tracklist menu (with Poster and New data in it) and a dropdown for the year instead */}
        {!cards && <TrackMenu tracks={TRACKS} sides={SIDES} current={current} onPoster={() => makePoster(posterDesign)} onReset={onReset} />}
        <Segmented
          className="topbar__years"
          label="Time period"
          value={year}
          onChange={setYear}
          options={[{ value: null, label: 'All time' }, ...years.map((y) => ({ value: y, label: String(y) }))]}
        />
        <select
          className="topbar__select"
          aria-label="Time period"
          value={year === null ? 'all' : String(year)}
          onChange={(e) => setYear(e.target.value === 'all' ? null : Number(e.target.value))}
        >
          <option value="all">All time</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="topbar__launch"
          aria-label={hidden.size > 0 ? `Open the launcher (${hidden.size} artist${hidden.size === 1 ? '' : 's'} hidden)` : 'Open the launcher'}
          onClick={() => setLauncher('root')}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <kbd>{LAUNCH_KEY}</kbd>
          {hidden.size > 0 && <span className="topbar__launch-dot" aria-hidden="true" />}
        </button>
        <div className="topbar__actions">
          <button type="button" className="button button--small" onClick={() => makePoster(posterDesign)}>
            Poster
          </button>
          <button type="button" className="button button--ghost button--small" onClick={onReset}>
            New data
          </button>
        </div>
      </header>

      <nav className="tracklist" aria-label="Sections">
        <ol>
          {TRACKS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} aria-current={current === t.id ? 'true' : undefined}>
                <span>{t.num}</span>
                {t.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <InCards value={cards}>
        <OnStage value={onStage}>
          {/* Turning a phone swaps the deck and the page, which lay their charts out differently: start them over */}
          <main key={cards ? 'cards' : 'page'} className="dash__main" data-dealt={cards ? dealt : undefined} {...swipeHandlers}>
            {!cards && (
              <Hero
                summary={summary}
                year={year}
                span={span}
                isSample={isSample}
                topArtist={topArtists[0]}
                hours={hours}
                newArtists={newArtists}
                onPlay={() => openTour(true)}
                onPoster={() => makePoster(posterDesign)}
              />
            )}

            {!hasMusic && <p className="empty">There’s no music in this period, only podcasts. Most of the visuals below need songs.</p>}

            <Side label="Side A" title={SIDES.A} />

            <Chapter id="record" num="A1" title="The Record" hint={`${formatNumber(summary.totalMs / 3_600_000)} hours, a ring for every day. Drag the needle, pinch to zoom.`} lede="Every day you listened, pressed into vinyl. Each groove represents a day, one arc per song, placed by the time it played.">
              <Vinyl
                key={viewKey}
                plays={plays}
                model={record}
                slotColors={slotColors}
                legend={legend}
                title={recordTitle}
                subtitle={recordSubtitle}
                onPoster={() => makePoster('record')}
                learned={scrubLearned}
                onLearned={() => setScrubLearned(true)}
              />
            </Chapter>

            <Chapter
              id="eras"
              num="A2"
              title="Eras"
              hint="Who ruled your listening, and when."
              lede="Who ruled your listening, and when."
              table={() => <RiverTable bins={bins} totals={totals} artists={legend} />}
            >
              {hasMusic ? <River key={viewKey} bins={bins} totals={totals} eras={eras} artists={legend} colors={colors} /> : <NotEnough />}
            </Chapter>

            <Chapter
              id="race"
              num="A3"
              title="The Race"
              hint={`Hours per artist, raced ${bins.size} by ${bins.size}.`}
              lede={`Total hours per artist, replayed ${bins.size} by ${bins.size}. Watch who pulls ahead.`}
            >
              {race.names.length > 1 ? <Race key={viewKey} bins={bins} race={race} colors={colors} /> : <NotEnough />}
            </Chapter>

            <Side label="Side B" title={SIDES.B} />

            <Chapter
              id="clock"
              num="B1"
              title="Around the Clock"
              hint="Drag across the clock or the dots to read any hour."
              lede="When the music happens, and who you reach for at each hour. Midnight is at the top."
              table={() => <ClockTable hours={hours} />}
            >
              <Clock hours={hours} parts={parts} grid={grid} plays={plays} />
            </Chapter>

            <Chapter id="days" num="B2" title="Every Day" hint="Tap a day to see everything you played." lede="A square for every day. The brighter it glows, the longer you listened. Tap a day to see what you played.">
              <Calendar days={days} years={year === null ? years : [year]} plays={plays} firstHeard={firstHeard} colors={colors} />
            </Chapter>

            <Chapter
              id="lovehate"
              num="B3"
              title="Love / Hate"
              hint="The song you let play, and the one you skip."
              lede={`The song you let play the most against the one you skip the most. Then your ${formatNumber(songs.length)} most-played songs: how often you start them (across) and how often you bail (up).`}
              table={() => <LoveHateTable songs={songs} />}
            >
              {songs.length >= 5 ? <LoveHate key={viewKey} songs={songs} skipRate={summary.skipRate} plays={plays} /> : <NotEnough />}
            </Chapter>

            <Side label="Side C" title={SIDES.C} />

            <Chapter
              id="constellation"
              num="C1"
              title="Constellation"
              hint="Artists you play back to back, joined up. Tap a star, pinch to zoom."
              lede="Your top artists as stars, joined when you play one straight after the other. Clusters are your scenes."
              table={() => <ConstellationTable links={graph.links} />}
            >
              {graph.nodes.length >= 3 ? <Constellation nodes={graph.nodes} links={graph.links} colors={colors} /> : <NotEnough />}
            </Chapter>

            <Chapter
              id="pulse"
              num="C2"
              title="Pulse"
              hint="Your top artists over time, one line each. Tap a line."
              lede="Your top artists over time, one line each."
            >
              {pulseLines.length >= 2 ? (
                <Pulse
                  key={viewKey}
                  bins={bins}
                  totals={totals}
                  artists={pulseLines}
                  firstHeard={firstHeard}
                  colors={colors}
                />
              ) : (
                <NotEnough />
              )}
            </Chapter>

            <Chapter id="charts" num="C3" title="The Charts" hint="Your rankings." lede="The rankings. Every cover is generated from the name, since nothing is fetched from anywhere.">
              <TopCharts plays={plays} onHide={(artist) => hideArtists([artist])} hidden={hidden} onManage={() => setLauncher('artists')} />
            </Chapter>

            <Side label="Side D" title={SIDES.D} />

            <Chapter id="notes" num="D1" title="Liner Notes" hint="The small print: what you’d never have guessed." lede="The back of the sleeve: who played on this record, and how well you know your own habits.">
              <LinerNotes
                takes={lines}
                fun={fun}
                rec={rec}
                summary={summary}
                devices={devices}
                topArtists={topArtists}
                hours={hours}
                wear={wear}
                period={year === null ? span : String(year)}
                isAllTime={year === null}
              />
            </Chapter>

            <Chapter
              id="poster"
              num="D2"
              title="The Poster"
              hint="Touch and hold the poster to save it."
              lede="Take it home. Pick a design, a size and a background, then download it or send it straight from your phone."
            >
              <PosterStudio data={posterData} design={posterDesign} onDesign={setPosterDesign} />
            </Chapter>

            {tourStep !== null && <UpNext tracks={tourTracks} sides={SIDES} step={tourStep} onStep={setTourStep} onFinish={() => closeTour(true)} />}

            {!cards && (
              <footer className="dash__footer">
                <p>
                  <strong>Pressed locally.</strong> Everything on this page was worked out inside this browser tab. Nothing was uploaded.
                </p>
                <details className="load-details">
                  <summary>Load details</summary>
                  <ul>
                    {result.sources.includes('apple') && (
                      <li>
                        Apple Music support is in beta. If something looks wrong,{' '}
                        <a href="https://github.com/CarsonGodwin/on-record/issues" target="_blank" rel="noreferrer">
                          report it on GitHub
                        </a>{' '}
                        with these details.
                      </li>
                    )}
                    <li>
                      {result.filesRead.length} file{result.filesRead.length === 1 ? '' : 's'} read: {result.filesRead.join(', ')}
                    </li>
                    <li>
                      {formatNumber(result.skippedRows)} rows without track info ignored ({skippedRowsHint(result.sources)})
                    </li>
                    {applied.filter.musicOnly && otherPlays > 0 && <li>{formatNumber(otherPlays)} podcast and audiobook plays left out (Music only)</li>}
                    {applied.filter.hidden.size > 0 && (
                      <li>
                        {formatNumber(hiddenPlays)} plays by {applied.filter.hidden.size} hidden artist{applied.filter.hidden.size === 1 ? '' : 's'} left out
                      </li>
                    )}
                    {result.duplicateRows > 0 && <li>{formatNumber(result.duplicateRows)} duplicate rows ignored</li>}
                    {result.unmatchedArtists > 0 && (
                      <li>
                        {formatNumber(result.unmatchedArtists)} Apple Music plays had no artist anywhere in the export.{' '}
                        {applied.filter.hidden.has(UNMATCHED_ARTIST)
                          ? `They’re hidden as “${UNMATCHED_ARTIST}”, and Hide Artists… shows them again.`
                          : `They show as “${UNMATCHED_ARTIST}”.`}
                      </li>
                    )}
                    {noShuffle > 0 && (
                      <li>{formatNumber(noShuffle)} Apple Music plays don’t say whether shuffle was on, so shuffle stats leave them out</li>
                    )}
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
                <p className="colophon">
                  My Listening Record is open source.{' '}
                  <a href="https://github.com/CarsonGodwin/on-record" target="_blank" rel="noreferrer">
                    Star it, report a bug or support it on GitHub
                  </a>
                  .
                </p>
                <p className="disclaimer">
                  My Listening Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB or Apple Inc.
                  Spotify is a trademark of Spotify AB. Apple Music is a trademark of Apple Inc.
                </p>
              </footer>
            )}
          </main>
        </OnStage>
      </InCards>

      {cards && (
        <CardNav
          tracks={TRACKS}
          sides={SIDES}
          deck={tourTracks}
          step={cardStep}
          onStep={setCardStep}
          onJump={jumpTo}
          onPoster={() => makePoster(posterDesign)}
          onReset={onReset}
        />
      )}

      <Launcher
        mode={launcher}
        onMode={setLauncher}
        tracks={TRACKS}
        sides={SIDES}
        years={years}
        year={year}
        musicOnly={chosen.musicOnly}
        artists={musicArtists}
        hidden={hidden}
        onJump={jumpTo}
        onYear={pickYear}
        onHide={hideArtists}
        onUnhide={unhideArtists}
        onSettings={openSettings}
        onReset={clearData}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
          setLauncher('root')
        }}
        onGone={() => setSettingsOpen(false)}
        musicOnly={musicOnly}
        onMusicOnly={setMusicOnly}
        otherPlays={otherPlays}
        hasAnyMusic={hasAnyMusic}
      />
      {/* Paints before the charts are worked out again, so the moment that takes doesn't look like a hang */}
      <p className="dash__updating" role="status">
        {updating ? 'Updating the charts…' : ''}
      </p>

      {tourStep !== null && (
        <Tour
          tracks={tourTracks}
          sides={SIDES}
          step={tourStep}
          onStep={setTourStep}
          onClose={() => closeTour()}
          topRef={tourTopRef}
        />
      )}
    </div>
  )
}

function NotEnough() {
  return <p className="empty">Not enough music in this period to draw this one.</p>
}

/** What usually leaves a row without track info, for the load details */
function skippedRowsHint(sources: DataSource[]): string {
  if (sources.includes('apple')) return sources.includes('spotify') ? 'usually local files on Spotify, radio on Apple Music' : 'usually radio'
  return 'usually local files'
}
