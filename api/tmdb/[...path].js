// Minimal TMDB proxy. Its only jobs: keep the API key out of the client bundle,
// let Vercel's edge cache absorb repeat queries, and refuse anything that is not
// a read-only movie lookup. CommonJS on purpose — the repo has no "type": "module".

const TMDB = 'https://api.themoviedb.org/3/'

/** GET-only allowlist; everything else on TMDB stays unreachable through us. */
function isAllowedPath(path) {
  return (
    path === 'search/movie' ||
    path === 'genre/movie/list' ||
    /^movie\/[a-z0-9_]+$/i.test(path) || // movie/{id}, movie/upcoming, movie/popular
    /^movie\/\d+\/(recommendations|similar|release_dates)$/.test(path) ||
    /^trending\/movie\/(day|week)$/.test(path)
  )
}

/** Longer-lived answers get longer edge cache. Values are seconds. */
function cacheFor(path) {
  if (/^movie\/\d+/.test(path)) return 'public, s-maxage=86400, stale-while-revalidate=604800'
  if (path === 'movie/upcoming' || path === 'genre/movie/list')
    return 'public, s-maxage=21600, stale-while-revalidate=86400'
  return 'public, s-maxage=3600, stale-while-revalidate=86400'
}

/**
 * Browsers enforce the Origin header, so this keeps casual quota borrowing out.
 * Non-browser callers can spoof it — the edge cache and TMDB's own limits are
 * the real backstop.
 */
function originAllowed(origin, req) {
  if (!origin) return true // same-origin GET or non-browser client
  let host
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  const self = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
  const extra = String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowed = new Set([
    self,
    'mrwd.github.io',
    'localhost:5173',
    'localhost:4173',
    '127.0.0.1:5173',
    '127.0.0.1:4173',
    ...extra,
  ])
  return allowed.has(host)
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin
  const allowed = originAllowed(origin, req)
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

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
  if (origin && !allowed) {
    res.status(403).json({ error: 'origin not allowed' })
    return
  }

  const raw = req.query.path
  const path = Array.isArray(raw) ? raw.join('/') : String(raw ?? '')
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
