# FilmTable — project context

This file is read automatically at the start of every session. It holds what
cannot be derived from the code: why a given decision was made and which pitfalls
have already been hit.

Details live in `docs/`:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code structure, data model, flows
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — the APIs, their quirks, what
  substitutes for what
- [docs/DECISIONS.md](docs/DECISIONS.md) — the decisions taken and their reasons
- [docs/PLAN.md](docs/PLAN.md) — the original plan (a historical document)

## What this is

A personal TV series and movie tracker, written after TV Time shut down. A PWA:
one codebase runs on Android, iPhone and the web, installs to the home screen and
works offline.

The owner and, as of today, the only target user is **mrWD** (Viktor,
`lvigtor@gmail.com`). The project is free and open, with a donation button.

**Production:** <https://mrwd.github.io/film-table/> · **Repository:**
`mrWD/film-table`

## Core principles (break only with the owner's explicit consent)

1. **No backend for user data.** The library lives in the device's
   `localStorage`. No accounts, no analytics, no data collection. The only server
   code is a thin proxy to TMDB, which stores nothing.
2. **The app must work without keys.** TMDB is an enhancement, not a dependency.
   If the proxy is unavailable or the key is unset, movie search silently switches
   to Cinemeta/iTunes. That fallback must not be broken.
3. **Its own visual identity.** The interface originally copied TV Time and was
   deliberately steered away from it (see DECISIONS). Do not bring back their
   section headings, yellow accent or the `S03 | E01` format.
4. **Secrets only in environment variables.** The TMDB key lives in the Vercel
   dashboard. It never goes into the repository, the client bundle or chat.

## How to run

```bash
npm install
npm run dev                       # :5173, without TMDB — runs on Cinemeta/iTunes
npm run build && npm run preview  # :4173

# with TMDB: needs .env.local with TMDB_API_KEY (the file is in .gitignore)
node --env-file=.env.local scripts/dev-api.mjs      # proxy on :3001
VITE_API_BASE=http://localhost:3001 npx vite        # a frontend that knows about the proxy
```

`node scripts/gen-icons.mjs` regenerates the PNG icons from `public/favicon.svg`.

## How to verify

There are no automated tests. Verification is manual, through the browser panel at
mobile width (375px), and it is a mandatory part of any noticeable change. Worth
running:

- search in all three tabs (ALL / SHOWS / MOVIES) for `the matrix`, `spider-man`,
  `star trek` — these caught real bugs in the sources;
- checking in an episode from a card and from the show page, plus Undo;
- Explore with no query: the For you, Coming to theaters and Airing tonight
  sections;
- the hidden `/#/insights` page (usage counters, not linked from navigation);
- both themes and **horizontal overflow**
  (`document.documentElement.scrollWidth` against `clientWidth` — must be 0; this
  already caught a CSS Grid bug);
- a clean console.

Useful: the iOS simulator (`xcrun simctl openurl <udid> <url>`) and the Android
emulator (`adb shell am start -a android.intent.action.VIEW -d http://10.0.2.2:4173/`).

## Status (as of 2026-07-26)

Everything is merged into `main` and no branches are awaiting review:
`design-divergence` and `vercel-tmdb` were merged by the owner. The move to Vercel
is done and `TMDB_API_KEY` is set. The branches still exist in the repository but
lag behind `main` — do not work from them.

Two live addresses, **both fully functional** — why the old one is not switched
off is in [docs/DEPLOY.md](docs/DEPLOY.md):

| Address | Role |
|---|---|
| <https://film-table.vercel.app> | primary, with its own `/api/tmdb` proxy |
| <https://mrwd.github.io/film-table/> | the previous one; reaches TMDB through the Vercel proxy via `VITE_API_BASE`, so it is not cut down |

Contacts inside the app (Profile → Feedback & contact): `lvigtor@gmail.com` and
<https://www.linkedin.com/in/viktor-lavrov>. The form does not send anything by
itself — it assembles a `mailto:` and hands it to the mail client; there is no
backend for it and none may be added.

## Open questions

- The TMDB key was once shared in chat — the owner intended to reissue it, but
  there was no confirmation.
- The fate of the in-app donation button under TMDB's "personal use / no revenue"
  certification (see DECISIONS).
- LinkedIn post texts are written (FilmTable and GamesTable) but not published.
- The app has Vercel Web Analytics: no cookies, screen name only. That is a
  **departure** from the original "no analytics" principle — when stating anything
  publicly, do not claim there is no analytics at all.
- `.chips-hint` and `.attribution` give 3.99:1 in the dark theme — below the AA
  threshold. The owner has been told; he did not order a fix.

## Tone with the owner

Reply in Russian. He values verified facts over assumptions: before claiming
anything about an API's behaviour, make the request and show the numbers. He asks
about legal risks — answer honestly, with the caveat that this is not legal
advice. Do large changes in a separate branch and let him review before merging.
