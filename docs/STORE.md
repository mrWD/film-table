# Store listing — working draft

Everything an app-store form asks for, prepared once. The texts are drafts in the
app's own voice; edit freely, but keep the claims true.

## Identity

| | |
|---|---|
| App name | FilmTable |
| Bundle / application id | `com.mrwd.filmtable` |
| Category (App Store) | Entertainment |
| Category (Google Play) | Entertainment |
| Website | <https://film-table.vercel.app> |
| Privacy policy | <https://film-table.vercel.app/privacy.html> |
| Support contact | lvigtor@gmail.com |

## Subtitle / short description

> Track shows and movies, offline

Play "short description" (80 chars max):

> A local-first tracker for TV shows and movies. One tap per episode. No account, works offline.

## Full description

FilmTable keeps track of what you watch — shows episode by episode, movies by
watch list — and keeps all of it on your device.

• One-tap episode check-ins, with an UP NEXT queue that always knows where you are
• A movie watch list and a watched shelf
• Explore what's airing tonight and coming to theaters
• Episode alerts, computed on your device from air dates — no server involved
• A year-in-review of your watching
• No account, no sign-up, no tracking; the app works offline
• Your library exports to a single JSON file, and imports back

Metadata comes from TVmaze, iTunes, Cinemeta and TMDB. This product uses the TMDB
API but is not endorsed or certified by TMDB. Not affiliated with TV Time or Whip
Media.

## Data safety / privacy questionnaires

The honest answers, same on both stores:

- **Data collected: none.** The library never leaves the device; there are no
  accounts and no server for user data.
- **Data shared: none.** Catalogue queries go to the sources named in the privacy
  page as a technical necessity, not as data sharing for any purpose of ours.
- **Analytics in the app: none.** The cookieless web analytics run only on the
  website; the component is inert in the native app.
- Google Play Data safety: "No data collected", "No data shared". Apple privacy
  label: "Data Not Collected".

## What only the owner can do

- [ ] Google Play Console account ($25 once) and Apple Developer Program ($99/yr)
- [ ] App signing: Play App Signing on Android; Xcode automatic signing on iOS
- [ ] Screenshots (phone, 2–8 per store; take from the emulator/simulator at
      release quality, both themes)
- [ ] Release builds: `npm run build && npx cap sync`, then Android
      `./gradlew bundleRelease` (.aab) and iOS Archive in Xcode
- [ ] Content rating questionnaire (both stores; the app has no user content)
- App Store: mention the TMDB attribution requirement is already in the description.

## Store assets in this repo

- `docs/store/screenshots/ios-6.9/` — 1320×2868, the size Apple asks for. Light theme.
- `docs/store/screenshots/android/` — 1080×2400. Dark theme, on purpose: between the
  two sets a reviewer sees the app in both themes, which is worth more than matching.
- `docs/store/feature-graphic-1024x500.png` — Play's feature graphic.

All screenshots were taken from a library of **real** titles fetched from the app's own
sources, not mocked up. Anyone regenerating them should keep that rule and one more,
learned the hard way: the seed has to store exactly what the app itself would store.
Trimming an author list or writing a raw upstream date straight through produces a
screenshot that advertises behaviour the app does not have.
