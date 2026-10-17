# On Record

**React + Vite app that visualizes your Spotify listening history.**

Drop in your **Extended Streaming History** export and get your listening pressed into vinyl, plus a dozen other ways to look at it.

Everything runs in your browser. There's no server, and your data is never uploaded. Even the cover art is generated from names rather than fetched. The built site ships with a Content Security Policy that blocks all network requests (`connect-src 'none'`), so the browser itself enforces that.

## What you get

| | |
|---|---|
| **The Record** | Every day of listening as a vinyl record: one groove per day, arcs placed by time of day. Tap a groove (or use the slider) and the deck beside it unrolls that day into a 24-hour strip; the tonearm follows. On a phone, hold and drag on the record to skim it. |
| **Eras** | Streamgraph of your top artists, with the stretches one artist led your listening called out as eras. |
| **The Race** | Bar chart race of cumulative hours per artist. |
| **Around the Clock** | 24-hour radial chart, your artist for each part of the day, and a weekday × hour dot matrix. |
| **Every Day** | Calendar heatmap, one square per day. |
| **Love / Hate** | Most-played songs by plays vs. skip rate: the keepers, the instant skips, and the ones you can't quit but can't finish. |
| **Constellation** | Force-directed map of artists you play back to back. Clusters are your scenes. |
| **Pulse** | An *Unknown Pleasures*-style ridgeline of your top artists, in the order you found them. |
| **The Charts** | Top artists, songs, albums and podcasts with generative covers. |
| **Liner Notes** | A listener-type card, records (streaks, marathons, obsessions, the artist you went quiet on) and habits. |
| **The Poster** | A shareable PNG in three designs (Record, Constellation star chart, Pulse), three sizes (4:5 post, 9:16 story, 2:3 print) and two papers. On phones it goes straight to the share sheet. |

Every view follows the year picker at the top.

## Getting your data

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and request **Extended streaming history**.
2. Confirm the email, then wait for the download link (up to 30 days).
3. Drop the `.zip` onto the record sleeve.

No data yet? Use **Spin the demo record**.

## Development

```bash
npm install
npm run dev
npm test        # tests in tests/{data,viz,lib} (Vitest)
```

## Deploying

The site is hosted on Cloudflare, which builds and deploys from `main`. Connect the repo under **Workers & Pages** with build command `npm run build` and output directory `dist`. Every push and pull request also runs lint, audit, build and tests in [CI](.github/workflows/ci.yml).

The build emits `dist/_headers`, which Cloudflare applies as response headers: the Content Security Policy plus HSTS, framing and caching rules. The build uses relative asset paths, so `dist/` also works on any other static host, where the CSP meta tag in the page still applies.

## Project structure

```
src/
  types.ts              Raw Spotify row type and the cleaned-up Play type
  data/parse.ts         Turns one raw row into a Play
  data/load.ts          Reads zip/JSON files, validates, dedupes
  data/sample.ts        Seeded fake history in Spotify's raw format
  data/stats.ts         Summary numbers, rankings, streaks
  data/insights.ts      Time bins, eras, race frames, sessions, artist graph, listener profile
  viz/record.ts         The vinyl drawing, shared by the chart and the poster
  viz/constellation.ts  The artist-graph layout, shared by the chart and the poster
  viz/poster.ts         Poster rendering (all three designs)
  lib/palette.ts        Chart colors (validated for colorblind separation on the dark surface)
  lib/dropFiles.ts      Drag-and-drop, including dropped folders
  components/           One file per visualization, plus Dashboard, PosterStudio and the landing sleeve
```

## License

[MIT](LICENSE). The bundled fonts (Bricolage Grotesque, Instrument Serif, JetBrains Mono) are under the [SIL Open Font License 1.1](https://openfontlicense.org).

## Disclaimer

On Record is an independent project, not affiliated with, endorsed by or sponsored by Spotify AB. Spotify is a trademark of Spotify AB.
