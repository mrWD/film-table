import { create } from 'zustand'
import { fetchGenreCatalog, mapCinemetaMovie, showByImdb, type CinemetaMeta } from '../lib/api'
import { canonicalGenres, type Genre } from '../lib/genres'
import type { Movie, MovieResult, ShowCacheEntry, ShowSummary, TrackedShow } from '../lib/types'
import { useLibrary } from './library'
import { useShowCache } from './cache'

/** How strongly each kind of library entry speaks for the user's taste. */
const WEIGHT = {
  movieWatched: 1.5,
  movieWatchlist: 0.5,
  showBase: 1,
  /** Dropping a show is evidence against its genres, but milder than watching is for. */
  showStopped: -1,
  recentBoost: 1.5,
  recentDays: 30,
}

const SCORE = { genre: 0.6, rating: 0.25, year: 0.15 }

const MAX_SEED_GENRES = 4
const CANDIDATES_PER_GENRE = 50
const SHOWS_TO_RESOLVE = 18
const RESULT_LIMIT = 12
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export interface Taste {
  genres: Partial<Record<Genre, number>>
  topGenres: Genre[]
  /** Positive library entries, used to explain each recommendation individually. */
  seeds: { title: string; genres: Genre[]; weight: number }[]
  meanYear: number | null
  meanRating: number | null
  seedCount: number
  hasMovies: boolean
  hasShows: boolean
}

export type Recommendation =
  | { kind: 'show'; show: ShowSummary; score: number; reason: string }
  | { kind: 'movie'; movie: MovieResult; score: number; reason: string }

// ---------- taste ----------

function yearOfString(value: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(value ?? '')
  return m ? Number(m[1]) : null
}

interface Seed {
  title: string
  genres: Genre[]
  weight: number
  year: number | null
  rating: number | null
}

function collectSeeds(
  shows: Record<number, TrackedShow>,
  entries: Record<number, ShowCacheEntry>,
  movies: Record<string, Movie>,
  now: number,
): Seed[] {
  const seeds: Seed[] = []

  for (const tracked of Object.values(shows)) {
    const entry = entries[tracked.id]
    if (!entry) continue
    const watched = Object.keys(tracked.watched).length
    if (tracked.status === 'stopped') {
      seeds.push({
        title: entry.show.name,
        genres: canonicalGenres(entry.show.genres),
        weight: WEIGHT.showStopped,
        year: yearOfString(entry.show.premiered),
        rating: entry.show.rating ?? null,
      })
      continue
    }
    // Episodes watched matter, but a long binge should not drown out everything else.
    let weight = WEIGHT.showBase + Math.log2(1 + watched)
    const days = tracked.lastWatchedAt ? (now - tracked.lastWatchedAt) / 86400000 : Infinity
    if (days <= WEIGHT.recentDays) weight *= WEIGHT.recentBoost
    seeds.push({
      title: entry.show.name,
      genres: canonicalGenres(entry.show.genres),
      weight,
      year: yearOfString(entry.show.premiered),
      rating: entry.show.rating ?? null,
    })
  }

  for (const movie of Object.values(movies)) {
    seeds.push({
      title: movie.title,
      genres: canonicalGenres([movie.genre]),
      weight: movie.status === 'watched' ? WEIGHT.movieWatched : WEIGHT.movieWatchlist,
      year: yearOfString(movie.releaseDate),
      rating: null,
    })
  }

  return seeds.filter((s) => s.genres.length > 0)
}

export function buildTaste(
  shows: Record<number, TrackedShow>,
  entries: Record<number, ShowCacheEntry>,
  movies: Record<string, Movie>,
  now = Date.now(),
): Taste {
  const seeds = collectSeeds(shows, entries, movies, now)
  const genres: Partial<Record<Genre, number>> = {}

  let yearSum = 0
  let yearWeight = 0
  let ratingSum = 0
  let ratingWeight = 0

  for (const seed of seeds) {
    // Spreading the weight keeps a five-genre title from outvoting a focused one.
    const per = seed.weight / seed.genres.length
    for (const g of seed.genres) {
      genres[g] = (genres[g] ?? 0) + per
    }
    if (seed.weight > 0) {
      if (seed.year) {
        yearSum += seed.year * seed.weight
        yearWeight += seed.weight
      }
      if (seed.rating) {
        ratingSum += seed.rating * seed.weight
        ratingWeight += seed.weight
      }
    }
  }

  // A disliked genre cancels evidence rather than flipping the vector negative.
  for (const key of Object.keys(genres) as Genre[]) {
    if ((genres[key] ?? 0) <= 0) delete genres[key]
  }

  const topGenres = (Object.entries(genres) as [Genre, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)

  return {
    genres,
    topGenres,
    seeds: seeds
      .filter((s) => s.weight > 0)
      .map(({ title, genres: g, weight }) => ({ title, genres: g, weight })),
    meanYear: yearWeight > 0 ? yearSum / yearWeight : null,
    meanRating: ratingWeight > 0 ? ratingSum / ratingWeight : null,
    seedCount: seeds.filter((s) => s.weight > 0).length,
    hasMovies: Object.keys(movies).length > 0,
    hasShows: Object.values(shows).some((s) => s.status === 'following'),
  }
}

// ---------- scoring ----------

function cosine(taste: Partial<Record<Genre, number>>, candidate: Genre[]): number {
  if (candidate.length === 0) return 0
  let dot = 0
  for (const g of candidate) dot += taste[g] ?? 0
  const tasteNorm = Math.sqrt(
    Object.values(taste).reduce((acc: number, v) => acc + (v as number) ** 2, 0),
  )
  const candNorm = Math.sqrt(candidate.length)
  if (tasteNorm === 0 || candNorm === 0) return 0
  return dot / (tasteNorm * candNorm)
}

function yearAffinity(year: number | null, meanYear: number | null): number {
  if (!year || !meanYear) return 0.5
  return Math.exp(-Math.abs(year - meanYear) / 25)
}

/**
 * Names the library titles this particular candidate actually resembles. Picking the
 * globally heaviest titles instead would print the same sentence on every row, which
 * reads as boilerplate and tells the user nothing.
 */
function reasonFor(candidate: Genre[], taste: Taste): string {
  const ranked = taste.seeds
    .map((seed) => {
      const overlap = seed.genres.filter((g) => candidate.includes(g)).length
      if (overlap === 0) return null
      const union = new Set([...seed.genres, ...candidate]).size
      return { title: seed.title, score: (overlap / union) * Math.sqrt(seed.weight) }
    })
    .filter((x): x is { title: string; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)

  const titles: string[] = []
  for (const { title } of ranked) {
    if (!titles.includes(title)) titles.push(title)
    if (titles.length === 2) break
  }

  if (titles.length === 0) {
    const shared = candidate.filter((g) => (taste.genres[g] ?? 0) > 0)
    return shared.length ? `Matches your taste for ${shared.slice(0, 2).join(' and ')}` : ''
  }
  return `Because you watch ${titles.join(' and ')}`
}

// ---------- candidates ----------

interface Scored {
  meta: CinemetaMeta
  type: 'movie' | 'series'
  score: number
  genres: Genre[]
}

function scoreMeta(meta: CinemetaMeta, type: 'movie' | 'series', taste: Taste): Scored | null {
  const genres = canonicalGenres(meta.genres ?? [])
  if (genres.length === 0) return null
  const rating = meta.imdbRating ? Number(meta.imdbRating) : null
  const score =
    SCORE.genre * cosine(taste.genres, genres) +
    SCORE.rating * (rating ? Math.min(1, Math.max(0, (rating - 5) / 4)) : 0.4) +
    SCORE.year * yearAffinity(yearOfString(meta.releaseInfo ?? meta.year), taste.meanYear)
  return { meta, type, score, genres }
}

function libraryKeys(): { imdb: Set<string>; titles: Set<string> } {
  const { shows, movies } = useLibrary.getState()
  const { entries } = useShowCache.getState()
  const imdb = new Set<string>()
  const titles = new Set<string>()
  for (const tracked of Object.values(shows)) {
    const entry = entries[tracked.id]
    if (entry?.show.imdbId) imdb.add(entry.show.imdbId)
    if (entry) titles.add(entry.show.name.toLowerCase())
  }
  for (const movie of Object.values(movies)) {
    if (movie.id.startsWith('tt')) imdb.add(movie.id)
    titles.add(movie.title.toLowerCase())
  }
  return { imdb, titles }
}

async function gatherCandidates(taste: Taste): Promise<Scored[]> {
  const seedGenres = taste.topGenres.slice(0, MAX_SEED_GENRES)
  if (seedGenres.length === 0) return []

  const types: ('movie' | 'series')[] = []
  if (taste.hasShows || !taste.hasMovies) types.push('series')
  if (taste.hasMovies) types.push('movie')

  const jobs: Promise<CinemetaMeta[]>[] = []
  const jobTypes: ('movie' | 'series')[] = []
  for (const genre of seedGenres) {
    for (const type of types) {
      jobs.push(fetchGenreCatalog(type, genre, 'imdbRating').catch(() => []))
      jobTypes.push(type)
    }
  }
  const results = await Promise.all(jobs)

  const { imdb, titles } = libraryKeys()
  const bestById = new Map<string, Scored>()
  results.forEach((metas, i) => {
    const type = jobTypes[i]
    for (const meta of metas.slice(0, CANDIDATES_PER_GENRE)) {
      const id = meta.imdb_id || meta.id
      if (!id || imdb.has(id) || titles.has(meta.name.toLowerCase())) continue
      const scored = scoreMeta(meta, type, taste)
      if (!scored) continue
      const prev = bestById.get(id)
      if (!prev || scored.score > prev.score) bestById.set(id, scored)
    }
  })

  return [...bestById.values()].sort((a, b) => b.score - a.score)
}

async function buildRecommendations(taste: Taste): Promise<Recommendation[]> {
  const scored = await gatherCandidates(taste)
  const out: Recommendation[] = []

  for (const s of scored.filter((s) => s.type === 'movie').slice(0, RESULT_LIMIT)) {
    out.push({
      kind: 'movie',
      movie: mapCinemetaMovie(s.meta),
      score: s.score,
      reason: reasonFor(s.genres, taste),
    })
  }

  // A series is only useful once it maps to a TVmaze record, so resolve the best few.
  const seriesTop = scored.filter((s) => s.type === 'series').slice(0, SHOWS_TO_RESOLVE)
  const resolved = await Promise.all(
    seriesTop.map(async (s) => {
      const id = s.meta.imdb_id || s.meta.id
      const show = await showByImdb(id).catch(() => null)
      return show ? { s, show } : null
    }),
  )
  const libraryShowIds = new Set(Object.keys(useLibrary.getState().shows).map(Number))
  for (const item of resolved) {
    if (!item || libraryShowIds.has(item.show.id)) continue
    out.push({
      kind: 'show',
      show: item.show,
      score: item.s.score,
      reason: reasonFor(item.s.genres, taste),
    })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, RESULT_LIMIT)
}

// ---------- store ----------

/** Changes to the library (or its episode counts) should invalidate the cache. */
function librarySignature(): string {
  const { shows, movies } = useLibrary.getState()
  const showPart = Object.values(shows)
    .map((s) => `${s.id}:${s.status}:${Object.keys(s.watched).length}`)
    .sort()
    .join(',')
  const moviePart = Object.values(movies)
    .map((m) => `${m.id}:${m.status}`)
    .sort()
    .join(',')
  return `${showPart}|${moviePart}`
}

interface RecommendState {
  items: Recommendation[]
  loading: boolean
  error: boolean
  taste: Taste | null
  signature: string
  fetchedAt: number
  load: (opts?: { force?: boolean }) => Promise<void>
}

export const useRecommend = create<RecommendState>((set, get) => ({
  items: [],
  loading: false,
  error: false,
  taste: null,
  signature: '',
  fetchedAt: 0,

  load: async (opts = {}) => {
    const state = get()
    if (state.loading) return
    const signature = librarySignature()
    const fresh = Date.now() - state.fetchedAt < CACHE_TTL_MS
    if (!opts.force && fresh && signature === state.signature && state.items.length > 0) return

    const { shows, movies } = useLibrary.getState()
    const { entries } = useShowCache.getState()
    const taste = buildTaste(shows, entries, movies)
    if (taste.topGenres.length === 0) {
      set({ items: [], taste, signature, fetchedAt: Date.now(), error: false })
      return
    }

    set({ loading: true, error: false })
    try {
      const items = await buildRecommendations(taste)
      set({ items, taste, signature, fetchedAt: Date.now(), loading: false })
    } catch (err) {
      console.warn('recommendations failed', err)
      set({ loading: false, error: true })
    }
  },
}))
