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
import { filterByYear, funStats, getYears, newArtistsIn, platforms, summarize, topItems, wearOut, weekHourGrid } from '../data/stats'
import { formatHour, formatNumber } from '../lib/format'
import { COARSE, PHONE } from '../lib/pointer'
import { assignColors, OTHER, TOP_ARTISTS } from '../lib/palette'
import { OnStage } from '../lib/stage'
import type { LoadResult } from '../types'
import { layoutConstellation } from '../viz/constellation'
import { posterMoments, type PosterData, type PosterDesign } from '../viz/poster'
import { buildRecord, GROOVE, PODCAST } from '../viz/record'
import { Calendar } from './Calendar'
import { Clock, ClockTable } from './Clock'
import { Constellation, ConstellationTable } from './Constellation'
import { Hero } from './Hero'
import { LinerNotes } from './LinerNotes'
import { LoveHate, LoveHateTable } from './LoveHate'
import { NeedleDrop } from './NeedleDrop'
import { PosterStudio } from './PosterStudio'
import { Pulse } from './Pulse'
import { Race } from './Race'
import { River, RiverTable } from './River'
import { TopCharts } from './TopCharts'
import { INTRO, Tour, UpNext } from './Tour'
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

interface Props {
  result: LoadResult
  isSample: boolean
  onReset: () => void
}

export function Dashboard({ result, isSample, onReset }: Props) {
  const all = result.plays
  const years = useMemo(() => getYears(all), [all])
  const [year, setYear] = useState<number | null>(null)
  const [posterDesign, setPosterDesign] = useState<PosterDesign>('deep')
  const [current, setCurrent] = useState<string | null>(null)
  // Where The Long Play is: an index into the needle drop and the tracks, or null when it's put away
  const [tourStep, setTourStep] = useState<number | null>(null)
  const touring = tourStep !== null
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
    }),
    [year, span, record, slotColors, recordTitle, topArtists, colors, graph, pulseArtists, totals, bins, summary, wear, peak, fun, rec],
  )

  /*
   * The Long Play walks through the page itself, one chapter on stage at a
   * time, so every chart is the real one. A period with no music gets the
   * shorter record of what it can still draw.
   */
  const tourTracks = hasMusic ? TRACKS : TRACKS.filter((t) => t.id === 'charts' || t.id === 'notes' || t.id === 'poster')
  const tourStops = [INTRO, ...tourTracks.map((t) => t.id)]
  const onStage = tourStep === null ? null : tourStops[tourStep]
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
    setTourStep(0)
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
    setTourStep(null)
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
    const target = landAtTop.current || id === INTRO ? null : document.getElementById(id)
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
      setTourStep(null)
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

  // On a phone the tour is the way in: it opens as soon as the data is ready
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!PHONE || autoOpened.current) return
    autoOpened.current = true
    openTour(false)
  }, [])

  /** Jumps to the poster studio with a design picked (on the tour, its last stop) */
  function makePoster(design: PosterDesign) {
    setPosterDesign(design)
    if (touring) setTourStep(tourStops.indexOf('poster'))
    else document.getElementById('poster')?.scrollIntoView({ behavior: 'smooth' })
  }

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
    const sections = TRACKS.map((t) => document.getElementById(t.id)).filter((el): el is HTMLElement => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id)
      },
      { rootMargin: '-35% 0px -60% 0px' },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [hasMusic])

  return (
    <div className={touring ? 'dash is-touring' : 'dash'}>
      <header className="topbar" ref={topbarRef}>
        <a className="brand" href="#top" aria-label="On Record, back to the top">
          <span className="brand__name">On Record</span>
          <span className="brand__dot" aria-hidden="true" />
        </a>
        {/* Phones get a tracklist menu (with Poster and New data in it) and a dropdown for the year instead */}
        <TrackMenu tracks={TRACKS} sides={SIDES} current={current} onPoster={() => makePoster(posterDesign)} onReset={onReset} />
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

      <OnStage value={onStage}>
        <main className="dash__main">
          {onStage === INTRO && (
            <NeedleDrop model={record} slotColors={slotColors} period={year === null ? span : String(year)} hours={summary.totalMs / 3_600_000} />
          )}

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

          {!hasMusic && <p className="empty">There’s no music in this period, only podcasts. Most of the visuals below need songs.</p>}

          <Side label="Side A" title={SIDES.A} />

          <Chapter id="record" num="A1" title="The Record" lede="Every day you listened, pressed into vinyl. Each groove represents a day, one arc per song, placed by the time it played.">
            <Vinyl
              key={year ?? 'all'}
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
            lede="Who ruled your listening, and when."
            table={() => <RiverTable bins={bins} totals={totals} artists={legend} />}
          >
            {hasMusic ? <River bins={bins} totals={totals} eras={eras} artists={legend} colors={colors} /> : <NotEnough />}
          </Chapter>

          <Chapter
            id="race"
            num="A3"
            title="The Race"
            lede={`Total hours per artist, replayed ${bins.size} by ${bins.size}. Watch who pulls ahead.`}
          >
            {race.names.length > 1 ? <Race key={year ?? 'all'} bins={bins} race={race} colors={colors} /> : <NotEnough />}
          </Chapter>

          <Side label="Side B" title={SIDES.B} />

          <Chapter
            id="clock"
            num="B1"
            title="Around the Clock"
            lede="When the music happens, and who you reach for at each hour. Midnight is at the top."
            table={() => <ClockTable hours={hours} />}
          >
            <Clock hours={hours} parts={parts} grid={grid} />
          </Chapter>

          <Chapter id="days" num="B2" title="Every Day" lede="A square for every day. The brighter it glows, the longer you listened. Tap a day to see what you played.">
            <Calendar days={days} years={year === null ? years : [year]} plays={plays} firstHeard={firstHeard} colors={colors} />
          </Chapter>

          <Chapter
            id="lovehate"
            num="B3"
            title="Love / Hate"
            lede={`Your ${formatNumber(songs.length)} most-played songs: how often you start them (across) and how often you bail (up). The lines mark the middle of the pack.`}
            table={() => <LoveHateTable songs={songs} />}
          >
            {songs.length >= 5 ? <LoveHate songs={songs} skipRate={summary.skipRate} /> : <NotEnough />}
          </Chapter>

          <Side label="Side C" title={SIDES.C} />

          <Chapter
            id="constellation"
            num="C1"
            title="Constellation"
            lede="Your top artists as stars, joined when you play one straight after the other. Clusters are your scenes."
            table={() => <ConstellationTable links={graph.links} />}
          >
            {graph.nodes.length >= 3 ? <Constellation nodes={graph.nodes} links={graph.links} colors={colors} /> : <NotEnough />}
          </Chapter>

          <Chapter
            id="pulse"
            num="C2"
            title="Pulse"
            lede="Your top artists over time, one line each."
          >
            {pulseLines.length >= 2 ? (
              <Pulse
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

          <Chapter id="charts" num="C3" title="The Charts" lede="The rankings. Every cover is generated from the name, since nothing is fetched from anywhere.">
            <TopCharts plays={plays} />
          </Chapter>

          <Side label="Side D" title={SIDES.D} />

          <Chapter id="notes" num="D1" title="Liner Notes" lede="The back of the sleeve: who played on this record, and how well you know your own habits.">
            <LinerNotes
              takes={lines}
              fun={fun}
              rec={rec}
              summary={summary}
              devices={devices}
              topArtists={topArtists}
              hours={hours}
              period={year === null ? span : String(year)}
              isAllTime={year === null}
            />
          </Chapter>

          <Chapter
            id="poster"
            num="D2"
            title="The Poster"
            lede="Take it home. Pick a design, a size and a background, then download it or send it straight from your phone."
          >
            <PosterStudio data={posterData} design={posterDesign} onDesign={setPosterDesign} />
          </Chapter>

          {tourStep !== null && <UpNext tracks={tourTracks} sides={SIDES} step={tourStep} onStep={setTourStep} onFinish={() => closeTour(true)} />}

          <footer className="dash__footer">
            <p>
              <strong>Pressed locally.</strong> Everything on this page was worked out inside this browser tab. Nothing was uploaded.
            </p>
            <details className="load-details">
              <summary>Load details</summary>
              <ul>
                <li>
                  {result.filesRead.length} file{result.filesRead.length === 1 ? '' : 's'} read: {result.filesRead.join(', ')}
                </li>
                <li>{formatNumber(result.skippedRows)} rows without track info ignored (usually local files)</li>
                {result.duplicateRows > 0 && <li>{formatNumber(result.duplicateRows)} duplicate rows ignored</li>}
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
            <p className="disclaimer">
              On Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB. Spotify is a
              trademark of Spotify AB.
            </p>
          </footer>
        </main>
      </OnStage>

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
