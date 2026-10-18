/**
 * Regenerates the store screenshots in docs/store/screenshots/.
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/store-screenshots.mjs
 *
 * It starts its own Vite dev server, seeds a library through the app's own modules — the
 * same search, lookup and store calls a person's taps would make, so the seed holds
 * exactly what the app would store (see docs/STORE.md) — and photographs each screen at
 * the size each store asks for: iPhone 6.9" at 1320×2868 in the light theme, Android
 * phone at 1080×2400 in the dark one — plus docs/store/site/, the 414×896 light and dark
 * pairs the products page shows. `?from=app` hides the donation button the way the
 * native build does. The status and gesture bars in docs/store/frame/ are composited on
 * top; the safe-area insets are emulated so the layout leaves room for them as it does
 * on the phone.
 *
 * The titles are chosen so the artwork can be shown. The four films are Blender
 * Foundation open movies, and their posters as Cinemeta serves them are Blender's own,
 * released under Creative Commons Attribution. TV artwork has no such option — every
 * poster TVmaze has is studio key art — so every image not on CLEAN_ART is blurred where
 * it is drawn. Anything added here must be checked the same way before it joins that list.
 *
 * Needs the network: TVmaze and Cinemeta are called directly, as the app does. TMDB is
 * left out (the dev server has no proxy), which is the app's keyless path.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')
const sharp = require('sharp')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'store')
const FRAME = join(ROOT, 'docs', 'store', 'frame')
const PORT = Number(process.env.PORT ?? 5191)
const BASE = `http://localhost:${PORT}`

/** Blender open movies, CC BY: Big Buck Bunny, Elephants Dream, Sintel, Tears of Steel. */
const FILMS = [
  { imdb: 'tt1254207', status: 'watched' },
  { imdb: 'tt0807840', status: 'watched' },
  { imdb: 'tt1727587', status: 'watchlist' },
  { imdb: 'tt2285752', status: 'watchlist' },
]
const CLEAN_ART = FILMS.map((f) => `https://images.metahub.space/poster/small/${f.imdb}/img`)

/** Long-running classics, with how far into each the seed has watched. Art is blurred. */
const SHOWS = [
  { name: 'Bonanza', premiered: '1959', watched: 5 },
  { name: 'The Beverly Hillbillies', premiered: '1962', watched: 12 },
  { name: 'The Dick Van Dyke Show', premiered: '1961', watched: 20 },
  { name: 'The Lucy Show', premiered: '1962', watched: 3 },
]

/** The store screens: the queue, a show, the films. */
const STORE_SHOTS = (showId) => [
  { name: '01-shows', hash: '#/shows' },
  { name: '02-show', hash: `#/show/${showId}` },
  { name: '03-movies', hash: '#/movies' },
]

/** The products page's screens, under the file names it already uses. */
const SITE_SHOTS = (showId) => [
  { name: 'up-next', hash: '#/shows' },
  { name: 'show', hash: `#/show/${showId}` },
  { name: 'for-you', hash: '#/explore' },
  { name: 'search', hash: '#/explore', act: (page) => search(page, 'Search shows and movies', 'bonanza') },
]

const SETS = [
  // 62/34pt are the iPhone 16 Pro Max insets; the bars come from the simulator.
  { dir: 'screenshots/ios-6.9', width: 440, height: 956, scheme: 'light', insets: { top: 62, bottom: 34 }, status: 'ios-status.png', shots: STORE_SHOTS },
  { dir: 'screenshots/android', width: 360, height: 800, scheme: 'dark', insets: { top: 24, bottom: 24 }, status: 'android-status.png', nav: 'android-nav.png', shots: STORE_SHOTS },
  { dir: 'site', width: 414, height: 896, scale: 1, scheme: 'light', suffix: '-light', shots: SITE_SHOTS },
  { dir: 'site', width: 414, height: 896, scale: 1, scheme: 'dark', suffix: '-dark', shots: SITE_SHOTS },
]

async function search(page, placeholder, text) {
  await page.getByPlaceholder(placeholder).fill(text)
  // Past the input's debounce, then whatever the search set off.
  await page.waitForTimeout(1500)
}

async function seed(page, films, shows) {
  return page.evaluate(
    async ({ films, shows }) => {
      const api = await import('/src/lib/api.ts')
      const { useLibrary } = await import('/src/store/library.ts')
      const { ensureShow, useShowCache } = await import('/src/store/cache.ts')
      const lib = useLibrary.getState()
      const firstShow = []
      for (const s of shows) {
        const found = await api.searchShowsTvmaze(s.name)
        const show = found.find((x) => x.name === s.name && (x.premiered ?? '').startsWith(s.premiered))
        if (!show) throw new Error(`TVmaze has no ${s.name} (${s.premiered})`)
        lib.followShow(show.id)
        await ensureShow(show.id)
        const episodes = useShowCache.getState().entries[show.id]?.episodes ?? []
        const ordered = [...episodes].sort((a, b) => a.season - b.season || a.number - b.number)
        lib.setEpisodesWatched(show.id, ordered.slice(0, s.watched).map((e) => e.id), true)
        firstShow.push(show.id)
      }
      for (const f of films) {
        const movie = await api.lookupMovie(f.imdb)
        if (!movie) throw new Error(`Cinemeta has no ${f.imdb}`)
        lib.addMovie(movie, f.status)
      }
      return firstShow[0]
    },
    { films, shows },
  )
}

/**
 * Resolves once no request has been in flight for `quietMs`. Playwright's own
 * 'networkidle' is a load state: after a hash change it has long been reached and
 * returns at once, before the new screen has asked for anything.
 */
function trackNetwork(page) {
  let inflight = 0
  let lastChange = Date.now()
  const bump = (d) => {
    inflight += d
    lastChange = Date.now()
  }
  page.on('request', () => bump(1))
  page.on('requestfinished', () => bump(-1))
  page.on('requestfailed', () => bump(-1))
  return async (quietMs = 1000, maxMs = 120_000) => {
    const until = Date.now() + maxMs
    while (Date.now() < until && (inflight > 0 || Date.now() - lastChange < quietMs)) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

async function shoot(page, set, { name, hash, act }) {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.settle()
  if (act) {
    await act(page)
    await page.settle()
  }
  // Recommendations and search fill in after the network settles; skeletons mean not yet.
  const started = Date.now()
  const settled = await page
    .waitForFunction(() => !document.querySelector('.skel'), null, { timeout: 180_000 })
    .then(() => true, () => false)
  if (!settled || Date.now() - started > 5000) {
    console.log(`${name}: ${settled ? 'settled' : 'still loading'} after ${Math.round((Date.now() - started) / 1000)}s`)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  // Only what is on screen: lazy images further down never load, by design.
  await page.waitForFunction(() =>
    [...document.images]
      .filter((i) => i.getBoundingClientRect().top < window.innerHeight)
      .every((i) => i.complete),
  )
  await page.waitForTimeout(600)
  const shot = await page.screenshot({ type: 'png' })

  const file = join(OUT, set.dir, `${name}${set.suffix ?? ''}.png`)
  if (!set.status) {
    await sharp(shot).png().toFile(file)
    console.log(file)
    return
  }
  const layers = []
  const bar = sharp(join(FRAME, set.status))
  // The bars were lifted as black glyphs; the dark theme wants them white.
  layers.push({ input: await (set.scheme === 'dark' ? bar.negate({ alpha: false }) : bar).toBuffer(), top: 0, left: 0 })
  if (set.nav) {
    const nav = sharp(join(FRAME, set.nav))
    const { height } = await nav.metadata()
    layers.push({
      input: await (set.scheme === 'dark' ? nav.negate({ alpha: false }) : nav).toBuffer(),
      top: set.height * 3 - height,
      left: 0,
    })
  }
  await sharp(shot).composite(layers).png().toFile(file)
  console.log(file)
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' })
  await new Promise((resolve, reject) => {
    vite.stdout.on('data', (d) => String(d).includes('Local:') && resolve())
    vite.on('exit', (code) => reject(new Error(`vite exited ${code}`)))
  })

  const browser = await chromium.launch()
  try {
    for (const set of SETS) {
      const context = await browser.newContext({
        viewport: { width: set.width, height: set.height },
        deviceScaleFactor: set.scale ?? 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: set.scheme,
      })
      const page = await context.newPage()
      page.settle = trackNetwork(page)
      if (set.insets) {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 0, right: 0, ...set.insets } })
      }
      await page.goto(`${BASE}/?from=app#/`)
      await page.settle()
      const showId = await seed(page, FILMS, SHOWS)
      await page.addStyleTag({
        content:
          'img { filter: blur(14px) saturate(1.2); transform: scale(1.12); }\n' +
          CLEAN_ART.map((src) => `img[src="${src}"]`).join(',\n') +
          ' { filter: none; transform: none; }',
      })

      for (const shot of set.shots(showId)) await shoot(page, set, shot)
      await context.close()
    }
  } finally {
    await browser.close()
    vite.kill()
  }
}

await main()
