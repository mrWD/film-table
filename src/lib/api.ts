import type { Episode, MovieResult, ShowSummary } from './types'
import { stripHtml, yearOf } from './format'
import { lookupMovieTmdb, searchMoviesTmdb } from './tmdb'
import { stats } from '../store/stats'

const TVMAZE = 'https://api.tvmaze.com'
const CINEMETA = 'https://v3-cinemeta.strem.io'

/** How many Cinemeta hits we are willing to resolve against TVmaze per search. */
const MAX_IMDB_LOOKUPS = 8

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Supplementary sources must never hold up the primary results. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    const settle = (v: T) => {
      clearTimeout(timer)
      resolve(v)
    }
    p.then(settle, () => settle(fallback))
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ---------- TVmaze (TV shows, no API key) ----------

interface TvmazeShow {
  id: number
  name: string
  genres?: string[]
  status?: string
  premiered?: string | null
  ended?: string | null
  rating?: { average: number | null }
  weight?: number
  network?: { name: string } | null
  webChannel?: { name: string } | null
  averageRuntime?: number | null
  image?: { medium?: string; original?: string } | null
  summary?: string | null
  externals?: { imdb?: string | null }
  _embedded?: { episodes?: TvmazeEpisode[] }
}

interface TvmazeEpisode {
  id: number
  season: number
  number: number | null
  name: string
  airdate?: string | null
  airstamp?: string | null
  runtime?: number | null
  image?: { medium?: string; original?: string } | null
  summary?: string | null
}

function mapShow(s: TvmazeShow): ShowSummary {
  return {
    id: s.id,
    name: s.name,
    image: s.image?.medium ?? s.image?.original ?? null,
    imageOriginal: s.image?.original ?? s.image?.medium ?? null,
    genres: s.genres ?? [],
    status: s.status ?? '',
    premiered: s.premiered ?? null,
    ended: s.ended ?? null,
    network: s.network?.name ?? s.webChannel?.name ?? null,
    rating: s.rating?.average ?? null,
    averageRuntime: s.averageRuntime ?? null,
    weight: s.weight ?? 0,
    summary: stripHtml(s.summary),
    imdbId: s.externals?.imdb ?? null,
  }
}

function mapEpisode(e: TvmazeEpisode): Episode {
  return {
    id: e.id,
    season: e.season,
    number: e.number,
    name: e.name || 'TBA',
    airdate: e.airdate ?? null,
    airstamp: e.airstamp ?? null,
    runtime: e.runtime ?? null,
    image: e.image?.medium ?? null,
    summary: stripHtml(e.summary),
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json() as Promise<T>
}

/** TVmaze caps its own search at 10 hits, so Cinemeta widens the net (see mergeShowResults). */
export async function searchShowsTvmaze(query: string): Promise<ShowSummary[]> {
  const data = await getJson<{ score: number; show: TvmazeShow }[]>(
    `${TVMAZE}/search/shows?q=${encodeURIComponent(query)}`,
  )
  return data.map((r) => mapShow(r.show))
}

/** Episode tracking needs a TVmaze record, so an IMDb id is resolved to one. */
export async function showByImdb(imdb: string): Promise<ShowSummary | null> {
  try {
    const data = await getJson<TvmazeShow>(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(imdb)}`)
    return mapShow(data)
  } catch {
    return null // not every title on Cinemeta exists in TVmaze
  }
}

export async function searchShows(query: string): Promise<ShowSummary[]> {
  const [tvmaze, extra] = await Promise.all([
    searchShowsTvmaze(query).then((r) => {
      stats.source('tvmaze')
      return r
    }),
    withTimeout(searchSeriesCinemeta(query), 2500, [] as CinemetaMeta[]),
  ])

  const seenImdb = new Set(tvmaze.map((s) => s.imdbId).filter(Boolean) as string[])
  const seenName = new Set(tvmaze.map((s) => normalizeTitle(s.name)))
  const candidates = extra
    .filter((m) => m.imdb_id && !seenImdb.has(m.imdb_id) && !seenName.has(normalizeTitle(m.name)))
    .slice(0, MAX_IMDB_LOOKUPS)

  const resolved = await withTimeout(
    mapWithConcurrency(candidates, 4, (m) => showByImdb(m.imdb_id!)),
    3000,
    [] as (ShowSummary | null)[],
  )
  const byId = new Map<number, ShowSummary>()
  for (const s of [...tvmaze, ...resolved.filter((s): s is ShowSummary => s !== null)]) {
    if (!byId.has(s.id)) byId.set(s.id, s)
  }
  return [...byId.values()]
}

export async function fetchShowWithEpisodes(
  id: number,
): Promise<{ show: ShowSummary; episodes: Episode[] }> {
  const data = await getJson<TvmazeShow>(`${TVMAZE}/shows/${id}?embed=episodes`)
  const episodes = (data._embedded?.episodes ?? []).map(mapEpisode)
  episodes.sort((a, b) => a.season - b.season || (a.number ?? 9999) - (b.number ?? 9999))
  return { show: mapShow(data), episodes }
}

export interface ScheduleItem {
  show: ShowSummary
  episode: Episode
}

export async function fetchSchedule(date: Date, country = 'US'): Promise<ScheduleItem[]> {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
  const data = await getJson<(TvmazeEpisode & { show: TvmazeShow })[]>(
    `${TVMAZE}/schedule?country=${country}&date=${iso}`,
  )
  return data.map((e) => ({ show: mapShow(e.show), episode: mapEpisode(e) }))
}

// ---------- Cinemeta (public Stremio metadata catalog, no API key) ----------

export interface CinemetaMeta {
  id: string
  imdb_id?: string | null
  name: string
  poster?: string | null
  background?: string | null
  releaseInfo?: string | null
  released?: string | null
  year?: string | null
  runtime?: string | null
  genres?: string[]
  description?: string | null
  imdbRating?: string | null
}

async function cinemetaCatalog(type: 'movie' | 'series', query: string): Promise<CinemetaMeta[]> {
  const data = await getJson<{ metas?: CinemetaMeta[] }>(
    `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`,
  )
  return data.metas ?? []
}

export function searchSeriesCinemeta(query: string): Promise<CinemetaMeta[]> {
  return cinemetaCatalog('series', query)
}

/**
 * Genre-filtered catalogue used to gather recommendation candidates.
 * `imdbRating` sorts by quality, `top` by popularity.
 */
export async function fetchGenreCatalog(
  type: 'movie' | 'series',
  genre: string,
  sort: 'imdbRating' | 'top' = 'imdbRating',
): Promise<CinemetaMeta[]> {
  const data = await getJson<{ metas?: CinemetaMeta[] }>(
    `${CINEMETA}/catalog/${type}/${sort}/genre=${encodeURIComponent(genre)}.json`,
  )
  return data.metas ?? []
}


async function cinemetaMeta(type: 'movie' | 'series', id: string): Promise<CinemetaMeta | null> {
  try {
    const data = await getJson<{ meta?: CinemetaMeta }>(`${CINEMETA}/meta/${type}/${id}.json`)
    return data.meta ?? null
  } catch {
    return null
  }
}

/** Cinemeta reports runtime as free text such as "121 min" or "1h 50min". */
function parseRuntime(text: string | null | undefined): number | null {
  if (!text) return null
  const h = /(\d+)\s*h/.exec(text)
  const m = /(\d+)\s*min/.exec(text)
  if (!h && !m) {
    const bare = /^\s*(\d+)\s*$/.exec(text)
    return bare ? Number(bare[1]) : null
  }
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

/** A bare year is widened to Jan 1 so release countdowns still sort sensibly. */
function releaseDateOf(meta: CinemetaMeta): string | null {
  if (meta.released) return meta.released
  const year = /^(\d{4})/.exec(meta.releaseInfo ?? '')
  return year ? `${year[1]}-01-01` : null
}

export function mapCinemetaMovie(meta: CinemetaMeta): MovieResult {
  return {
    id: meta.imdb_id || meta.id,
    title: meta.name,
    poster: meta.poster ?? null,
    genre: meta.genres?.slice(0, 2).join(', '),
    runtimeMin: parseRuntime(meta.runtime),
    releaseDate: releaseDateOf(meta),
    description: meta.description ?? '',
    contentRating: null,
  }
}

// ---------- iTunes Search API (movies, no API key) ----------

interface ItunesMovie {
  wrapperType?: string
  kind?: string
  trackId?: number
  trackName?: string
  artworkUrl100?: string
  longDescription?: string
  shortDescription?: string
  primaryGenreName?: string
  trackTimeMillis?: number
  releaseDate?: string
  contentAdvisoryRating?: string
}

/** iTunes may not send CORS headers in every region; fall back to JSONP on the web. */
function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cbName = `__ft_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const w = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('JSONP timeout'))
    }, timeoutMs)
    function cleanup() {
      window.clearTimeout(timer)
      delete w[cbName]
      script.remove()
    }
    w[cbName] = (data: T) => {
      cleanup()
      resolve(data)
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cbName}`
    script.onerror = () => {
      cleanup()
      reject(new Error('JSONP failed'))
    }
    document.head.appendChild(script)
  })
}

async function itunesGet<T>(url: string): Promise<T> {
  try {
    return await getJson<T>(url)
  } catch {
    return jsonp<T>(url)
  }
}

function upscaleArtwork(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/100x100bb/, '600x600bb')
}

function mapMovie(m: ItunesMovie): MovieResult | null {
  if (!m.trackId || !m.trackName) return null
  return {
    id: String(m.trackId),
    title: m.trackName,
    poster: upscaleArtwork(m.artworkUrl100),
    genre: m.primaryGenreName,
    runtimeMin: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : null,
    releaseDate: m.releaseDate ?? null,
    description: m.longDescription || m.shortDescription || '',
    contentRating: m.contentAdvisoryRating ?? null,
  }
}

async function searchMoviesItunes(query: string): Promise<MovieResult[]> {
  // Apple's `media=movie` filter currently returns 0 results for every term, so we
  // search unfiltered and keep the feature films ourselves. The unfiltered feed is
  // mostly podcasts and TV episodes, which is why Cinemeta leads in searchMovies.
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    query,
  )}&country=US&limit=200`
  const data = await itunesGet<{ results?: ItunesMovie[] }>(url)
  return (data.results ?? [])
    .filter((r) => r.kind === 'feature-movie')
    .map(mapMovie)
    .filter((m): m is MovieResult => m !== null)
}

export async function searchMovies(query: string): Promise<MovieResult[]> {
  // TMDB (through our proxy) has the best movie catalogue; when the proxy is
  // deployed and keyed it simply wins. Otherwise the keyless pair below serves.
  const viaTmdb = await withTimeout(searchMoviesTmdb(query), 3000, null)
  if (viaTmdb && viaTmdb.length > 0) {
    stats.source('tmdb')
    return viaTmdb
  }

  const [cinemeta, itunes] = await Promise.all([
    cinemetaCatalog('movie', query)
      .then((metas) => {
        stats.source('cinemeta')
        return metas.map(mapCinemetaMovie)
      })
      .catch(() => {
        stats.error('cinemeta')
        return [] as MovieResult[]
      }),
    withTimeout(searchMoviesItunes(query), 2000, [] as MovieResult[]),
  ])

  // Cinemeta has the fuller catalogue; iTunes only contributes what it alone knows.
  const seen = new Set(cinemeta.map((m) => `${normalizeTitle(m.title)}|${yearOf(m.releaseDate)}`))
  const extras = itunes.filter(
    (m) => !seen.has(`${normalizeTitle(m.title)}|${yearOf(m.releaseDate)}`),
  )
  return [...cinemeta, ...extras]
}

export async function lookupMovie(id: string): Promise<MovieResult | null> {
  if (id.startsWith('tmdb:')) {
    return lookupMovieTmdb(id)
  }
  if (id.startsWith('tt')) {
    const meta = await cinemetaMeta('movie', id)
    return meta ? mapCinemetaMovie(meta) : null
  }
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`
  const data = await itunesGet<{ results?: ItunesMovie[] }>(url)
  const first = (data.results ?? []).find((r) => r.kind === 'feature-movie') ?? data.results?.[0]
  return first ? mapMovie(first) : null
}
