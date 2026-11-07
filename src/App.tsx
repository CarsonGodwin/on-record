import { lazy, Suspense, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { isAppleArchiveName, appleFileKind } from './data/appleFiles'
import { loadFiles, loadSample } from './data/load'
import type { LoadResult } from './types'

// The dashboard (and its charting code) only downloads once there's data to show
const Dashboard = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })))

type State =
  | { status: 'idle' }
  | { status: 'loading'; slow: boolean }
  | { status: 'error'; message: string; warnings: string[] }
  | { status: 'ready'; result: LoadResult; isSample: boolean }

// The back of the sleeve: the same sides the dashboard is pressed in, so the page you land on reads as its tracklist.
// The Long Play opens Side A, since it starts the record from the top.
const SIDES = [
  {
    side: 'A',
    title: 'Time',
    tracks: [
      ['The Long Play', 'the whole record, hands on'],
      ['The Record', 'every day pressed into vinyl'],
      ['Eras', 'who ruled which months'],
      ['The Race', 'your artists, racing'],
    ],
  },
  {
    side: 'B',
    title: 'Rhythm',
    tracks: [
      ['Around the Clock', 'your 3 AM artist'],
      ['Love / Hate', 'songs you can’t finish'],
    ],
  },
  {
    side: 'C',
    title: 'Taste',
    tracks: [
      ['Constellation', 'your scenes, mapped'],
      ['Pulse', 'that album cover, but you'],
    ],
  },
  { side: 'D', title: 'Take it home', tracks: [['The Poster', 'print it, post it']] },
]

export default function App() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const howTo = useRef<HTMLDetailsElement>(null)

  async function load(getResult: () => Promise<LoadResult> | LoadResult, isSample: boolean) {
    setState({ status: 'loading', slow: false })
    // Let the loading state render before parsing, which can block the page briefly
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      const result = await getResult()
      if (result.plays.length === 0) {
        setState({ status: 'error', message: 'No listening history found in those files.', warnings: result.warnings })
      } else {
        setState({ status: 'ready', result, isSample })
        window.scrollTo(0, 0)
      }
    } catch (err) {
      setState({ status: 'error', message: `Something went wrong reading your files: ${String(err)}`, warnings: [] })
    }
  }

  if (state.status === 'ready') {
    return (
      <Suspense fallback={<Pressing slow={false} />}>
        <Dashboard result={state.result} isSample={state.isSample} onReset={() => setState({ status: 'idle' })} />
      </Suspense>
    )
  }

  if (state.status === 'loading') return <Pressing slow={state.slow} />

  return (
    <div className="landing">
      <header className="landing__top">
        <span className="brand">
          My Listening Record<span className="brand__dot" aria-hidden="true" />
        </span>
        <span className="landing__tag">A Spotify, Apple Music &amp; Last.fm history visualizer</span>
      </header>

      <main className="landing__main">
        <div className="landing__copy">
          <h1 className="landing__title">One groove for every day you listened.</h1>
          <p className="landing__lede">
            Drop in your Spotify, Apple Music or Last.fm export and your whole history is pressed into a record.
            {/* A phone's first screen keeps to the one sentence, so the sleeve and the demo fit on it too */}
            <span className="landing__more">
              {' '}
              Your eras, your 3 AM artist, the songs you always skip, the scenes you drift between, and a poster worth sharing.
            </span>
          </p>

          {state.status === 'error' && (
            <div className="error" role="alert">
              <p>{state.message}</p>
              {state.warnings.length > 0 && (
                <ul>
                  {state.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Your own export is the main way in; the demo is the fallback underneath it */}
        <div className="landing__import">
          <DropZone
            onFiles={(picked) =>
              load(async () => {
                const { files, unreadable } = await picked
                // Apple's play activity is far bigger than Spotify's files, so it takes noticeably longer.
                // A zip we can't name might be either, so only files that look like Apple's say so.
                if (files.some((f) => appleFileKind(f.name) !== null || isAppleArchiveName(f.name) || /apple/i.test(f.name))) {
                  setState((s) => (s.status === 'loading' ? { ...s, slow: true } : s))
                }
                return loadFiles(files, unreadable)
              }, false)
            }
          />

          <div className="landing__demo">
            {/* The export takes days to arrive, so requesting it comes first; the demo is for the wait */}
            <span className="landing__note">
              No export yet?{' '}
              <a
                href="#get-your-data"
                onClick={() => {
                  if (howTo.current) howTo.current.open = true
                }}
              >
                Request it now
              </a>
              <span className="landing__more">, since it can take a few days to arrive. Or look around with made-up listening.</span>
            </span>
            <button type="button" className="button button--ghost button--small" onClick={() => load(loadSample, true)}>
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
              </svg>{' '}
              Try the demo
            </button>
          </div>

          <p className="privacy">
            <strong>Your data never leaves your device.</strong>
            <span className="landing__more">
              {' '}
              There’s no server. Your files are read right here in the browser, and nothing is uploaded or stored.
            </span>
            <span className="landing__less"> No server: nothing is uploaded or stored.</span>
          </p>
        </div>
      </main>

      <section className="sleeve-back" aria-label="What’s on the record">
        {SIDES.map(({ side, title, tracks }) => (
          <div key={side} className="sleeve-back__side">
            <h2>
              Side {side} <span>{title}</span>
            </h2>
            <ul>
              {tracks.map(([name, what]) => (
                <li key={name}>
                  <b>{name}</b>
                  <span>{what}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <details className="how-to" id="get-your-data" ref={howTo}>
        <summary>
          How to get your listening history
          {/* Shown while it's still closed, so nobody expects the file today */}
          <span className="how-to__wait">
            Request it now and come back when the email arrives. Apple takes up to a week, Spotify up to 30 days.
          </span>
        </summary>
        <h3>Spotify</h3>
        <p className="how-to__time">Up to 30 days, often sooner.</p>
        <p className="how-to__tip">
          <strong>Tick Extended streaming history</strong>, further down the page. Account data arrives sooner but only
          covers the last year, without the detail this needs. You can tick both.
        </p>
        <ol>
          <li>
            Go to{' '}
            <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
              spotify.com/account/privacy
            </a>{' '}
            and log in.
          </li>
          <li>
            Tick <strong>Extended streaming history</strong> and request it.
          </li>
          <li>Confirm the request from the email Spotify sends you.</li>
          <li>Wait for the email with the download link.</li>
          <li>Add the zip file on the sleeve above.</li>
        </ol>
        <p className="how-to__note">
          <a href="guides/spotify-extended-streaming-history/">The full guide to Spotify’s Extended Streaming History</a>
        </p>
        <h3>
          Apple Music <span className="beta">Beta</span>
        </h3>
        <p className="how-to__time">Up to a week.</p>
        <p className="how-to__tip">
          <strong>Only tick Apple Media Services information.</strong> Nothing else in the export is used, and leaving
          it out keeps the download small. When Apple asks for a file size, pick the largest so it comes in fewer
          parts.
        </p>
        <ol>
          <li>
            Go to{' '}
            <a href="https://privacy.apple.com/" target="_blank" rel="noreferrer">
              privacy.apple.com
            </a>{' '}
            and sign in with your Apple Account.
          </li>
          <li>
            Choose <strong>Request a copy of your data</strong>, tick <strong>Apple Media Services information</strong>{' '}
            and continue.
          </li>
          <li>Pick the largest file size and complete the request.</li>
          <li>Wait for the email saying it’s ready.</li>
          <li>Download every part (big exports come in several zips) and add them all on the sleeve above.</li>
        </ol>
        <p className="how-to__note">
          <a href="guides/apple-music-listening-history/">The full guide to your Apple Music listening history</a>
        </p>
        <p className="how-to__note">
          Apple Music support is new, and Apple’s export changes between versions. If something looks wrong,{' '}
          <a href="https://github.com/CarsonGodwin/on-record/issues" target="_blank" rel="noreferrer">
            report it on GitHub
          </a>{' '}
          with what Load details says (it lists file names and counts, never your listening).
        </p>
        <h3>
          Last.fm <span className="beta">Beta</span>
        </h3>
        <p className="how-to__time">A few minutes or longer, depending on how much you’ve scrobbled.</p>
        <ol>
          <li>
            Go to{' '}
            <a href="https://benjaminbenben.com/lastfm-to-csv/" target="_blank" rel="noreferrer">
              lastfm-to-csv
            </a>
            , a free tool made by someone else, and type your Last.fm username.
          </li>
          <li>
            Choose <strong>Fetch tracks</strong> and wait until it says <strong>finished</strong>. Saving sooner gives you
            only part of your history.
          </li>
          <li>
            Choose <strong>Save</strong> and add the <code>.csv</code> on the sleeve above.
          </li>
        </ol>
        <p className="how-to__note">
          <a href="guides/lastfm-scrobbles-csv/">The full guide to exporting your Last.fm scrobbles</a>
        </p>
        <p className="how-to__note">
          Last.fm doesn’t record how long a song played or what you skipped, so hours are estimated and Love / Hate stays
          off. On days a Spotify or Apple Music export also covers, that export’s plays are kept.
        </p>
      </details>

      <p className="colophon">
        My Listening Record is open source.{' '}
        <a href="https://github.com/CarsonGodwin/on-record" target="_blank" rel="noreferrer">
          Star it, report a bug or support it on GitHub
        </a>
        .
      </p>

      <p className="disclaimer">
        My Listening Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB, Apple Inc. or Last.fm Ltd.
        Spotify is a trademark of Spotify AB. Apple Music is a trademark of Apple Inc. Last.fm is a trademark of Last.fm Ltd.
      </p>
    </div>
  )
}

function Pressing({ slow }: { slow: boolean }) {
  return (
    <div className="pressing" role="status">
      <div className="pressing__record" aria-hidden="true" />
      <p>
        Pressing your <em>record</em>…
      </p>
      {slow && <p className="pressing__sub">Apple Music uploads can take a bit longer.</p>}
    </div>
  )
}
