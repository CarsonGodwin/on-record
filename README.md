# My Listening Record
[![Live site](https://img.shields.io/badge/live-mylisteningrecord.com-blue)](https://mylisteningrecord.com)

Turn your Spotify or Apple Music streaming history into an interactive vinyl record and a dozen other visual charts. 

Everything runs entirely in your browser. There are no servers, and your data is never uploaded or saved. 

![on-record — every day of your Spotify or Apple Music listening, pressed into vinyl](./on-record-demo.gif)

## Features
* **The Record:** Every day of your listening history pressed into a single vinyl groove.
* **The Race & Eras:** Animated bar charts and streamgraphs tracking your top artists over time.
* **Every Day:** A calendar heatmap. Pick any specific date and see exactly what you played.
* **Constellation & Pulse:** Force-directed maps of your listening scenes and ridgeline charts of when you discovered new music.
* **Exportable Posters:** Generate and download custom, high-res posters of your stats in multiple formats (Instagram Story, 4:5 post, or print).

## How to Get Your Data

**Spotify**
1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and request your **Extended streaming history**.
2. Wait for the download link via email (can take up to 30 days).
3. Drag and drop the downloaded `.zip` file directly onto the site.

**Apple Music** *(Beta)*
1. Go to [privacy.apple.com](https://privacy.apple.com/), choose **Request a copy of your data**, and check **Apple Media Services information**.
2. Wait for the email link (usually takes a few days).
3. Download all parts and drop them (or the `.zip` files) onto the site.

**Last.fm** *(Beta)*
1. Save your scrobbles with [lastfm-to-csv](https://benjaminbenben.com/lastfm-to-csv/), and wait until it says finished. Any `.csv` with four columns and no header works: artist, album, track and a UTC time like `06 Nov 2026, 20:57`.
2. Drop the file onto the site by itself (a CSV inside a zip or folder isn't opened).

Last.fm records what started and when, and nothing else, so it differs from the other two:

| | Spotify | Apple Music | Last.fm |
|---|---|---|---|
| Time played | Recorded | Recorded | Estimated from the gaps between scrobbles |
| Skips | Recorded | Recorded | Never recorded, so Love / Hate and the skip stats are off |
| Shuffle | Recorded | Newer plays only | Not recorded |
| Devices | Recorded | Recorded | Not recorded |
| Podcasts and audiobooks | Recorded | Not in the export | Can't be told apart from songs |

*Note: You can drop exports from several services in together to merge your timelines. On any day a Spotify or Apple Music export covers, its plays replace Last.fm's, since Last.fm usually scrobbled those same listens.*

## Project Structure

```text
src/
├── components/    # Visualization widgets, tour deck, and navigation UI
├── data/          # File parsing (JSON/CSV), stream deduping, and stats engines
│   ├── load.ts    # Archive unpacker, format detection, and stream validation
│   ├── apple.ts   # Apple Music reconciliation (track heuristics, split-joins)
│   ├── lastfm.ts  # Last.fm scrobble exports (format check, estimated durations)
│   └── stats.ts   # Metric aggregation (streaks, listening curves, ranks)
├── viz/           # Canvas renderers, vinyl drawing math, and poster generators
│   ├── record.ts  # Vinyl groove projection and tonearm kinematics
│   ├── poster.ts  # High-res print and social poster layouts
│   └── raceVideo.ts # In-browser 9:16 video encoding pipeline
└── lib/           # Color palettes (colorblind-safe), touch gestures, and state
```

## Local Development

Built with React and Vite.

```bash
npm install
npm run dev       # Start local server
npm test          # Run Vitest tests
npm run build     # Type-check and build to dist/
```

## License & Legal

Distributed under the [MIT License](LICENSE). Bundled typefaces (*Bricolage Grotesque*, *Instrument Serif*, *JetBrains Mono*) are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

*My Listening Record is an independent project and is not affiliated with, endorsed by, or sponsored by Spotify AB, Apple Inc. or Last.fm Ltd.*
