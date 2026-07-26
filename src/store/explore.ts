import { create } from 'zustand'
import type { MovieResult, ShowSummary } from '../lib/types'
import {
  fetchSchedule,
  normalizeTitle,
  searchMovies,
  searchShows,
  type ScheduleItem,
} from '../lib/api'
import { upcomingMoviesTmdb } from '../lib/tmdb'

export type ExploreMode = 'all' | 'shows' | 'movies'

export type MixedResult =
  | { kind: 'show'; show: ShowSummary }
  | { kind: 'movie'; movie: MovieResult }

/** Exact title matches float to the top, then each source keeps its own ranking. */
function relevance(title: string, query: string, index: number): number {
  const t = normalizeTitle(title)
  const q = normalizeTitle(query)
  const tier = t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3
  return tier * 1000 + index
}

function mixResults(shows: ShowSummary[], movies: MovieResult[], query: string): MixedResult[] {
  const scored = [
    ...shows.map((show, i) => ({
      item: { kind: 'show' as const, show },
      score: relevance(show.name, query, i),
    })),
    ...movies.map((movie, i) => ({
      item: { kind: 'movie' as const, movie },
      score: relevance(movie.title, query, i),
    })),
  ]
  scored.sort((a, b) => a.score - b.score)
  return scored.map((s) => s.item)
}

interface ExploreState {
  query: string
  mode: ExploreMode
  showResults: ShowSummary[]
  movieResults: MovieResult[]
  mixedResults: MixedResult[]
  searching: boolean
  searchError: boolean

  tonight: ScheduleItem[]
  popular: ShowSummary[]
  comingSoon: MovieResult[]
  discoverLoading: boolean

  setMode: (m: ExploreMode) => void
  setQuery: (q: string) => void
  runSearch: (q: string, mode: ExploreMode) => Promise<void>
  loadDiscover: (now: Date) => Promise<void>
}

let searchSeq = 0

export const useExplore = create<ExploreState>((set, get) => ({
  query: '',
  mode: 'all',
  showResults: [],
  movieResults: [],
  mixedResults: [],
  searching: false,
  searchError: false,

  tonight: [],
  popular: [],
  comingSoon: [],
  discoverLoading: false,

  setMode: (mode) => {
    set({ mode })
    const q = get().query.trim()
    if (q) void get().runSearch(q, mode)
  },

  setQuery: (query) => set({ query }),

  runSearch: async (q, mode) => {
    const seq = ++searchSeq
    const term = q.trim()
    if (!term) {
      set({
        showResults: [],
        movieResults: [],
        mixedResults: [],
        searching: false,
        searchError: false,
      })
      return
    }
    set({ searching: true, searchError: false })
    try {
      if (mode === 'shows') {
        const results = await searchShows(term)
        if (seq === searchSeq) set({ showResults: results, searching: false })
      } else if (mode === 'movies') {
        const results = await searchMovies(term)
        if (seq === searchSeq) set({ movieResults: results, searching: false })
      } else {
        const [shows, movies] = await Promise.all([
          searchShows(term).catch(() => [] as ShowSummary[]),
          searchMovies(term).catch(() => [] as MovieResult[]),
        ])
        if (seq === searchSeq) {
          set({
            showResults: shows,
            movieResults: movies,
            mixedResults: mixResults(shows, movies, term),
            searching: false,
          })
        }
      }
    } catch (err) {
      console.warn('search failed', err)
      if (seq === searchSeq) set({ searching: false, searchError: true })
    }
  },

  loadDiscover: async (now) => {
    if (get().tonight.length > 0 || get().discoverLoading) return
    set({ discoverLoading: true })
    // Theatrical releases need the TMDB proxy; fire-and-forget so the keyless
    // sections below never wait on it.
    void upcomingMoviesTmdb().then((movies) => {
      if (movies && movies.length > 0) set({ comingSoon: movies.slice(0, 6) })
    })
    try {
      const tonightItems = await fetchSchedule(now)
      const dedupe = new Map<number, ScheduleItem>()
      for (const item of tonightItems) {
        const prev = dedupe.get(item.show.id)
        if (!prev) dedupe.set(item.show.id, item)
      }
      const tonight = [...dedupe.values()]
        .sort((a, b) => (b.show.weight ?? 0) - (a.show.weight ?? 0))
        .slice(0, 12)
      set({ tonight })

      // "Popular this week": aggregate next 6 days of schedule, rank by weight+rating
      const days: Date[] = []
      for (let i = 1; i <= 6; i++) days.push(new Date(now.getTime() + i * 86400000))
      const week = new Map<number, ShowSummary>()
      for (const d of days) {
        try {
          const items = await fetchSchedule(d)
          for (const it of items) week.set(it.show.id, it.show)
        } catch {
          /* partial data is fine */
        }
        await new Promise((r) => setTimeout(r, 150))
      }
      for (const t of tonight) week.set(t.show.id, t.show)
      const popular = [...week.values()]
        .filter((s) => s.image)
        .sort(
          (a, b) =>
            (b.weight ?? 0) - (a.weight ?? 0) || (b.rating ?? 0) - (a.rating ?? 0),
        )
        .slice(0, 21)
      set({ popular, discoverLoading: false })
    } catch (err) {
      console.warn('discover failed', err)
      set({ discoverLoading: false })
    }
  },
}))
