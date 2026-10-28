import { lazy, Suspense, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { loadFiles, loadSample } from './data/load'
import type { LoadResult } from './types'

// The dashboard (and its charting code) only downloads once there's data to show
const Dashboard = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })))

type State =
  | { status: 'idle' }
  | { status: 'loading' }
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
    setState({ status: 'loading' })
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
      <Suspense fallback={<Pressing />}>
        <Dashboard result={state.result} isSample={state.isSample} onReset={() => setState({ status: 'idle' })} />
      </Suspense>
    )
  }

  if (state.status === 'loading') return <Pressing />

  return (
    <div className="landing">
      <div className="landing__glow" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <header className="landing__top">
        <span className="brand">
          My Listening Record<span className="brand__dot" aria-hidden="true" />
        </span>
        <span className="landing__tag">A Spotify &amp; Apple Music history visualizer</span>
      </header>

      <main className="landing__main">
        <div className="landing__copy">
          <p className="eyebrow">An in-depth analysis of your entire Spotify or Apple Music history</p>
          <h1 className="landing__title">
            My life,
            <br />
            <em>my listening record.</em>
          </h1>
          <p className="landing__lede">
            Drop in your Spotify or Apple Music export and get every day of your listening pressed into vinyl.
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
          <DropZone onFiles={(files) => load(() => loadFiles(files), false)} />

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
          Apple Music support is new, and Apple’s export changes between versions. If something looks wrong,{' '}
          <a href="https://github.com/CarsonGodwin/on-record/issues" target="_blank" rel="noreferrer">
            report it on GitHub
          </a>{' '}
          with what Load details says (it lists file names and counts, never your listening).
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
        My Listening Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB or Apple Inc.
        Spotify is a trademark of Spotify AB. Apple Music is a trademark of Apple Inc.
      </p>
    </div>
  )
}

function Pressing() {
  return (
    <div className="pressing" role="status">
      <div className="pressing__record" aria-hidden="true" />
      <p>
        Pressing your <em>record</em>…
      </p>
    </div>
  )
}
