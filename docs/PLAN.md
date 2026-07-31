# FilmTable — plan and design

A personal TV series and movie tracker, a replacement for the shut-down TV Time.
No backend: all user data lives on the device (localStorage) + JSON backup
export/import.

## Platforms and stack

The goal is Android, iPhone and web from a single codebase, with no server and no
app stores.

**The choice: a mobile-first PWA** (React 19 + Vite 7 + TypeScript).

- Web — just open the URL.
- iPhone / Android — "Add to Home Screen": a full-screen app with its own icon,
  working offline (service worker), with data stored locally.
- No per-platform builds, and free static hosting (Netlify/GitHub Pages).
- A route to the stores in future: the same code wrapped in Capacitor → native
  APK/IPA.

Libraries: `react-router-dom` (HashRouter — works on any static host), `zustand` +
persist (state + localStorage), `vite-plugin-pwa` (manifest + service worker).
Everything else is hand-written CSS matching the TV Time design.

## APIs (free, no keys)

| API | What it provides | Limits | Why |
|---|---|---|---|
| **TVmaze** `api.tvmaze.com` | Show search, details, seasons/episodes with dates and air times, the airing schedule, images | no key, ~20 req/10s, CORS ✓ | Complete episode data — the heart of TV Time. Licensed CC BY-SA (we display attribution) |
| **iTunes Search API** `itunes.apple.com` | Movie search: poster, genre, runtime, release date, description | no key, ~20 req/min | The only decent movie API with no registration at all. For the web there is a JSONP fallback if CORS is not sent |

A deliberate trade-off: TMDB provides richer movie data but requires an API key →
the app would not work out of the box. The data architecture allows TMDB to be
added later.

## Data model (localStorage)

```
library (backed up):
  shows:  { [tvmazeId]: { status: following|stopped, watched: {epId: timestamp}, addedAt, lastWatchedAt } }
  movies: { [itunesId]: { movie snapshot..., status: watchlist|watched, watchedAt } }
cache (not backed up, refreshed):
  { [showId]: { show, episodes[], fetchedAt } }   // refresh every 12h
```

Derived data (not stored, computed): the next episode = the first aired unwatched
one; "+N" = how many more have aired after it; up to date; upcoming; time
statistics.

## Screens (structure = TV Time)

1. **Shows** — Watch List / Upcoming tabs
   - Watch List: the WATCH NEXT, NOT STARTED YET and HAVEN'T WATCHED FOR A WHILE
     (>30 days) sections; a card shows the poster, the show chip, `S03 | E01 +N`,
     the episode title and badges (PREMIERE/NEW), with the check button marking the
     episode (with Undo). A list/grid toggle.
   - Upcoming: upcoming episodes of my shows, grouped TODAY / weekday / LATER, with
     time+channel or "N DAYS", and PREMIERE/NEW/AIRED/LATEST badges.
2. **Movies** — Watch List (+ a WATCHED section) / Upcoming (unreleased, counting
   down the days).
3. **Explore** — search (shows/movies); with no query, Discover: AIRING TONIGHT and
   POPULAR THIS WEEK (an aggregate of the TVmaze schedule over 7 days, sorted by
   weight).
4. **Show page** — hero poster, metadata, x/y progress, "Check in: S03E01",
   accordion seasons with episode checkboxes and whole-season marking,
   Stop/Resume/Remove.
5. **Movie page** — poster, metadata, watchlist/watched, description.
6. **Profile** — statistics (TV time, episodes, movies), shelves by status,
   Export / Import / Reset, attribution.

## Design tokens (from TV Time screenshots)

- Background `#f2f2f2`, white r16 cards with a soft shadow, text `#111` / greys
  `#6f6f6f` `#9e9e9e`
- Accents: yellow `#ffd60a` (NEW, active chips), green `#30c554` (AIRED), black
  pills
- Top tabs: UPPERCASE, the active one black with a thick underline
- Grey pill section headings (WATCH NEXT), show chips with a border and a chevron
- `S03 | E01` — large bold typography; the check is a grey circle → black when
  marked
- Bottom navigation: Shows / Movies / Explore / Profile
- Dark theme — automatically from the system setting

## Manual testing before delivery

1. Search "silo" → add → Not started S01E01
2. Show page: mark seasons 1–2 → progress updates, Watch Next shows the next
   episode
3. Check in from a card → the episode advances, +N decreases, Undo reverts
4. Upcoming: grouping and day countdowns match the dates from the API
5. Movies: search, watchlist, watched, an unreleased film in Upcoming
6. Profile: the statistics add up, Export → Reset → Import restores
7. Reload the page — everything is still there (persist)
8. Build + preview: manifest, service worker, offline reload
9. iOS Simulator (Safari) and the Android emulator (Chrome): layout, safe area,
   PWA installation
10. A clean console across every flow

## Roadmap (after v1)

Capacitor wrappers for the stores • TMDB as an optional movie provider • CSV import
from a TV Time takeout • episode release notifications • sync between devices (a
file in the cloud).
