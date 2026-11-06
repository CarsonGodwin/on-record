# Contributing

Thanks for wanting to help with My Listening Record! Bug reports, fixes and ideas are all welcome, big or small.

## Found a bug?

[Open an issue](https://github.com/CarsonGodwin/on-record/issues). If it's about an export (Apple Music especially, since support is still new), it helps to know which service it came from and what looked off, like a count that seems wrong or a file that wasn't read.

Please don't attach your real listening history. Counts and screenshots of the problem are plenty, and if you want to share data, a few made-up rows work great.

## Getting set up

You'll need Node 22.

```bash
npm install
npm run dev       # Vite dev server on :5173
```

**Try the demo** on the landing page to explore with fake history, so you don't need your own export.

## Making a change

1. Branch off `main` and open a pull request back into `main`.
2. A short note on *why* you made the change helps reviewers a lot.
3. Before you open the PR, run:

   ```bash
   npm run lint
   npm test
   npm run build
   ```

   CI runs the same checks, plus the tests in a few time zones. If you're touching date logic, it's worth trying one non-UTC zone locally:

   ```bash
   TZ=Pacific/Auckland npm test
   ```

4. If you changed logic in `src/data/`, `src/lib/` or `src/viz/`, a test in `tests/` is appreciated.

## A few promises the site makes

Visitors are told their data stays on their device, so a few things are worth keeping in mind:

- **No network requests.** No `fetch`, external images, CDN fonts or analytics. The built site blocks them anyway.
- **Nothing stored.** No `localStorage`, IndexedDB or cookies.
- **No real listening data in the repo.** `data/sample.ts` and the helpers in `tests/` are there for demos and fixtures.
- **Private fields stay private.** Exports include things like IP addresses and device IDs, which the app deliberately never copies.
- **Only Apple Music files get opened** from an Apple export, and the loader's safety limits stay in place.

[AGENTS.md](AGENTS.md) goes into the details, plus the architecture and code conventions. It's written for coding agents but is a handy tour for people too.

## Style

- TypeScript is strict, so use `import type` for type-only imports.
- Reuse the existing CSS tokens and `lib/palette.ts` colors instead of adding new ones.
- Comments are best when they say *why*, in plain sentences.
- Posters are designed for a phone first, so big text and few words.

Not sure about something? Open an issue or a draft PR and ask. Happy to help.

## License

Contributions are released under the project's [MIT license](LICENSE).
