import type { Episode, MovieResult, ShowSummary } from './types'
import { stripHtml } from './format'

const TVMAZE = 'https://api.tvmaze.com'

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

export async function searchShows(query: string): Promise<ShowSummary[]> {
  const data = await getJson<{ score: number; show: TvmazeShow }[]>(
    `${TVMAZE}/search/shows?q=${encodeURIComponent(query)}`,
  )
  return data.map((r) => mapShow(r.show))
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

export async function searchMovies(query: string): Promise<MovieResult[]> {
  // Note: the `media=movie` filter currently returns 0 results on Apple's side,
  // so we search broadly and keep only feature-movie results ourselves.
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    query,
  )}&country=US&limit=50`
  const data = await itunesGet<{ results?: ItunesMovie[] }>(url)
  return (data.results ?? [])
    .filter((r) => r.kind === 'feature-movie')
    .map(mapMovie)
    .filter((m): m is MovieResult => m !== null)
}

export async function lookupMovie(id: string): Promise<MovieResult | null> {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`
  const data = await itunesGet<{ results?: ItunesMovie[] }>(url)
  const first = (data.results ?? []).find((r) => r.kind === 'feature-movie') ?? data.results?.[0]
  return first ? mapMovie(first) : null
}
