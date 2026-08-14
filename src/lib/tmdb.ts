import { isNativeApp } from 'tables-core'
import type { MovieResult } from './types'

/**
 * Client for our /api/tmdb proxy (see api/tmdb.js). The proxy may be
 * absent (GitHub Pages build, local dev) or deployed without a key — both look
 * like 404/503/network failure here, after which this module goes quiet for the
 * session and callers fall back to the keyless sources.
 */

/**
 * The native app has no origin to be same as — it is served from capacitor://localhost —
 * so it must call the deployment by its full address. `VITE_API_BASE` still wins when
 * set; the fallback keeps a store build from silently losing TMDB because one
 * environment variable was forgotten. (Losing it is survivable here — search falls back
 * to Cinemeta and iTunes — but it should not happen by accident.)
 *
 * The proxy needs no change: its origin check parses `capacitor://localhost` to the host
 * `localhost`, which its loopback rule already permits.
 */
const PRODUCTION_API = 'https://film-table.vercel.app'

const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? (isNativeApp() ? PRODUCTION_API : '')
).replace(/\/$/, '')

let disabled = false

export function tmdbEnabled(): boolean {
  return !disabled
}

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (disabled) return null
  const qs = new URLSearchParams({ path, ...params }).toString()
  try {
    const res = await fetch(`${API_BASE}/api/tmdb?${qs}`)
    if (res.status === 404 || res.status === 403 || res.status === 503) {
      disabled = true
      return null
    }
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    disabled = true // no proxy at this origin at all
    return null
  }
}

// TMDB's movie genre ids are stable and documented; a static map beats an extra call.
const GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}

const IMG = 'https://image.tmdb.org/t/p/w342'

interface TmdbMovie {
  id: number
  title?: string
  overview?: string
  poster_path?: string | null
  release_date?: string | null
  genre_ids?: number[]
  genres?: { id: number; name: string }[]
  runtime?: number | null
  popularity?: number
}

function mapMovie(m: TmdbMovie): MovieResult | null {
  if (!m.id || !m.title) return null
  const genreNames =
    m.genres?.map((g) => g.name) ?? (m.genre_ids ?? []).map((id) => GENRES[id]).filter(Boolean)
  return {
    id: `tmdb:${m.id}`,
    title: m.title,
    poster: m.poster_path ? `${IMG}${m.poster_path}` : null,
    genre: genreNames.slice(0, 2).join(', ') || undefined,
    runtimeMin: m.runtime ?? null,
    releaseDate: m.release_date || null,
    description: m.overview ?? '',
    contentRating: null,
  }
}

/**
 * null = proxy unavailable (caller should fall back); [] = genuinely no hits.
 *
 * `language` matters more than it looks. Searching "Никто" with the default language
 * returns an undated fragment ahead of the 2021 film; with `ru-RU` the right one comes
 * first. Callers that know the script of the query should say so.
 */
export async function searchMoviesTmdb(
  query: string,
  language?: string,
): Promise<MovieResult[] | null> {
  const data = await tmdbGet<{ results?: TmdbMovie[] }>('search/movie', {
    query,
    include_adult: 'false',
    ...(language ? { language } : {}),
  })
  if (!data) return null
  return (data.results ?? [])
    .map(mapMovie)
    .filter((m): m is MovieResult => m !== null)
    .slice(0, 20)
}

// ---------- keywords ----------

export interface Keyword {
  id: number
  name: string
}

/** TMDB's own tags for a film: "hitman", "revenge", "one man army". */
export async function keywordsForMovie(id: string): Promise<Keyword[] | null> {
  const numeric = id.replace(/^tmdb:/, '')
  const data = await tmdbGet<{ keywords?: Keyword[] }>(`movie/${numeric}/keywords`)
  return data?.keywords ?? null
}

/**
 * A phrase looked up in TMDB's keyword vocabulary, with the size of the corpus behind it.
 *
 * The size is the point. "corridor" is a real keyword and carries three films; "hallway"
 * carries three. Treating either as a filter produces three arbitrary answers that look
 * like a considered result. "hand to hand combat" carries 68, "one man army" 93,
 * "martial arts" 2065 — those mean something. So a match has to clear a floor before it
 * is allowed to influence anything.
 */
const KEYWORD_CORPUS_FLOOR = 25

export async function findKeyword(term: string): Promise<(Keyword & { films: number }) | null> {
  const found = await tmdbGet<{ results?: Keyword[] }>('search/keyword', { query: term })
  // Only an exact vocabulary entry: searching "fight" also offers "food fight" and
  // "brazilian fight", which are not what was asked and would quietly redirect the answer.
  const exact = (found?.results ?? []).find((k) => k.name.toLowerCase() === term.toLowerCase())
  if (!exact) return null
  const corpus = await tmdbGet<{ total_results?: number }>('discover/movie', {
    with_keywords: String(exact.id),
  })
  const films = corpus?.total_results ?? 0
  return films >= KEYWORD_CORPUS_FLOOR ? { ...exact, films } : null
}

/**
 * TMDB's own "people who liked this" lists. Both endpoints are asked because they
 * disagree usefully: `recommendations` leans on what audiences actually watched next,
 * `similar` on shared genres and keywords, and a film both of them name is a stronger
 * answer than one either names alone.
 */
export async function similarToTmdb(id: string): Promise<MovieResult[] | null> {
  const numeric = id.replace(/^tmdb:/, '')
  const pages = await Promise.all([
    tmdbGet<{ results?: TmdbMovie[] }>(`movie/${numeric}/recommendations`),
    tmdbGet<{ results?: TmdbMovie[] }>(`movie/${numeric}/similar`),
  ])
  if (pages.every((p) => p === null)) return null
  const seen = new Set<string>()
  const out: MovieResult[] = []
  for (const page of pages) {
    for (const raw of page?.results ?? []) {
      const movie = mapMovie(raw)
      if (!movie || seen.has(movie.id)) continue
      seen.add(movie.id)
      out.push(movie)
    }
  }
  return out.slice(0, 40)
}

export async function lookupMovieTmdb(id: string): Promise<MovieResult | null> {
  const numeric = id.replace(/^tmdb:/, '')
  const data = await tmdbGet<TmdbMovie>(`movie/${numeric}`)
  return data ? mapMovie(data) : null
}

/** Theatrical releases that are still ahead of us, for the Explore feed. */
export async function upcomingMoviesTmdb(): Promise<MovieResult[] | null> {
  const data = await tmdbGet<{ results?: TmdbMovie[] }>('movie/upcoming', { region: 'US' })
  if (!data) return null
  const today = new Date().toISOString().slice(0, 10)
  return (data.results ?? [])
    .filter((m) => (m.release_date ?? '') > today)
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    .map(mapMovie)
    .filter((m): m is MovieResult => m !== null)
}

// ---------- where to watch ----------

/**
 * Streaming availability, from TMDB's JustWatch feed. Two things it is not: a global
 * answer, and a permanent one. Availability is per country and moves with licensing
 * deals, so the country has to come from the person and the answer is cached in hours.
 *
 * TMDB requires the JustWatch attribution wherever this data appears — see WhereToWatch.
 */

export interface Provider {
  name: string
  kind: 'stream' | 'rent' | 'buy'
}

interface ProviderEntry {
  provider_name?: string
}

interface ProviderCountry {
  flatrate?: ProviderEntry[]
  rent?: ProviderEntry[]
  buy?: ProviderEntry[]
  link?: string
}

export interface Availability {
  providers: Provider[]
  /** TMDB's own page for this title, which JustWatch's terms prefer we link to. */
  link: string | null
}

function collect(country: ProviderCountry | undefined): Availability {
  if (!country) return { providers: [], link: null }
  const seen = new Set<string>()
  const providers: Provider[] = []
  const push = (list: ProviderEntry[] | undefined, kind: Provider['kind']) => {
    for (const p of list ?? []) {
      const name = p.provider_name
      // A service offering both a subscription and a rental should be named once, and
      // subscription is what people are actually looking for.
      if (!name || seen.has(name)) continue
      seen.add(name)
      providers.push({ name, kind })
    }
  }
  push(country.flatrate, 'stream')
  push(country.rent, 'rent')
  push(country.buy, 'buy')
  return { providers, link: country.link ?? null }
}

export async function movieAvailability(
  tmdbId: string,
  country: string,
): Promise<Availability | null> {
  const id = tmdbId.replace(/^tmdb:/, '')
  if (!/^\d+$/.test(id)) return null
  const data = await tmdbGet<{ results?: Record<string, ProviderCountry> }>(
    `movie/${id}/watch/providers`,
  )
  if (!data) return null
  return collect(data.results?.[country])
}

/** Shows are tracked by TVmaze id here, so TMDB has to be reached through IMDb. */
export async function showAvailability(
  imdbId: string,
  country: string,
): Promise<Availability | null> {
  if (!/^tt\d+$/.test(imdbId)) return null
  const found = await tmdbGet<{ tv_results?: { id: number }[] }>(`find/${imdbId}`, {
    external_source: 'imdb_id',
  })
  const tmdbId = found?.tv_results?.[0]?.id
  if (!tmdbId) return null
  const data = await tmdbGet<{ results?: Record<string, ProviderCountry> }>(
    `tv/${tmdbId}/watch/providers`,
  )
  if (!data) return null
  return collect(data.results?.[country])
}
