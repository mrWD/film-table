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

1. **No backend for user data.** The library lives on the device: IndexedDB in a
   browser, a JSON file in private app storage when running natively, and
   localStorage for small prefs. Both moves use the same one-way copy — read the
   old store once, write the new one, leave the old value frozen (see DECISIONS).
   No accounts, no analytics, no data collection. The only server code is a thin
   proxy to TMDB, which stores nothing.
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

# for the store builds — use this before `npx cap sync`, never plain `build`.
# It ships no service worker and destroys any already installed: inside the app
# every file is local anyway, and the worker's only effect was to keep serving the
# previous build after an update.
npm run build:native

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

## App Store / TestFlight (as of 2026-08-29)

The app record exists: **FilmTable**, Apple ID `6806612159`, bundle
`com.mrwd.filmtable`. Created by hand in App Store Connect — the public API
cannot create an app record, only read and update one.

**Version 1.0, build 2 is uploaded and shows "Ready to Submit".** Build 1 was rejected
on upload; see the traps below.

Filled in and saved:

- Category **Entertainment**, taken from `docs/STORE.md`
- Age rating **4+** — the seven-step questionnaire answered "none" or "no" throughout,
  which is accurate: the app carries no content of its own, has no web view, and nothing
  a person writes in it leaves the device
- Content Rights: **yes, it shows third-party content and the rights are in place**. The
  honest answer — the app displays covers, artwork and descriptions from its sources
  under their terms, and the attribution those terms require is on screen. Answering
  "no" would have contradicted the app's own attribution line
- **Test Information is filled**: beta description, feedback email, marketing URL,
  privacy policy URL, review contact and notes. The other two apps still need theirs.

**What is not done: open testing.** A public TestFlight link needs an *external* group,
and App Store Connect currently offers only "Create New Internal Group" — there is no
External Testing section in the sidebar at all. Everything known to gate it has been
checked and is in order: the Program License Agreement is accepted, the Free Apps
Agreement is Active, and the App Information above is complete. The Free Apps Agreement
was activated on the same day, so the most likely explanation is that the interface has
not caught up. If External Testing is still missing after that, the cause is something
else and worth looking for with those four already ruled out.

### Traps that cost time, in the order they bit

- **A widget extension without `CFBundleDisplayName` is rejected on upload**, error
  90360, and only after the whole binary has gone up. All three apps had the same
  omission.
- **The archive is signed for development; only the export carries the distribution
  signature.** `scripts/release-ios.sh` printed "Apple Development" for a perfectly
  good build because it read the archive. It now unpacks the `.ipa` and reads that.
- **The build number must rise every upload.** A repeat is refused after the transfer,
  not before.
- **`altool` times out on Apple's own endpoints** more often than not; the upload
  itself usually succeeds on a retry. One "failure" was only the report being cut off
  — the build was already there.
- **App icons must be flat squares.** These were drawn with an 18.4% corner radius on
  the light background, so the corners held `#f2f2f2`. Masking exactly on that radius
  left a pale halo — the boundary pixels are anti-aliased and half of what they hold is
  background — and a four-pixel inset just moved the halo onto the mask's own edge. The
  mask now sits twelve pixels inside. `scripts/full-bleed-icon.mjs` in film-table does
  it.

### Releasing

```bash
scripts/release-ios.sh 3      # the argument is the build number
```

Builds, signs, and checks the signature on the exported `.ipa`. Uploading is a separate
step and needs an App Store Connect API key — see `docs/RELEASE-IOS.md`. The key lives
in `~/.appstoreconnect/private_keys/` and nowhere in this repository.

## On-device AI (as of 2026-08-29)

Two separate things, both running on the phone and neither sending anything anywhere.

**The language model** (`lib/ai.ts`, `ios/App/App/AIBridge.swift`) is used only where it
reads text the app already has: the spoiler-free recap, the pasted-list import, the year
in words, and reading titles out of a "something like…" request when nothing in it was
capitalised. It is never asked what it knows. Measurements behind that rule are in
DECISIONS, and one more was added: asked to match a request against a list of real tags
it picked nothing in 18 runs out of 18, while asked to read a description it was handed
it is steady.

**Translation** (`lib/translate.ts`, `TranslateBridge.swift`) is Apple's Translation
framework, not the model — it runs from iOS 17.4 on any iPhone rather than the few with
Apple Intelligence, and it translates instead of improving the plot. It reaches the
framework through a zero-sized SwiftUI view because `translationTask` is a view modifier
and the headless session is iOS 26 only.

Two traps worth keeping:

- `navigator.language` and `Locale.current` report the app's own localizations, not the
  phone's setting. In an English-only app both say "en" on a Russian phone, and the
  translate button never appeared. `Locale.preferredLanguages` is the one that answers.
- The simulator reports Russian unsupported where the same Mac reports it supported. The
  device is the only place that answer can be read, which is why the hidden `/#/insights`
  page carries an "On this device" line — reachable in the app by five taps on the footer
  of Profile.

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
