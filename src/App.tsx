import { lazy, Suspense, useState } from 'react'
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

const FEATURES = [
  ['The Long Play', 'the whole record, hands on'],
  ['The Record', 'every day pressed into vinyl'],
  ['Eras', 'who ruled which months'],
  ['The Race', 'your artists, racing'],
  ['Around the Clock', 'your 3 AM artist'],
  ['Love / Hate', 'songs you can’t finish'],
  ['Constellation', 'your scenes, mapped'],
  ['Pulse', 'that album cover, but you'],
  ['The Poster', 'print it, post it'],
]

export default function App() {
  const [state, setState] = useState<State>({ status: 'idle' })

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
          On Record<span className="brand__dot" aria-hidden="true" />
        </span>
        <span className="landing__tag">A Spotify history visualizer</span>
      </header>

      <main className="landing__main">
        <div className="landing__copy">
          <p className="eyebrow">An in-depth analysis of your entire Spotify history</p>
          <h1 className="landing__title">
            Your life,
            <br />
            <em>on record.</em>
          </h1>
          <p className="landing__lede">
            Drop in your Spotify export and get every day of your listening pressed into vinyl. Your eras, your 3 AM artist, the
            songs you always skip, the scenes you drift between, and a poster worth sharing.
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
            <span className="landing__note">No export yet? Look around with made-up listening.</span>
            <button type="button" className="button button--ghost button--small" onClick={() => load(loadSample, true)}>
              ▶ Try the demo
            </button>
          </div>

          <p className="privacy">
            <strong>Your data never leaves your device.</strong> There’s no server. Your files are read right here in the
            browser, and nothing is uploaded or stored.
          </p>
        </div>
      </main>

      <ul className="features" aria-label="What you get">
        {FEATURES.map(([name, what]) => (
          <li key={name}>
            <b>{name}</b>
            <span>{what}</span>
          </li>
        ))}
      </ul>

      <details className="how-to">
        <summary>How to get your Extended Streaming History</summary>
        <ol>
          <li>
            Go to{' '}
            <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
              spotify.com/account/privacy
            </a>{' '}
            and log in.
          </li>
          <li>
            Check <strong>Extended streaming history</strong> (not just “Account data”) and request it.
          </li>
          <li>Confirm the request from the email Spotify sends you.</li>
          <li>Wait for the download link. Spotify says it takes up to 30 days, but it’s often faster.</li>
          <li>Drop the zip file on the sleeve above.</li>
        </ol>
      </details>

      <p className="colophon">
        On Record is open source.{' '}
        <a href="https://github.com/CarsonGodwin/on-record" target="_blank" rel="noreferrer">
          Star it, report a bug or support it on GitHub
        </a>
        .
      </p>

      <p className="disclaimer">
        On Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB. Spotify is a
        trademark of Spotify AB.
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
