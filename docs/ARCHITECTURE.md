# Architecture

## Stack

React 19 + TypeScript + Vite. State is zustand (with `persist` wherever it needs
to survive a reload). Routing is `HashRouter`: a hash works on any static host
with no server-side rules, GitHub Pages included. Styling is hand-written CSS with
tokens, no framework. PWA via `vite-plugin-pwa` (manifest + service worker). There
are no automated tests.

## Code map

```
api/tmdb.js             serverless proxy to TMDB (Vercel only)
scripts/dev-api.mjs     the same proxy locally, for testing without deploying
scripts/gen-icons.mjs   PNG icons from favicon.svg

src/lib/
  types.ts        domain types (ShowSummary, Episode, Movie, TrackedShow, BackupFile)
  api.ts          TVmaze + Cinemeta + iTunes; source merging lives here too
  tmdb.ts         a client for our proxy; disables itself if the proxy is absent
  genres.ts       reconciles the genre vocabularies of the three sources into one
  format.ts       formatting of dates, runtimes and episode codes

src/store/
  library.ts      THE single source of truth about the user (persist)
  cache.ts        cache of shows and episodes from TVmaze, 12h TTL (persist)
  theme.ts        theme selection (persist)
  explore.ts      search and curated list state (in memory)
  recommend.ts    taste profile, candidates, recommendation scoring (in memory)
  stats.ts        usage counters for the hidden /insights page (persist)
  selectors.ts    ALL derived logic — pure functions, no state

src/components/   Icons, ui (primitives), cards (list rows), Support, MigrationBanner
src/pages/        Shows, Movies, Explore, ShowDetail, MovieDetail, Profile, Insights
```

## Data model

There are two independent keys in `localStorage`.

**`filmtable-library-v1`** — what belongs to the user and goes into the backup:

```ts
shows:  { [tvmazeId]: { id, addedAt, status: 'following'|'stopped',
                        watched: { [episodeId]: timestamp }, lastWatchedAt } }
movies: { [movieId]: { id, title, poster, genre, runtimeMin, releaseDate,
                       description, addedAt, status: 'watchlist'|'watched', watchedAt } }
```

**`filmtable-cache-v1`** — the TVmaze cache; it is not part of the backup and
rebuilds itself:

```ts
entries: { [tvmazeId]: { fetchedAt, show: ShowSummary, episodes: Episode[] } }
```

The key point: **progress is stored as a set of watched episode ids**, not as "the
current episode". That way episodes moving between seasons, inserted specials and
out-of-order viewing do not break the state. Everything else is derived and
computed on the fly in `selectors.ts`.

Movie identifiers from different sources are distinguished by prefix: `tmdb:603`
is TMDB, `tt0133093` is Cinemeta/IMDb, and a bare number is the old iTunes.
`lookupMovie()` picks the source from the prefix, so records added earlier keep
working.

## How progress is computed

`buildWatchItem()` in `selectors.ts`:

1. aired episodes = those whose `airstamp` is in the past;
2. next = the first aired unwatched one;
3. `+N` = how many more aired unwatched episodes follow it;
4. the section is chosen like this: nothing watched → NOT STARTED; last watch more
   than 30 days ago → BEEN A WHILE; nothing unwatched left → CAUGHT UP; otherwise
   UP NEXT.

## Recommendations

Content-based, entirely on the client (`store/recommend.ts`):

1. **The taste profile** — a genre vector built from the library. A show's weight
   is `1 + log2(1 + number of watched episodes)`, ×1.5 if watched in the last 30
   days. A watched film is 1.5, one on the watch list is 0.5. **A dropped show
   contributes a negative weight** — otherwise the system pushes what has already
   been rejected. The weight is divided by the number of genres so that a title
   with five genres does not outweigh a focused one.
2. **Candidates** — Cinemeta genre catalogues
   (`/catalog/{type}/imdbRating/genre=X.json`) for the profile's 3–4 leading
   genres.
3. **Scoring** — `0.6 × cosine(genres) + 0.25 × rating + 0.15 × year proximity`.
   Anything already in the library is excluded by IMDb id and by normalised title.
4. **Candidate shows are resolved back to TVmaze** by IMDb id, otherwise they
   cannot be tracked episode by episode.
5. **The explanation** ("Because you watch X and Y") is computed for each card
   separately, from the maximum genre overlap with a specific library title. Taking
   the globally "heaviest" titles is not acceptable: the same phrase then appears
   under every card and reads as a placeholder (we have been there).

There is no collaborative filtering ("people who watched X…") — that requires
other users' data, which means a backend.

## Feedback without a backend

The form on Profile does not send anything by itself: it assembles a `mailto:` and
hands it to the device's mail client. Nothing goes out until the person hits send
in their own client, and the text they typed is not stored anywhere — the "no
backend for user data" principle still holds. Next to it, in plain text, are the
email address and a LinkedIn link: on a device with no mail account configured,
`mailto:` does nothing.

## Where to watch

Streaming availability comes from the JustWatch feed via TMDB. That is **not** the
same as the network in the subtitle: the network says who made it and where it
aired, not where it can be watched today.

Licences are per-country, so the country comes from a profile setting and defaults
to the browser locale (`navigator.languages`) rather than geolocation: the locale
is already present in every request, and there is no reason to ask for
coordinates.

Shows in the library are keyed by TVmaze id while providers live in TMDB, so a
`TVmaze → IMDb → TMDB` bridge is needed: TVmaze's `externals.imdb` is already
picked up during parsing, then `find/{imdb_id}`. In a sample of ten shows, all ten
had an IMDb id.

**JustWatch attribution is mandatory** under TMDB's terms and is rendered next to
the results — it is not decoration and must not be removed.

The `watch/providers` and `find/tt…` paths were added to the proxy allowlist
separately; the provider cache is shorter (6 hours) because licensing deals change
over days, not months.

## The year in review

It is computed entirely from the library: every watch mark already stores the time
it was set, so no log and no server are needed — the numbers were always there,
nobody had just added them up. Episodes with no cached metadata still count: the
fact that they were watched is known even when the runtime is not, and dropping
them would understate the year.

## Storage: how much fits and what is wrong with it

Measurements in Chromium (July 2026): localStorage caps out at **4.94 MB** per
origin, even when `navigator.storage.estimate()` reports 10 GB — it has its own
quota.

Shows are stored by id rather than as a snapshot, so the heavy part is only the map
of watched episodes: **24 B per episode**. All 802 episodes of The Simpsons come to
19 KB; 300 shows at 60 episodes each is 422 KB, 8% of the limit. A film is **192 B**
as a snapshot; the description added that much again and more.

Three things follow from this, and all three are already done:

- **`description` is not written to storage.** It is re-fetched every time the
  detail page opens and is never shown in lists, yet it tripled the size of a
  record. It is stripped via `partialize` and kept in memory for the session. For
  records added earlier, the description disappears on the very first write to the
  library — `partialize` applies to the whole store at once.
- **`QuotaExceededError` is caught.** Without that, the exception was thrown in the
  middle of an update, the change was silently lost, and the person found out much
  later.
- **The app offers to install itself to the home screen.** This is not marketing:
  Safari clears script storage for sites that have not been visited in a while, and
  the rule does not apply to installed apps. That is what the prompt's text says.

The cost of writing is not a problem: zustand serialises the whole store on every
change, but at 2,000 records (2.5 MB) that is 4.5 ms to serialise and 1.8 ms to
write — imperceptible.

The real risk is not size but loss: storage is wiped along with browser data. That
is why Export/Import is insurance rather than decoration, and the profile reminds
you to back up once there are enough records to miss.

## The hidden /insights page

It is not linked from any navigation item and opens only at `/#/insights`. It shows
this device's usage counters: sessions, active days, screens opened, which source
answered and how many times it failed, check-ins, plus a technical panel (install
mode, service worker state, storage used, build stamp).

The counters live in `filmtable-stats-v1` and are **not part of the library
backup**. Only numbers are stored: no search queries, no titles, no identifiers —
nothing that describes a person. Nothing leaves the device.

Important: counter side effects must sit **outside** zustand reducers. Inside
`set()` they run twice under StrictMode and double the numbers.

This is single-device statistics. Site-wide traffic across all people cannot be
counted this way — that needs server-side aggregation (see DECISIONS).

## Analytics

`src/components/Analytics.tsx` — Vercel Web Analytics: anonymised page views, with
no cookies and no persistent identifiers. Two details, without which it would be
useless or noisy:

- it only renders on Vercel domains — Vercel serves the script itself, and on
  GitHub Pages it would simply 404;
- `beforeSend` rewrites the address, because with HashRouter the screen lives in
  the fragment and analytics cannot see the fragment: without this, every view
  would arrive as `/`. It also collapses `/show/:id` and `/movie/:id` into `/show`
  and `/movie`, otherwise the report would turn into a list of titles — and that is
  already data about what a person watches.

**A limitation verified on the live project:** an event is only sent on a full page
load. Changing screens only changes the fragment, the component does not treat that
as navigation, and no new views arrive — the report shows the **entry screen**, not
the whole path. Custom events could work around it, but they are unavailable on the
Hobby plan, and switching to BrowserRouter would break GitHub Pages, where there
are no server-side rewrites.

Hence the split: Vercel answers "how many people, from where, on what", while
per-screen statistics live in the local `/insights`. Look at the numbers in the
Vercel dashboard; they cannot be shown inside the app, which would need a server
token.

## The TMDB proxy

`api/tmdb.js` is a Vercel ESM function (`package.json` has `"type": "module"`;
CommonJS will not work there). It has exactly three jobs: keep the key out of the
browser, allow only read-only movie paths, and cache responses at the edge. It
checks the `Origin` (any loopback plus the production domains), returns 403 for a
disallowed path and 503 if the key is unset — the client reads 503 as "there is no
TMDB here" and switches to the key-free sources.

The TMDB path is passed as a parameter: `/api/tmdb?path=search/movie&query=...`,
not as URL segments. A catch-all file (`api/tmdb/[...path].js`) on Vercel only
matched a single segment, so `/api/tmdb/search/movie` returned 404 without ever
reaching the function.

TMDB images are served directly from `image.tmdb.org`. **There is no need to proxy
images through us** — that would turn us from someone who links to someone who
distributes third-party content.

## PWA

The service worker caches static assets (precache) and external responses
(runtime): TVmaze and Cinemeta/iTunes use `NetworkFirst` with a timeout, and
posters use `CacheFirst` for 30 days. That is why the app opens and shows the
library offline.

The theme is applied by an inline script in `index.html` **before the first paint**,
otherwise the screen flashes white when the dark theme is pinned.

The build knows about the subpath: `BASE_PATH=/film-table/` for GitHub Pages, empty
for the root.
