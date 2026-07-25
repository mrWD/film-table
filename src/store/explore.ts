import { create } from 'zustand'
import type { MovieResult, ShowSummary } from '../lib/types'
import { fetchSchedule, searchMovies, searchShows, type ScheduleItem } from '../lib/api'

export type ExploreMode = 'shows' | 'movies'

interface ExploreState {
  query: string
  mode: ExploreMode
  showResults: ShowSummary[]
  movieResults: MovieResult[]
  searching: boolean
  searchError: boolean

  tonight: ScheduleItem[]
  popular: ShowSummary[]
  discoverLoading: boolean

  setMode: (m: ExploreMode) => void
  setQuery: (q: string) => void
  runSearch: (q: string, mode: ExploreMode) => Promise<void>
  loadDiscover: (now: Date) => Promise<void>
}

let searchSeq = 0

export const useExplore = create<ExploreState>((set, get) => ({
  query: '',
  mode: 'shows',
  showResults: [],
  movieResults: [],
  searching: false,
  searchError: false,

  tonight: [],
  popular: [],
  discoverLoading: false,

  setMode: (mode) => {
    set({ mode })
    const q = get().query.trim()
    if (q) void get().runSearch(q, mode)
  },

  setQuery: (query) => set({ query }),

  runSearch: async (q, mode) => {
    const seq = ++searchSeq
    if (!q.trim()) {
      set({ showResults: [], movieResults: [], searching: false, searchError: false })
      return
    }
    set({ searching: true, searchError: false })
    try {
      if (mode === 'shows') {
        const results = await searchShows(q.trim())
        if (seq === searchSeq) set({ showResults: results, searching: false })
      } else {
        const results = await searchMovies(q.trim())
        if (seq === searchSeq) set({ movieResults: results, searching: false })
      }
    } catch (err) {
      console.warn('search failed', err)
      if (seq === searchSeq) set({ searching: false, searchError: true })
    }
  },

  loadDiscover: async (now) => {
    if (get().tonight.length > 0 || get().discoverLoading) return
    set({ discoverLoading: true })
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
