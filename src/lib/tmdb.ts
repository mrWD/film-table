import type { MovieResult } from './types'

/**
 * Client for our /api/tmdb proxy (see api/tmdb.js). The proxy may be
 * absent (GitHub Pages build, local dev) or deployed without a key — both look
 * like 404/503/network failure here, after which this module goes quiet for the
 * session and callers fall back to the keyless sources.
 */

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

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

/** null = proxy unavailable (caller should fall back); [] = genuinely no hits. */
export async function searchMoviesTmdb(query: string): Promise<MovieResult[] | null> {
  const data = await tmdbGet<{ results?: TmdbMovie[] }>('search/movie', {
    query,
    include_adult: 'false',
  })
  if (!data) return null
  return (data.results ?? [])
    .map(mapMovie)
    .filter((m): m is MovieResult => m !== null)
    .slice(0, 20)
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
