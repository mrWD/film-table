# Store listing

The listing itself lives in two files, and they are the source of truth:

- [`docs/store/app-store.json`](store/app-store.json): App Store Connect. Name, subtitle,
  promotional text, description, keywords, URLs, category, content rights, age rating
  overrides, review notes, and the App Privacy answers as a record (the API cannot set
  those).
- [`docs/store/google-play.json`](store/google-play.json): Google Play. Title, short and full
  description, category, contact, the Data safety answers and the expected content rating.

Their format is `~/Projects/store-release/SCHEMA.md`, and `store-release/asc-release.mjs`
pushes `app-store.json` into App Store Connect. Change a text in the JSON, not here. This
file keeps why the texts say what they say, and what is still to be done by hand.

## Identity

| | |
|---|---|
| App name | FilmTable |
| Bundle / application id | `com.mrwd.filmtable` |
| App Store Apple ID | `6806612159` |
| Category | Entertainment (both stores) |
| Support and marketing URL | <https://mrwd.github.io/products/film-table/> |
| Privacy policy | <https://film-table.vercel.app/privacy.html> (answered 200 on 2026-10-30) |
| The app on the web | <https://film-table.vercel.app> |
| Support contact | lvigtor@gmail.com |

## What the texts have to stay true to

- The daily anonymous usage counts exist. Both descriptions say what is sent and that
  Profile turns it off, and the review notes name the endpoint. Never write "no analytics",
  "collects nothing", "Data Not Collected" or "nothing leaves the device". The old draft's
  "no tracking" is gone too: it is true in Apple's sense, but next to a daily ping it reads
  as "nothing is sent".
- "No account" and "your library stays on your device" are true and stay.
- Plain, conversational English, with no em dashes and no semicolons in store texts.
- Lengths are checked against the stores' limits (subtitle and title 30, promotional text
  170, Play short description 80, keywords 100, descriptions 4000). The old drafts broke
  the 80-character limit for the Play short description.
- The TMDB notice is the wording TMDB's API terms ask for, word for word, the same as in
  Profile. JustWatch is credited because TMDB's terms require it wherever its streaming
  data appears.
- `03-movies` shows Blender open-movie posters, so the description carries their CC BY
  credit, "© Blender Foundation | www.blender.org".
- TV Time and Whip Media are no longer named in the store texts. The listing makes no
  claims about other apps.
- The widgets, the Apple Intelligence recap and on-device translation exist only on iOS,
  so they appear in `app-store.json` and not in `google-play.json`.

## Age rating

The questionnaire was answered "none" throughout in 2026-08 (4+), on the grounds that the
app has no content of its own. That holds for what the app writes, but not for what it
shows. Explore's default lists (Coming to theaters, Airing tonight, Popular this week) and
every search show the catalogues' posters and one-paragraph overviews of films and shows of
every rating, filtered only by TMDB's adult flag. Horror posters, guns on action posters,
and overviews about crime, drugs and sex turn up without anyone looking for them.
`app-store.json` therefore declares, each as **Infrequent**: horror/fear themes,
mature/suggestive themes, realistic violence, guns or other weapons, profanity or crude
humour, sexual content or nudity, and alcohol, tobacco or drug references. That makes the
app **13+** (infrequent realistic violence, sexual content and drug references are the 13+
items). A 4+ listing that shows such posters also invites a refusal under guideline 2.3.6
(an age rating that does not match the content). Nothing is "Frequent": the
app is a personal list, and that material is incidental. Google Play: answering the IARC
questionnaire the same way should give **Teen** (`contentRating` in `google-play.json`).

If this is the wrong call, delete the fields from `ageRating` in `app-store.json` and
`asc-release.mjs` sets them back to none.

## Data safety / privacy questionnaires

The honest answers, same on both stores. They are recorded as `appPrivacy` in
`app-store.json` and `dataSafety` in `google-play.json`.

- **Data collected: anonymous usage counts, nothing about the person.** The library never
  leaves the device; there are no accounts and no server for user data. Once a day the
  app sends counts of screens and features used and of error kinds, with version,
  platform, language and date (`src/lib/metrics.ts`; the contract is
  app-metrics/docs/CLIENT.md). No identifiers, titles, search text or anything typed. On
  by default, off in Profile; off also deletes the unsent counts.
- **Data shared: none.** Catalogue queries go to the sources named in the privacy
  page as a technical necessity, not as data sharing for any purpose of ours.
- **Analytics in the app: the daily counts above, nothing else.** The cookieless Vercel
  web analytics run only on the website; that component is inert in the native app.
- Apple privacy label (App Store Connect → App Privacy): **Usage Data → Product
  Interaction** and **Diagnostics → Other Diagnostic Data**, each with purpose
  *Analytics*, **not linked to the user**, **not used for tracking**. Everything else:
  not collected.
- Google Play Data safety: data collected — **App activity → App interactions** and
  **App info and performance → Diagnostics**, purpose *Analytics*; not shared; encrypted
  in transit; optional (users can turn it off). "No data shared".

## What only the owner can do

- [ ] Push the listing: `asc-release.mjs` in `~/Projects/store-release` (its README says how).
- [ ] App Store Connect → App Privacy: enter the `appPrivacy` answers by hand. The API
      cannot.
- [ ] Google Play Console: create the app, then fill in Data safety from `dataSafety` and the
      content rating questionnaire (see Age rating above). Upload the `android/` screenshots
      and the feature graphic.
- [ ] Upload key: create the one `mrwd-upload.jks` and the four `MRWD_UPLOAD_*` lines in
      `~/.gradle/gradle.properties` (SCHEMA.md, "Android release signing"). Until then
      `bundleRelease` builds an **unsigned** bundle and Gradle prints a warning saying so.
- [ ] Release builds: `npm run build:native && npx cap sync`, never plain `build`. Then
      Android: `cd android && JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.12.1+1/Contents/Home ./gradlew bundleRelease`
      (Gradle on JDK 24 breaks native tasks), giving
      `android/app/build/outputs/bundle/release/app-release.aab`. Check it with
      `jarsigner -verify`. iOS: an Archive in Xcode, or `scripts/release-ios.sh`.
- `versionCode` must rise with every Play upload. It is 4 now, the same as the iOS build
  number (`CURRENT_PROJECT_VERSION`) of the same commit, and both should move together.

## Store assets in this repo

- `docs/store/screenshots/ios-6.9/` — 1320×2868, the size Apple asks for. Light theme.
- `docs/store/screenshots/ipad-13/` — 2064×2752, iPad 13", required because the app runs
  on iPad (`TARGETED_DEVICE_FAMILY` 1,2). Light theme. At iPad width the app shows its
  wide-screen layout, the phone column centred on a tinted page. That is what the native
  app draws on an iPad, checked against FilmTable in the iPad Pro 13" simulator, whose
  safe-area insets (32/20pt) the script reproduces.
- `docs/store/screenshots/android/` — 1080×2400. Dark theme, on purpose: between the
  two sets a reviewer sees the app in both themes, which is worth more than matching.
- `docs/store/site/` — 414×896 light and dark pairs under the file names the products
  page uses (`up-next`, `show`, `for-you`, `search`, `explore`).
- `docs/store/feature-graphic-1024x500.png` — Play's feature graphic.
- `docs/store/frame/` — the status and gesture bars, lifted from the simulator and
  emulator, that the script lays over the store sets. `ipad-status.png` is the iPad Pro
  13" simulator's (iPadOS 27), with the window title it shows beside the date left out.

Every store image is saved without an alpha channel, which App Store Connect refuses.
`node scripts/store-screenshots.mjs ios-6.9 ipad-13 android` remakes only the store
sets and leaves `site/` (the products page's copies) alone. A run blocks the daily
usage ping and dismisses its notice, so it counts nothing and the notice is not in the
shots.

`node scripts/store-screenshots.mjs` makes all of them (the header says what it needs).
They are taken from a library of **real** titles fetched from the app's own sources, not
mocked up, and seeded through the app's own search and store calls. Anyone regenerating
them should keep that rule and one more, learned the hard way: the seed has to store
exactly what the app itself would store. Trimming an author list or writing a raw
upstream date straight through produces a screenshot that advertises behaviour the app
does not have.

**No studio artwork (2026-10-18).** The first set showed Severance with the Apple TV+
mark, Andor, The Bear and Silo — key art that belongs to the studios, in an ad for an app.
Now:

- the films are Blender Foundation open movies (Big Buck Bunny, Elephants Dream, Sintel,
  Tears of Steel). Their posters, as Cinemeta serves them, are Blender's own and released
  under **CC BY** — credit "© Blender Foundation | www.blender.org" in the store
  description if `03-movies` is used;
- TV artwork has no clean option — every TVmaze poster is studio key art — so it is
  **blurred** where it is drawn, along with every other image the script was not told is
  clean. The shows are 1950s–60s classics (Bonanza, The Beverly Hillbillies, The Dick Van
  Dyke Show, The Lucy Show);
- a title only joins `CLEAN_ART` in the script after its image has been looked at and its
  licence checked. "Night of the Living Dead" (1968) is public domain, but the poster
  Cinemeta has for it is a later illustration, so it is not used.
- The donation button is gone from the shots, as it is from the native app.
