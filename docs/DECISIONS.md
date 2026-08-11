# Decisions taken

Why things are the way they are. Useful for not re-arguing what has already been
discussed and not stepping on rakes we have already climbed off.

## A PWA instead of native apps

The requirement was Android, iPhone and the web. A PWA delivers all three from one
codebase, with no app stores, no review process and free static hosting. The price:
no push notifications on iOS, and installation via "Add to Home Screen". The route
to the stores, if ever wanted, is Capacitor with the same code.

## No backend for user data

The library lives on the device. Consequences we deliberately accepted: no sync
between devices (manual Export/Import instead), data is tied to the domain (so
moving to another domain requires a migration), and we cannot lose anyone's data
because we do not have it. The last point also disposes of GDPR questions.

## IndexedDB instead of localStorage (2026-08)

Originally the device store was `localStorage`. Two of its limits started to
matter on the road to phones: the ~5 MB ceiling (the reason movie descriptions
were stripped and a quota guard existed), and iOS, where a wrapped WebView's
localStorage is the first thing the OS reclaims — while IndexedDB is both
sturdier and what a native storage plugin migrates from. The owner approved the
change explicitly (2026-08-11).

`library` and `cache` moved to IndexedDB (`filmtable-kv`, adapter in
`lib/idb-storage.ts`); tiny prefs (`theme`, `region`, `stats`) stay in
localStorage — `theme` must be readable synchronously or the first paint
flashes the wrong theme. The migration copies the old localStorage value into
IndexedDB on first read and leaves the original untouched, frozen at the
migration moment: rolling back to an older build then finds the library as of
that moment rather than nothing. Hydration became asynchronous, so `main.tsx`
holds the first render until it settles (a few ms, with a 2.5 s backstop).

## Sources complement each other rather than replacing one another

The owner's idea, and it turned out to be right. No single source covers
everything: TVmaze has the best episode data but limits search to ten results;
Cinemeta has a full catalogue with posters but no availability guarantees; iTunes
has a broken movie filter; TMDB is good at everything but requires a key. Merging
with timeouts gives the best of each and survives the failure of any one of them.
Details and measurements are in DATA-SOURCES.

## A proxy to TMDB, not a key in the client

A key in the client bundle of a public repository is a key published forever.
GitHub Pages cannot host server code at all, hence Vercel with a serverless
function. The proxy brings a second win too: the edge cache saves quota.

An important limitation to understand: the proxy protects the **key**, but makes
**access** public — anyone can call our endpoint. Hence the path allowlist, the
Origin check and the cache. That reduces abuse but does not make the API private.

## The design was steered away from TV Time

The interface was originally reproduced from TV Time screenshots — that was the
plan. Before the public post we decided to diverge: our own section headings (UP
NEXT / NOT STARTED / BEEN A WHILE / CAUGHT UP), the `3×01` episode format instead
of their `S03 | E01`, a purple accent instead of yellow, and our own section
titles.

The reason: ideas and functionality are not protected, but verbatim labels plus a
recognisable layout together read as a copy of somebody else's trade dress, and a
public post draws attention to that. After the divergence, a complaint has
practically nothing to hold on to. **Do not bring back TV Time's elements.**

A "not affiliated with TV Time or Whip Media" disclaimer and the MIT licence were
added at the same time — the latter primarily for the "AS IS, no warranty" clause.

## Donations

The links (Buy Me a Coffee, Ko-fi, PayPal, the `ipupok` account) were taken from
the owner's neighbouring project `~/Projects/double-subtitles`. **If they change
there, they must be updated here too**, in `src/components/Support.tsx`.

The fan button sits at the bottom **left**, and that is not aesthetics. Measured:
on the right the floating button covered the check-in or the "plus" at **42% of
scroll positions**, on the left at 0%, because the right column is occupied by the
app's main action.

An open question: the TMDB key was obtained with a "generates no revenue"
certification, while the app has a tip button. Formally that is a grey area. The
worst case is the TMDB key being revoked (the app does not break — the fallback
takes over). The alternative that was proposed and that the owner has not chosen
yet: remove the button from the app and keep the links in the README and the post.

## Recommendations are content-based

Collaborative filtering requires other users' behaviour, meaning a backend, which
we deliberately do not have. Content-based on genres works well enough for a
personal tracker. Algorithm details are in ARCHITECTURE.

## Statistics are local only

The hidden `/insights` page counts usage on **this device**. Real site traffic
requires server-side aggregation, and the project deliberately has no backend for
user data.

Traffic across all users is covered by **Vercel Web Analytics** (enabled
2026-07-26, Hobby plan: 50,000 events per month, 30 days of history). No cookies
and no personal data; viewed in the Vercel dashboard. The alternative was our own
counter in a serverless function with storage — rejected: we would have had to
decide what exactly to store about visitors.

Aggregated numbers cannot be shown inside the app without a server token, so
`/insights` and the Vercel dashboard are two different screens rather than one.

## Rakes already stepped on

- **Clicks on cards.** Cards are `<Link>`s, and buttons inside them need both
  `stopPropagation` and `preventDefault`, otherwise a tap on the "plus" navigates
  away.
- **Nested `<button>`s.** A season heading with a checkbox inside it is invalid
  HTML and React complains in the console. Split into sibling elements.
- **Horizontal scrolling.** CSS Grid items default to `min-width: auto`, so a long
  title in the poster grid stretched the page by 206px. Cured with `min-width: 0`.
  Check overflow **at a width of 375px** — the bug is invisible in a wide window.
- **`"type": "module"`.** A Vercel function must be ESM (`export default`);
  CommonJS does not run in this repository.
- **The catch-all route on Vercel.** `api/tmdb/[...path].js` only matched a single
  segment: `/api/tmdb/x` reached the function (answering 403), while
  `/api/tmdb/search/movie` was served a 404 as a static file. Cured by dropping
  catch-all — the path is passed as a `?path=search/movie` parameter to an ordinary
  `api/tmdb.js` file.
- **Ports in the proxy allowlist.** Hard-coded localhost ports break the check when
  the dev server runs on a different port — any loopback is allowed.
- **Identical recommendation explanations.** Taking the globally heaviest titles
  puts the same phrase under every card. Compute the overlap per card.
- **Side effects in zustand reducers.** A counter called inside `set((s) => ...)`
  fires twice under StrictMode. Keep them outside, before or after `set`.
- **Analytics and HashRouter.** Vercel Web Analytics only sends an event on a full
  page load: navigating by changing the hash does not count, so there will be no
  per-screen funnel. `beforeSend` is still needed — without it the single event
  arrives as `/` instead of the real entry screen.
- **The service worker hides a fresh deploy.** After a release the browser keeps
  serving the old build from the precache. Check production after a deploy only
  after `unregister()`-ing the service worker and clearing `caches`, otherwise it
  is easy to mistake the cache for a failed deploy.
- **Screenshots taken during loading.** Posters load lazily; empty tiles in a
  screenshot more often mean "not loaded yet" than breakage. Check `naturalWidth`
  rather than trusting your eyes.
