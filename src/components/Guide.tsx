import type { ReactNode } from 'react'

/*
 * The guides and the 404 page. They're rendered to HTML at build time (see vite.config.ts) and
 * ship with no script: they're for search engines and for people waiting on their export, and
 * every link out of them leads back to the app.
 */

const SPOTIFY = 'guides/spotify-extended-streaming-history/'
const APPLE = 'guides/apple-music-listening-history/'
const LASTFM = 'guides/lastfm-scrobbles-csv/'

/** A guide's links are relative to its own folder, so the built site still works below a sub-path */
const FROM_GUIDE = '../../'

function GuidePage({ home, children }: { home: string; children: ReactNode }) {
  return (
    <div className="guide">
      <header className="guide__top">
        <a className="brand" href={home}>
          My Listening Record<span className="brand__dot" aria-hidden="true" />
        </a>
        <span className="landing__tag">A Spotify, Apple Music &amp; Last.fm history visualizer</span>
      </header>

      <main>{children}</main>

      <p className="colophon">
        My Listening Record is open source.{' '}
        <a href="https://github.com/CarsonGodwin/on-record" target="_blank" rel="noreferrer">
          See the code on GitHub
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

/** Where every guide ends: the app, and the promise that the file stays put */
function Start({
  children,
  shows = 'your eras, your 3 AM artist, the songs you always skip and a poster to share',
}: {
  children: ReactNode
  shows?: string
}) {
  return (
    <section className="guide__start" aria-label="See your history">
      <p>
        <strong>{children}</strong> My Listening Record presses every day of it into a vinyl record, with {shows}. It runs in your browser: the file is never
        uploaded.
      </p>
      <a className="button" href={FROM_GUIDE}>
        Open My Listening Record
      </a>
    </section>
  )
}

export function SpotifyGuide() {
  return (
    <GuidePage home={FROM_GUIDE}>
      <article>
        <h1>
          How to get your Spotify <em>Extended Streaming History</em>
        </h1>
        <p className="guide__intro">
          Spotify keeps a record of every song, podcast and audiobook you’ve played since you opened your account. Wrapped
          shows you one year of it. The Extended Streaming History export gives you all of it, and anyone can request it
          for free.
        </p>

        <h2>Request it</h2>
        <ol>
          <li>
            Go to{' '}
            <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
              spotify.com/account/privacy
            </a>{' '}
            and log in.
          </li>
          <li>
            Scroll down to the download section and tick <strong>Extended streaming history</strong>. You can tick Account
            data as well, but it isn’t the one you want.
          </li>
          <li>Request the data, then confirm the request from the email Spotify sends you.</li>
          <li>Wait for a second email with the download link, and download the zip before the link expires.</li>
        </ol>

        <h2>How long it takes</h2>
        <p>
          Spotify says up to 30 days, and it’s often sooner. Request it now and come back when the email arrives. In the
          meantime you can{' '}
          <a href={FROM_GUIDE}>try My Listening Record with made-up listening</a>.
        </p>

        <h2>Extended streaming history or Account data?</h2>
        <p>
          Spotify offers two exports with listening in them, and they’re easy to mix up. <strong>Account data</strong>{' '}
          arrives within a few days, but its streaming history only covers the past year and only says what played, when
          and for how long. Its files are called <code>StreamingHistory_music_0.json</code>.
        </p>
        <p>
          <strong>Extended streaming history</strong> covers the whole life of your account, and for every stream it also
          says why it started and ended (so you can tell a skip from a song played to the end), whether shuffle was on,
          the album, and the device. That’s the detail eras, skip rates and listening clocks need, so My Listening Record
          only reads this one.
        </p>

        <h2>What’s in the export</h2>
        <p>
          The zip holds a folder called <code>Spotify Extended Streaming History</code> with a readme and a run of JSON
          files named by year, like <code>Streaming_History_Audio_2019-2021_0.json</code>. Some exports also hold{' '}
          <code>Streaming_History_Video</code> files for videos. Each row of the audio files is one stream:
        </p>
        <ul>
          <li>
            when it stopped playing (<code>ts</code>, in UTC) and how long it played (<code>ms_played</code>)
          </li>
          <li>the track, artist and album, or the podcast episode and show, or the audiobook and chapter</li>
          <li>
            why it started and ended (<code>reason_start</code>, <code>reason_end</code>) and whether it was{' '}
            <code>skipped</code>
          </li>
          <li>
            whether <code>shuffle</code>, <code>offline</code> or <code>incognito_mode</code> were on
          </li>
          <li>the platform it played on and the country you were in</li>
        </ul>
        <p>
          It also holds your IP address and device details for every stream. My Listening Record never copies those, and
          nothing in the file leaves your device.
        </p>

        <h2>See it</h2>
        <p>
          Drop the zip onto the record sleeve on the{' '}
          <a href={FROM_GUIDE}>home page</a>. There’s no need to unzip it first. If you switched from Apple Music, drop{' '}
          <a href={`${FROM_GUIDE}${APPLE}`}>your Apple Music export</a> in with it and you’ll get one timeline.
        </p>
      </article>

      <Start>Got your zip?</Start>
    </GuidePage>
  )
}

export function AppleGuide() {
  return (
    <GuidePage home={FROM_GUIDE}>
      <article>
        <h1>
          How to see your <em>Apple Music listening history</em>
        </h1>
        <p className="guide__intro">
          Apple Music Replay shows your top songs and artists a year at a time. For every play since you started, ask
          Apple for a copy of your data. It’s free, and it takes a few clicks.
        </p>

        <h2>Request it</h2>
        <ol>
          <li>
            Go to{' '}
            <a href="https://privacy.apple.com/" target="_blank" rel="noreferrer">
              privacy.apple.com
            </a>{' '}
            and sign in with your Apple Account.
          </li>
          <li>
            Choose <strong>Request a copy of your data</strong>.
          </li>
          <li>
            Tick <strong>Apple Media Services information</strong> and nothing else, then continue. The rest of the export
            isn’t about music, and leaving it out keeps the download small.
          </li>
          <li>When Apple asks for a file size, pick the largest, so the export comes in fewer parts.</li>
          <li>Complete the request and wait for the email saying it’s ready.</li>
        </ol>

        <h2>How long it takes</h2>
        <p>
          Apple says up to a week. While you wait, you can{' '}
          <a href={FROM_GUIDE}>try My Listening Record with made-up listening</a>.
        </p>

        <h2>Download every part</h2>
        <p>
          Big exports come as several zips. Download all of them: your plays can be spread across the parts. Inside is
          another zip, <code>Apple_Media_Services.zip</code>, and inside that are the Apple Music files.
        </p>

        <h2>What’s in the export</h2>
        <p>Five files hold your Apple Music history:</p>
        <ul>
          <li>
            <code>Apple Music Play Activity.csv</code>: one row for each time something played, with when it started and
            ended, how long it played, the song and album, why it stopped (finished, skipped, paused), the device, and on
            newer rows whether shuffle was on
          </li>
          <li>
            <code>Apple Music - Play History Daily Tracks.csv</code>, <code>Apple Music - Recently Played Tracks.csv</code>{' '}
            and <code>Apple Music - Track Play History.csv</code>: shorter histories that name each song as “Artist -
            Title”
          </li>
          <li>
            <code>Apple Music Library Tracks.json</code>: the songs in your library, with their artist and album
          </li>
        </ul>
        <p>
          The rest of the export holds things like purchases and Apple Pay activity. My Listening Record opens only the
          files above, and nothing in them leaves your device.
        </p>

        <h2>What to expect</h2>
        <p>Apple’s export records less than Spotify’s, so a few things work differently:</p>
        <ul>
          <li>
            The play activity doesn’t name the artist. My Listening Record finds it by matching the song in the other files,
            and counts any songs it can’t match.
          </li>
          <li>
            Apple writes a new row whenever you pause or seek. Parts of the same song close together are joined back into
            one play.
          </li>
          <li>Podcasts aren’t in Apple Music’s export, and older plays don’t say whether shuffle was on.</li>
        </ul>

        <h2>See it</h2>
        <p>
          Drop every zip onto the record sleeve on the <a href={FROM_GUIDE}>home page</a>. The folder they unzip to, or the
          Apple Music files on their own, work too. If you switched from Spotify, drop{' '}
          <a href={`${FROM_GUIDE}${SPOTIFY}`}>your Spotify export</a> in with it and you’ll get one timeline.
        </p>
      </article>

      <Start>Got your export?</Start>
    </GuidePage>
  )
}

export function LastfmGuide() {
  return (
    <GuidePage home={FROM_GUIDE}>
      <article>
        <h1>
          How to export your <em>Last.fm scrobbles</em> to a CSV
        </h1>
        <p className="guide__intro">
          Last.fm has a record of every song you’ve scrobbled. A free tool called lastfm-to-csv saves all of it as one file.
          It only needs your username, and it takes a few minutes or longer, depending on how much you’ve scrobbled.
        </p>

        <h2>Save it</h2>
        <ol>
          <li>
            In your Last.fm privacy settings, make sure <strong>Hide recent listening information</strong> is off. The tool
            can’t read your scrobbles while it’s on.
          </li>
          <li>
            Go to{' '}
            <a href="https://benjaminbenben.com/lastfm-to-csv/" target="_blank" rel="noreferrer">
              lastfm-to-csv
            </a>
            , type your Last.fm username and choose <strong>Fetch tracks</strong>.
          </li>
          <li>
            Keep the tab open until it says <strong>finished</strong>.
          </li>
          <li>
            Choose <strong>Save</strong>. The file is named after your username, like <code>yourname.csv</code>.
          </li>
        </ol>
        <p>
          lastfm-to-csv is made by someone else, not by My Listening Record. It never asks for your password, because it
          reads the listening your Last.fm profile already shows.
        </p>

        <h2>Check you got all of it</h2>
        <p>
          Save works while the tool is still fetching, and that gives you only part of your history. If a red{' '}
          <strong>errors</strong> label appears, 200 scrobbles are missing for each error. Fetch again, and if the errors come
          back, open <strong>Settings</strong> on that page and set a request delay.
        </p>
        <p>
          To check the file, compare the scrobble count on your Last.fm profile with the plays listed under Load details at
          the bottom of your record. They should be close. A row count that’s an exact multiple of 200 is a sign the last
          page never arrived.
        </p>

        <h2>What’s in the file</h2>
        <p>Each row is one scrobble, with four columns and no header:</p>
        <ul>
          <li>the artist</li>
          <li>the album, which can be empty</li>
          <li>the track</li>
          <li>
            when it started, to the minute and in UTC, like <code>06 Nov 2026, 20:57</code>
          </li>
        </ul>
        <p>Another tool’s CSV works too, as long as it has the same columns in the same order.</p>

        <h2>What to expect</h2>
        <p>Last.fm records what started and when, and nothing else, so a few things work differently:</p>
        <ul>
          <li>
            Hours are estimates. My Listening Record works out each song’s length from the time between scrobbles, and says
            so on the page.
          </li>
          <li>Skips aren’t recorded, so Love / Hate and skip rates stay off rather than showing a made-up number.</li>
          <li>Shuffle and devices aren’t recorded either, and neither are podcasts.</li>
        </ul>

        <h2>See it</h2>
        <p>
          Drop the <code>.csv</code> onto the record sleeve on the <a href={FROM_GUIDE}>home page</a>. Don’t put it in a zip or
          a folder: those are only searched for Spotify and Apple Music files. If you also have{' '}
          <a href={`${FROM_GUIDE}${SPOTIFY}`}>your Spotify export</a> or{' '}
          <a href={`${FROM_GUIDE}${APPLE}`}>your Apple Music export</a>, drop them in with it. On any day they cover, their
          plays replace Last.fm’s, because they record more.
        </p>
      </article>

      <Start shows="your eras, your 3 AM artist and a poster to share">Got your CSV?</Start>
    </GuidePage>
  )
}

/**
 * Served for any address that doesn't exist, at any depth, so its links are absolute
 * (vite.config.ts makes its asset paths absolute too).
 */
export function NotFound() {
  return (
    <GuidePage home="/">
      <h1>
        Nothing’s pressed <em>here.</em>
      </h1>
      <p className="guide__intro">That page doesn’t exist. The record starts on the home page.</p>
      <p>
        <a className="button" href="/">
          Go to My Listening Record
        </a>
      </p>
      <h2>Waiting on your data?</h2>
      <ul>
        <li>
          <a href={`/${SPOTIFY}`}>How to get your Spotify Extended Streaming History</a>
        </li>
        <li>
          <a href={`/${APPLE}`}>How to see your Apple Music listening history</a>
        </li>
        <li>
          <a href={`/${LASTFM}`}>How to export your Last.fm scrobbles to a CSV</a>
        </li>
      </ul>
    </GuidePage>
  )
}
