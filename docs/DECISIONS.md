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

`library` and `cache` moved to IndexedDB (`filmtable-kv`, adapter now
`createDeviceStorage` in `tables-core`); tiny prefs (`theme`, `region`, `stats`) stay in
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

## Wrapped for the stores with Capacitor (2026-08)

The same Vite build, inside a native shell: `webDir` is the ordinary `dist`, so
a release is `npm run build` plus `npx cap sync`. `HashRouter` already suited the
`capacitor://localhost` origin, so routing needed nothing.

The library moved again, from IndexedDB to a JSON file in private app storage
(`createDeviceStorage` in `tables-core`). A WebView's IndexedDB is *site data* to
the OS: iOS may reclaim it under storage pressure and "Offload App" discards it,
while a file in the app container survives both and rides along in the device
backup. Same one-way copy as before — read once, write the file, leave the old
value frozen.

Two findings from the pilot, both already paid for:

- **Every browser test for installedness answers "no" inside the WebView**, so
  the app offered to add itself to the home screen while already installed.
  `isNativeApp()` in `tables-core` is the fix.
- **The status bar icons follow the system, not this app's theme.** Measured on
  targetSdk 36: the web view is inset by 24 CSS px top and bottom,
  `env(safe-area-inset-*)` reads 0, and those strips are painted with the window
  background — which comes from the `DayNight` theme and so follows the system.
  Driving the icons from the app's theme puts white icons on a white strip the
  moment someone picks Dark on a light phone. Known cost: with the theme
  overridden against the system, those strips keep the system's colour.

The native build reaches the TMDB proxy by absolute URL — there is no origin for
it to be same as. `VITE_API_BASE` still wins; the fallback to the production
address keeps a store build from silently losing TMDB. The proxy needed no
change: its origin check parses `capacitor://localhost` to the host `localhost`,
which its loopback rule already permits (verified against production).

## Home-screen widgets (iOS)

The first part of the app that is **not** shared React: a widget runs in its own
process and cannot render a WebView. iOS needs a WidgetKit extension in Swift, so
`ios/App/FilmTableWidget/` holds the SwiftUI, and `ios/App/App/WidgetBridge.swift` is a
small in-app Capacitor plugin that hands it data.

The two processes meet in an **App Group** (`group.com.mrwd.filmtable`): the app writes a snapshot
there as JSON, the widget only reads. `src/lib/widget.ts` builds that snapshot from
the same store the screens read, so the widget cannot drift into disagreeing with
the app. Covers are copied in as files because WidgetKit cannot fetch images.

Nothing leaves the device — an App Group is on-device storage shared between two of
our own processes.

Things that cost a rebuild each, all of which look like "nothing happens":

- **`capacitorDidLoad()` does not exist** in this Capacitor version. The override
  compiles, never runs, and the plugin reports "not implemented on ios".
  Registration goes in `viewDidLoad`; check the shipped framework header before
  trusting a hook name.
- **`SceneDelegate` builds the root controller in code**, so editing the
  storyboard's custom class changes nothing.
- **The team must be set in the project**, not only on the `xcodebuild` command
  line. Without it Xcode's Signing & Capabilities editor refuses to load the
  capability list at all, and App Groups cannot even be searched for. With it,
  `-allowProvisioningUpdates` registers new groups on its own.
- **Entitlements are absent from a simulator build made with code signing off**,
  and `codesign -d` shows nothing for simulator builds even when they are present.
  Ask for the App Group container instead of reading the binary.

The Xcode target is added by `scripts/add-widget-target.rb`, which is idempotent —
run it again and it repairs the project rather than duplicating the target.

## The on-device model: what it can and cannot be trusted with (2026-08-12)

`ios/App/App/AIBridge.swift` exposes Apple's `FoundationModels` — the ~3B model behind
Apple Intelligence — to the web layer, the same bridge shape as `WidgetBridge`. It runs
on the device, so nothing from the library is sent anywhere; that is the only reason a
language model belongs in this app at all.

Measured on the simulator against the Mac's model, before building anything on it:

| | Result |
|---|---|
| Availability | `available` |
| First call | **6.8 s** — model load |
| Warm calls | 0.6–0.9 s |
| Summarising a sentence handed to it | correct |

**Free-form prompting invents values.** Asked for "something short to watch tonight" it
answered `genre: "comedy"` — a genre nobody mentioned — and `status: "completed"`, which
is not one of this app's four statuses. JSON also came back wrapped in a markdown fence.

**A schema fixes the vocabulary but not the guessing.** With `DynamicGenerationSchema`
the values became ours (`Science-Fiction`, `stopped`), but the model still filled fields
the request never mentioned.

**An explicit `any` option overcorrects.** With `any` in every enum plus "do not guess",
it answered `any` even for "sci-fi", which the request states outright.

**Examples in the instructions leak into the answers.** Spelling out `"sci-fi" is
Science-Fiction, "stopped" is a status` produced `status: stopped` for a request that
said nothing of the sort.

The conclusion is not that the model is useless — it is that **turning a phrase into
filters is the wrong job for it**. Keyword matching against our own genre vocabulary
does that part better and instantly. What the model is genuinely good at is reading text
it was handed: summarising, tagging, picking the matching item out of candidates. Any
feature built here should hand it text and ask about *that text*, never ask it to
produce structure from a vague sentence.

