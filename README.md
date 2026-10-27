# My Listening Record

**React + Vite app that visualizes your Spotify or Apple Music listening history.**

Drop in your Spotify **Extended Streaming History** or your Apple Music **privacy export** and get your listening pressed into vinyl, plus a dozen other ways to look at it.

Everything runs in your browser. There's no server, and your data is never uploaded. Even the cover art is generated from names rather than fetched. The built site ships with a Content Security Policy that blocks all network requests (`connect-src 'none'`), so the browser itself enforces that.

## What you get

| | |
|---|---|
| **On a phone** | Held upright, the record is a deck of cards: one track fills the screen, nothing scrolls, and the bar at the bottom (or a quick swipe) deals the next one. It opens straight on The Record. Turn the phone sideways for the whole page. |
| **The Long Play** | A guided walk through the whole record on a bigger screen, one track at a time: each chapter's real chart with a tip for what to play with. The way on waits at the bottom of each track, and at the end the whole page opens up. |
| **The Record** | Every day of listening as a vinyl record: one groove per day, arcs placed by time of day. Tap a groove (or use the slider) and the deck beside it unrolls that day into a 24-hour strip; the tonearm follows. On a phone's card, put a finger on the record and the needle follows it; pinch or double-tap to zoom. |
| **Eras** | Streamgraph of your top artists, with the stretches one artist led your listening called out as eras. |
| **The Race** | Bar chart race of cumulative hours per artist. Turn it into a 9:16 story video, made on your device and ready for Instagram. |
| **Around the Clock** | 24-hour radial chart split into day and night, your artist for each part of the day (on a phone, the one you lean on more than usual), and a weekday × hour dot matrix. |
| **Every Day** | Calendar heatmap, one square per day, a year at a time. On a phone it's a calendar: pick a year, a month and a day, or find a date, and the day opens with everything you played. |
| **Love / Hate** | The song you let play most against the one you skip most, then (on a bigger screen) every most-played song by plays vs. skip rate. |
| **Constellation** | Force-directed map of artists you play back to back. Clusters are your scenes. |
| **Pulse** | An *Unknown Pleasures*-style ridgeline of your top artists, in the order you found them. |
| **The Charts** | Top artists, songs, albums and podcasts with generative covers. |
| **Liner Notes** | A listener-type card, records (streaks, marathons, obsessions, the artist you went quiet on) and habits. On a phone, the four facts you'd never have guessed. |
| **The Poster** | A shareable PNG in four designs: Deep dive (the record fully annotated, with small charts underneath), The Record, Sleeve (an album cover with a tracklist) and Annotated (a labelled figure). Three sizes (4:5 post, 9:16 story, 2:3 print), on black or cream. Deep dive is 4:5 only, and can come out several times bigger for reading up close. On phones it goes straight to the share sheet. |

Every view follows the year picker at the top.

## Getting your data

**Spotify**

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and request **Extended streaming history**.
2. Confirm the email, then wait for the download link (up to 30 days).
3. Drop the `.zip` onto the record sleeve.

**Apple Music** (beta: support is new, so please [report anything that looks wrong](https://github.com/CarsonGodwin/on-record/issues))

1. Go to [privacy.apple.com](https://privacy.apple.com/), choose **Request a copy of your data** and check **Apple Media Services information**.
2. Wait for the email (Apple says up to a week).
3. Download every part and drop them all onto the record sleeve. The zips, the folder they unzip to, or the `Apple Music*.csv`/`.json` files all work. Only the Apple Music files are opened; the rest of the export (purchases, Apple Pay and so on) is never read.

You can drop a Spotify export and an Apple Music export together to get one timeline, for example if you switched services.

No data yet? Use **Try the demo**.

## Spotify vs. Apple Music

Both exports become the same plays, so every view works with either. Apple's export records less than Spotify's, so a few things differ:

| | Spotify | Apple Music |
|---|---|---|
| **Artist** | In every row | Not in the play activity. Matched by song title from the export's other Apple Music files (and the library), using the album (from the library and Recently Played) and the day played to tell apart songs that share a title, and spelled the way the export spells that artist most (the library's spelling first). Songs with no match become "Unknown artist", hidden to start with (Hide Artists… shows them), and Load details counts them. |
| **Shuffle** | Recorded | Recorded only on newer plays. Shuffle stats leave out the plays that don't say, and Load details counts them; with none at all, the shuffle question and shuffle facts are left out. |
| **Podcasts and audiobooks** | Included | Not in Apple Music's export, so the podcast views stay empty. |
| **Skips** | `skipped` flag and end reason | From Apple's end reason (skipped forward). |
| **Plays** | One row per stream | Apple splits a listen whenever you pause or seek; parts of the same song within 30 seconds are joined back into one play. A song on repeat stays separate plays. |
| **Songs** | Told apart by Spotify's track ID | No track IDs, so songs are told apart by artist and title. A single and its album version count as one song. Dropped with a Spotify export, a song with the same artist and title shares Spotify's ID, so it counts as one song across both. |
| **Videos** | Video history files are skipped | Music video plays are left out, and Load details counts them |
| **Devices** | Phone, computer, web, speakers | The same families, plus Apple Watch and Apple TV; HomePod and Alexa count as speakers. Older plays that don't name the app fall back to the device type they record. |

On the Deep dive poster, the credit line names whichever export the data came from.

## Development

```bash
npm install
npm run dev
npm test        # tests in tests/{data,viz,lib} (Vitest)
npm run lint    # oxlint
npm run build   # type-check, then build to dist/
```

## Deploying

The site is hosted on Cloudflare, which builds and deploys from `main`. Connect the repo under **Workers & Pages** with build command `npm run build` and output directory `dist`. Every push and pull request also runs lint, audit, build and tests in [CI](.github/workflows/ci.yml).

The build emits `dist/_headers`, which Cloudflare applies as response headers: the Content Security Policy plus HSTS, framing and caching rules. The build uses relative asset paths, so `dist/` also works on any other static host, where the CSP meta tag in the page still applies.

## Project structure

```
src/
  types.ts              Raw Spotify row type and the cleaned-up Play type
  data/parse.ts         Turns one raw Spotify row into a Play
  data/load.ts          Reads zip/JSON/CSV files (including Apple's zips within zips), validates, dedupes
  data/appleFiles.ts    Which files in Apple's privacy export hold Apple Music history
  data/apple.ts         Apple Music's export to Plays: joins split listens, finds artists by title
  data/csv.ts           A small CSV reader that copies out only the columns asked for
  data/sample.ts        Seeded fake history in Spotify's raw format
  data/sampleWords.ts   Invented artist, song, show and book names the sample is built from
  data/stats.ts         Summary numbers, rankings, streaks
  data/insights.ts      Time bins, eras, race frames, sessions, artist graph, listener profile
  data/dayparts.ts      Day and night, and who you lean on in each part of the day
  data/lovehate.ts      The songs you let play and the ones you skip
  data/eraTimeline.ts   Eras placed down a time axis, for the phone's Eras card
  data/pulse.ts         Each Pulse artist's peak month
  data/smallPrint.ts    The liner notes' most surprising facts
  viz/record.ts         The vinyl drawing, shared by the chart and the poster
  viz/constellation.ts  The artist-graph layout, shared by the chart and the poster
  viz/poster.ts         Poster rendering, and the Record, Sleeve and Annotated designs
  viz/posterDeep.ts     The Deep dive poster
  viz/posterShared.ts   Drawing helpers shared by the posters and the race video
  viz/raceVideo.ts      The Race as a 9:16 video, encoded on-device
  lib/palette.ts        Chart colors (validated for colorblind separation on the dark surface)
  lib/dropFiles.ts      Drag-and-drop, including dropped folders
  lib/stage.ts          Which chapter is on stage (The Long Play, or a phone's card)
  lib/swipe.ts          What counts as a swipe between cards
  lib/back.ts           The back gesture closing whatever is open over a card
  components/           One file per visualization, plus Dashboard, PosterStudio, the landing sleeve,
                        The Long Play (Tour) and the phone deck's bottom bar (CardNav)
```

## License

[MIT](LICENSE). The bundled fonts (Bricolage Grotesque, Instrument Serif, JetBrains Mono) are under the [SIL Open Font License 1.1](https://openfontlicense.org).

## Disclaimer

My Listening Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB or Apple Inc. Spotify is a trademark of Spotify AB. Apple Music is a trademark of Apple Inc.
