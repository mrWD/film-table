// Minimal TMDB proxy. Its only jobs: keep the API key out of the client bundle,
// let Vercel's edge cache absorb repeat queries, and refuse anything that is not
// a read-only movie lookup.
//
// The upstream path arrives as ?path=search/movie rather than as URL segments:
// a catch-all file (api/tmdb/[...path].js) only ever matched one segment on
// Vercel, so /api/tmdb/search/movie 404'd before reaching this code.

const TMDB = 'https://api.themoviedb.org/3/'

/** GET-only allowlist; everything else on TMDB stays unreachable through us. */
function isAllowedPath(path) {
  return (
    path === 'search/movie' ||
    // TMDB's own keyword vocabulary. It is what turns a description into something
    // searchable — and what stops an invented phrase from becoming a search.
    path === 'search/keyword' ||
    path === 'genre/movie/list' ||
    // Films matching a set of keyword ids — how "something like these" narrows from
    // "similar films" to the thing the person actually described.
    path === 'discover/movie' ||
    /^movie\/[a-z0-9_]+$/i.test(path) || // movie/{id}, movie/upcoming, movie/popular
    /^movie\/\d+\/(recommendations|similar|release_dates|watch\/providers|keywords)$/.test(path) ||
    // Shows, for "something like…": this app tracks them too, and the first person to
    // try it named one. Series live on their own endpoints, so a movie-only allowlist
    // answered "no titles found in that" for Ted Lasso.
    path === 'search/tv' ||
    /^tv\/\d+\/(recommendations|similar|keywords|external_ids)$/.test(path) ||
    /^tv\/\d+\/watch\/providers$/.test(path) ||
    // Bridges a TVmaze show to its TMDB id; shows are tracked by TVmaze id here.
    /^find\/tt\d+$/.test(path) ||
    /^trending\/movie\/(day|week)$/.test(path)
  )
}

/** Longer-lived answers get longer edge cache. Values are seconds. */
function cacheFor(path) {
  // Availability moves when licensing deals do — days, not months.
  if (/watch\/providers$/.test(path)) return 'public, s-maxage=21600, stale-while-revalidate=86400'
  if (/^find\/tt\d+$/.test(path)) return 'public, s-maxage=604800, stale-while-revalidate=2592000'
  // A finished film's keywords do not change; the same request from a hundred people
  // should cost one call.
  if (/keywords$/.test(path)) return 'public, s-maxage=604800, stale-while-revalidate=2592000'
  if (/^movie\/\d+/.test(path)) return 'public, s-maxage=86400, stale-while-revalidate=604800'
  if (path === 'movie/upcoming' || path === 'genre/movie/list')
    return 'public, s-maxage=21600, stale-while-revalidate=86400'
  return 'public, s-maxage=3600, stale-while-revalidate=86400'
}

/*
 * Who may call this proxy, and what that does and does not stop.
 *
 * Every rule below reads headers a *browser* sets and a page cannot forge: Origin and
 * Sec-Fetch-Site. So they keep other websites from spending our TMDB quota through
 * their visitors' browsers, and they turn away a bare `curl`. They do not stop a
 * script that sends `Origin: capacitor://localhost` itself — that request is
 * indistinguishable from the real app, and the app has no secret it could hold to
 * tell them apart (anything in the bundle is public). The rate limit further down
 * caps one address on one warm instance; the edge cache and TMDB's own limits remain
 * the real backstop, and a leaked key is answered by rotating it.
 */

/** The web builds: the Vercel deployment itself and the GitHub Pages mirror. */
const PRODUCTION_HOSTS = ['film-table.vercel.app', 'mrwd.github.io']

/**
 * The store builds. The iOS WebView serves the bundle from `capacitor://localhost`,
 * Android's from `https://localhost` (`androidScheme: 'https'` in capacitor.config.ts).
 * Matched as whole origins, so `https://localhost:8443` is not one of them.
 */
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost']

/** Dev servers pick arbitrary ports. Only outside production — see originAllowed. */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/

function isProduction() {
  return process.env.VERCEL_ENV === 'production'
}

function selfHost(req) {
  return String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
}

function originAllowed(origin, req) {
  if (APP_ORIGINS.includes(origin)) return true
  let url
  try {
    url = new URL(origin)
  } catch {
    return false // includes the literal "null" a sandboxed frame sends
  }
  // A local dev server, on whatever port Vite chose. Never in production: there it
  // would let any page someone serves from their own machine through.
  if (!isProduction() && LOOPBACK.test(url.hostname)) return true
  if (url.protocol !== 'https:') return false

  const extra = String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // Our own host covers preview deployments, whose addresses change per push.
  return new Set([selfHost(req), ...PRODUCTION_HOSTS, ...extra]).has(url.host)
}

/**
 * A request with no Origin. Browsers leave it off a same-origin GET, which is exactly
 * what the web app on film-table.vercel.app sends — measured in Chrome against
 * production: no Origin, `Sec-Fetch-Site: same-origin`, and a Referer on our own
 * host. A cross-site `<img>` or `<script>` pointed at us also arrives without Origin,
 * but says `cross-site`, and a bare curl says nothing at all; both are refused.
 *
 * Browsers that predate Fetch Metadata (Safari before 16.4) send no Sec-Fetch-Site,
 * so for them the Referer decides. Refusing one costs that person TMDB, not the app:
 * the client falls back to the keyless sources on a 403.
 */
function sameOriginRequest(req) {
  const site = req.headers['sec-fetch-site']
  if (site) return site === 'same-origin'
  try {
    return new URL(String(req.headers.referer ?? '')).host === selfHost(req)
  } catch {
    return false
  }
}

/*
 * Per-address rate limit, held in this instance's memory.
 *
 * What it is: a fixed one-minute window per client address, per warm function
 * instance. It stops one client from hammering TMDB through us in a tight loop. What
 * it is not: a global limit. Vercel runs several instances side by side and recycles
 * them, each with its own empty counter, so a determined caller gets more than this,
 * and one spread over many addresses is not slowed at all. Responses served from the
 * edge cache never reach this code and are not counted — they cost TMDB nothing.
 * A global limit would need shared state (Vercel's Firewall rate-limit rules, or a
 * store keyed by IP address), which is a decision for the owner, not a default.
 *
 * The ceiling is generous on purpose. Explore with a full library opens with a burst
 * of recommendation and provider lookups, and people on one mobile carrier can share
 * an address.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const hits = new Map()

/**
 * Vercel overwrites X-Forwarded-For with the address it saw, so a client cannot pick
 * its own. IPv6 is keyed by its /64: one phone can hold a whole block of addresses.
 */
function clientKey(req) {
  const ip =
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    String(req.headers['x-real-ip'] ?? '') ||
    req.socket?.remoteAddress ||
    'unknown'
  if (!ip.includes(':')) return ip
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = [...left, ...Array(Math.max(8 - left.length - right.length, 0)).fill('0'), ...right]
  return groups.slice(0, 4).join(':') + '::/64'
}

/** Seconds until the caller may try again, or 0 when the request may proceed. */
function retryAfter(req, now = Date.now()) {
  // Expired windows are swept only when the map grows, so a quiet instance does no work.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now - v.start >= WINDOW_MS) hits.delete(k)
  }
  const key = clientKey(req)
  let entry = hits.get(key)
  if (!entry || now - entry.start >= WINDOW_MS) {
    entry = { start: now, count: 0 }
    hits.set(key, entry)
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW ? Math.ceil((entry.start + WINDOW_MS - now) / 1000) : 0
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  const allowed = origin ? originAllowed(origin, req) : sameOriginRequest(req)
  // Every answer depends on who asked, so a cached one must not cross origins.
  res.setHeader('Vary', 'Origin')
  if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin)

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' })
    return
  }
  if (!allowed) {
    res.status(403).json({ error: 'origin not allowed' })
    return
  }

  const raw = req.query.path
  const path = (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).replace(/^\/+/, '')
  if (!isAllowedPath(path)) {
    res.status(403).json({ error: 'path not allowed' })
    return
  }

  const key = process.env.TMDB_API_KEY
  if (!key) {
    // The client treats 503 as "no TMDB here" and falls back to keyless sources.
    res.status(503).json({ error: 'TMDB key not configured' })
    return
  }

  // Counted here, after every refusal, so only requests that would reach TMDB use it up.
  const wait = retryAfter(req)
  if (wait) {
    res.setHeader('Retry-After', String(wait))
    res.setHeader('Cache-Control', 'no-store')
    res.status(429).json({ error: 'too many requests' })
    return
  }

  const url = new URL(TMDB + path)
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') url.searchParams.set(k, String(v))
  }

  const headers = {}
  // themoviedb.org issues either a short v3 key (query param) or a v4 JWT (header)
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)

  try {
    const upstream = await fetch(url, { headers })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (upstream.ok) res.setHeader('Cache-Control', cacheFor(path))
    res.send(body)
  } catch (err) {
    res.status(502).json({ error: 'TMDB unreachable' })
  }
}
