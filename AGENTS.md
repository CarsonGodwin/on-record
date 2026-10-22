# AGENTS.md

Guidance for coding agents working in this repo. The [README](README.md) covers what the app does and the file layout; this file covers how to work on it.

## What this is

On Record is a client-only React 19 + Vite + TypeScript app that visualizes a Spotify Extended Streaming History export. There is no backend. Data is parsed, aggregated and drawn entirely in the browser, and the built site's CSP sets `connect-src 'none'`.

## Commands

```bash
npm install
npm run dev       # Vite dev server on :5173
npm test          # Vitest, tests/ only
npx vitest run tests/data/stats.test.ts   # one file
npx vitest run -t 'filterPlays'           # tests whose name matches
npm run lint      # oxlint (.oxlintrc.json)
npm run build     # tsc -b, then vite build to dist/ (also prerenders the landing page)
```

Before calling a change done, run `npm run lint`, `npm test` and `npm run build`. CI runs the same, plus `npm audit --omit=dev --audit-level=high`, with tests repeated under `TZ=UTC`, `America/Los_Angeles`, `Asia/Kolkata` and `Pacific/Auckland`. For date logic, check at least one non-UTC zone locally:

```bash
TZ=Pacific/Auckland npm test
```

## Hard rules

- **No network.** Never add `fetch`, external images, CDN fonts, analytics or anything else that leaves the page. Cover art is generated from names; fonts are bundled through `@fontsource`. The CSP in [vite.config.ts](vite.config.ts) blocks this anyway, so a change that needs a request will break in production even if it works in `npm run dev` (dev has no CSP).
- **Nothing is stored.** The landing page promises nothing is uploaded or stored. Settings such as Music only and hidden artists live in React state and reset with the page; don't add `localStorage`, IndexedDB or cookies to keep them.
- **Never commit real listening data.** `.gitignore` excludes Spotify exports; use `data/sample.ts` (seeded fake history) for demos and fixtures.
- **Don't copy private fields.** `RawStreamRecord` leaves out `ip_addr`, `user_agent`, `username` etc. on purpose, and `toPlay()` must never copy them.
- **Keep the loader's safety caps** (`MAX_FILE_BYTES`, `MAX_ENTRIES`, … in `data/load.ts`). They guard against zip bombs in the visitor's tab.
- If you change the CSP, update both the meta tag and the `_headers` output in `vite.config.ts` (they share the `CSP` constant).

## Architecture

- `src/types.ts`: `RawStreamRecord` (Spotify's row) and `Play` (the cleaned row every chart uses). `Play.endTime` is when playback **stopped**; use `startDate()` from `data/stats.ts` for the start.
- `src/data/`: pure functions. `parse` → `load` (zip/JSON, validate, dedupe, sort by `endTime`) → `stats` / `insights` (aggregations). No React here.
- `src/viz/`: canvas/SVG drawing shared between on-screen charts, posters and the race video. `posterShared.ts` holds helpers for all posters and the video.
- `src/lib/`: small shared utilities (formatting, palette, hooks, pointer/zoom, seeded random, the launcher's shortcut (`keys`), word-start search and list selection, The Long Play's stage context and stop lookup).
- `src/components/`: one file per visualization, plus `Dashboard` (layout, filters and year picker), `Launcher` (the ⌘K launcher and its pages), `Panels` (the shared `<dialog>` `Modal` and Settings), `PosterStudio`, `DropZone` (landing), `Hero` (the summary at the top of the dashboard), and `Tour`/`NeedleDrop` (The Long Play). `App.tsx` lazy-loads `Dashboard` so the landing page stays light.
- `src/index.css`: one global stylesheet with BEM-ish class names (`landing__glow`) and design tokens on `:root`. Use the existing tokens (`--bg`, `--text`, `--muted`, `--display`, `--serif`, `--mono`, …) rather than new literals.

## Conventions

- **Local time everywhere.** Aggregations bin by the viewer's local day and hour. Use the helpers in `data/stats.ts` (`dayNumber`, `fromDayNumber`) instead of hand-rolled ms/day maths, which breaks across DST.
- **Determinism.** Randomness goes through `lib/random.ts` (`hashString`, `mulberry32`) so covers, layouts and the sample data are stable across renders and test runs.
- **Colors** come from `lib/palette.ts`. `SERIES` order is validated for colorblind separation; don't reorder or add ad-hoc chart colors. `assignColors` keeps an artist's color stable when the year changes.
- **Filters.** `Dashboard` applies Music only and hidden artists first (`filterPlays` in `data/stats.ts`, giving `all`), then the year picker (giving `plays`). Every listening view follows both, with all-time context from `all` where a chart needs it (first listens, colors); the launcher's artist lists span every year. New views should take the already-filtered plays rather than filtering themselves. Hiding always leaves at least one music artist (`canHide`), so Music only can never empty the page.
- **Retained selection state.** A chart that keeps an index or a position into data a filter can reorder or remove (a pinned song, a hovered bin, a finished race video) gets `key={viewKey}` in `Dashboard`. That key changes with the year and with every filter change that reaches the charts, so the chart starts over instead of leaving the index on a different item or past the end. State that names what it points to and checks it's still there, like Calendar's picked day or Constellation's pinned star, doesn't need a key, and neither do indices into fixed slots like Clock's 24 hours.
- **The Long Play's position is a stop id**, resolved with `resolveStop` in `lib/stage.ts`, so a filter or year change that shortens the tour can't strand it.
- **Dialogs** use `Modal` from `components/Panels.tsx`. Key events stay inside it (only ⌘K/Ctrl K passes through, see `isLaunchKey`), so The Long Play's window listeners don't act behind it, and Escape asks the owner what closing means: the launcher steps back to its main list before it closes.
- **Text alternatives.** Some charts have a `*Table` sibling (`ClockTable`, `ConstellationTable`, `LoveHateTable`, `RiverTable`) that `Dashboard` passes to `Chapter`'s `table` prop, which adds a "Show table" toggle.
- **Phones are a first-class target.** Use `lib/pointer.ts` (`COARSE`, `PHONE`, `useHoldDrag`) and `useMediaQuery` for touch/size differences, and respect `prefersReducedMotion()` for animation.
- **The landing page is prerendered** with `renderToString` at build time. Code reachable from `App.tsx` at module load must not touch `window`/`document` unguarded.
- **TypeScript** is strict about unused locals/params and uses `verbatimModuleSyntax`: use `import type` for type-only imports. `erasableSyntaxOnly` is on, so no `enum` or parameter properties.
- **Comments** explain *why* in plain sentences (see `lib/palette.ts`, `vite.config.ts`). Match that tone; don't narrate the obvious.

## Tests

- Vitest, under `tests/{data,lib,viz}`, mirroring `src/`. Components aren't unit-tested; keep logic in `data/`, `lib/` or `viz/` where it can be.
- Build fixtures with `tests/helpers.ts`: `at(year, month, day, hour?, minute?)` (1-based month, local time), `play(start, overrides)` and `sorted(plays)`. Tests must pass in any time zone.

## Product and design taste

- **The Long Play is hands-on.** Guided flows reuse the live chart components with a tip per stop and explicit, user-paced Next. No auto-advancing slideshows or passive replicas.
- **Posters are designed for a phone first** (an Instagram story is about 390pt wide). Keep text large (roughly 3% of the poster width or more) with few words, and explain the record's encoding (ring = day, angle = time of day) on the poster itself. Avoid generic "AI design" moves: letterspaced mono caps labels, soft glows, film grain, gimmick stickers, `·`-separated stat strings.

## Git

- Work on a feature branch and open a PR into `main`.
- GitHub Actions are pinned to commit SHAs; keep them pinned when editing `.github/workflows/`.
