# On Record

**React + Vite app that visualizes your Spotify or Apple Music listening history.**

Drop in your Spotify **Extended Streaming History** or your Apple Music **privacy export** and get your listening pressed into vinyl, plus a dozen other ways to look at it.

Everything runs in your browser. There's no server, and your data is never uploaded. Even the cover art is generated from names rather than fetched. The built site ships with a Content Security Policy that blocks all network requests (`connect-src 'none'`), so the browser itself enforces that.

## What you get

| | |
|---|---|
| **The Long Play** | A guided walk through the whole record, one track at a time, that phones open on. Drop the needle and watch your days press into the record, then try each chapter's real chart with a tip for what to play with. The way on waits at the bottom of each track, and at the end the whole page opens up. |
| **The Record** | Every day of listening as a vinyl record: one groove per day, arcs placed by time of day. Tap a groove (or use the slider) and the deck beside it unrolls that day into a 24-hour strip; the tonearm follows. On a phone, hold and drag on the record to skim it. |
| **Eras** | Streamgraph of your top artists, with the stretches one artist led your listening called out as eras. |
| **The Race** | Bar chart race of cumulative hours per artist. Turn it into a 9:16 story video, made on your device and ready for Instagram. |
| **Around the Clock** | 24-hour radial chart, your artist for each part of the day, and a weekday × hour dot matrix. |
| **Every Day** | Calendar heatmap, one square per day. |
| **Love / Hate** | Most-played songs by plays vs. skip rate: the keepers, the instant skips, and the ones you can't quit but can't finish. |
| **Constellation** | Force-directed map of artists you play back to back. Clusters are your scenes. |
| **Pulse** | An *Unknown Pleasures*-style ridgeline of your top artists, in the order you found them. |
| **The Charts** | Top artists, songs, albums and podcasts with generative covers. |
| **Liner Notes** | A listener-type card, records (streaks, marathons, obsessions, the artist you went quiet on) and habits. |
| **The Poster** | A shareable PNG in four designs: Deep dive (the record fully annotated, with small charts underneath), The Record, Sleeve (an album cover with a tracklist) and Annotated (a labelled figure). Three sizes (4:5 post, 9:16 story, 2:3 print), on black or cream. Deep dive is 4:5 only, and can come out several times bigger for reading up close. On phones it goes straight to the share sheet. |

Every view follows the year picker at the top.

## Getting your data

**Spotify**

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and request **Extended streaming history**.
2. Confirm the email, then wait for the download link (up to 30 days).
3. Drop the `.zip` onto the record sleeve.

**Apple Music**

1. Go to [privacy.apple.com](https://privacy.apple.com/), choose **Request a copy of your data** and check **Apple Media Services information**.
2. Wait for the email (Apple says up to a week).
3. Download every part and drop them all onto the record sleeve. The zips, the folder they unzip to, or the `Apple Music*.csv`/`.json` files all work. Only the Apple Music files are opened; the rest of the export (purchases, Apple Pay and so on) is never read.

You can drop a Spotify export and an Apple Music export together to get one timeline, for example if you switched services.

No data yet? Use **Try the demo**.

## Spotify vs. Apple Music

Both exports become the same plays, so every view works with either. Apple's export records less than Spotify's, so a few things differ:

| | Spotify | Apple Music |
|---|---|---|
| **Artist** | In every row | Not in the play activity. Matched by song title from the export's other Apple Music files (and the library), using the album and the day played to tell apart songs that share a title. Songs with no match show as "Unknown artist", and Load details counts them. |
| **Shuffle** | Recorded | Not recorded. The shuffle question and shuffle facts are left out. With both services, shuffle stats use the Spotify plays only. |
| **Podcasts and audiobooks** | Included | Not in Apple Music's export, so the podcast views stay empty. |
| **Skips** | `skipped` flag and end reason | From Apple's end reason (skipped forward). |
| **Plays** | One row per stream | Apple splits a listen whenever you pause or seek; parts of the same song within 30 seconds are joined back into one play. A song on repeat stays separate plays. |
| **Songs** | Told apart by Spotify's track ID | No track IDs, so songs are told apart by artist and title. A single and its album version count as one song. |
| **Devices** | Phone, computer, web, speakers | The same families, plus Apple Watch and Apple TV; HomePod counts as a speaker. |

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
  data/stats.ts         Summary numbers, rankings, streaks
  data/insights.ts      Time bins, eras, race frames, sessions, artist graph, listener profile
  viz/record.ts         The vinyl drawing, shared by the chart and the poster
  viz/constellation.ts  The artist-graph layout, shared by the chart and the poster
  viz/pressing.ts       The record pressed a groove at a time, for The Long Play's needle drop
  viz/poster.ts         Poster rendering, and the Record, Sleeve and Annotated designs
  viz/posterDeep.ts     The Deep dive poster
  viz/posterShared.ts   Drawing helpers shared by the posters and the race video
  viz/raceVideo.ts      The Race as a 9:16 video, encoded on-device
  lib/palette.ts        Chart colors (validated for colorblind separation on the dark surface)
  lib/dropFiles.ts      Drag-and-drop, including dropped folders
  lib/stage.ts          Which chapter The Long Play has on stage
  components/           One file per visualization, plus Dashboard, PosterStudio, the landing sleeve,
                        and The Long Play (Tour, NeedleDrop)
```

## License

[MIT](LICENSE). The bundled fonts (Bricolage Grotesque, Instrument Serif, JetBrains Mono) are under the [SIL Open Font License 1.1](https://openfontlicense.org).

## Disclaimer

On Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB or Apple Inc. Spotify is a trademark of Spotify AB. Apple Music is a trademark of Apple Inc.
