import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BackupFile, Episode, Movie, MovieResult, TrackedShow } from '../lib/types'
import { idbStorage } from '../lib/idb-storage'
import { useStats } from './stats'

interface LibraryState {
  shows: Record<number, TrackedShow>
  movies: Record<string, Movie>
  /** UI prefs worth persisting */
  watchGrid: boolean

  followShow: (id: number) => void
  removeShow: (id: number) => void
  setShowStatus: (id: number, status: TrackedShow['status']) => void
  setEpisodeWatched: (showId: number, episodeId: number, watched: boolean) => void
  setEpisodesWatched: (showId: number, episodeIds: number[], watched: boolean) => void

  addMovie: (m: MovieResult, status: Movie['status']) => void
  setMovieStatus: (id: string, status: Movie['status']) => void
  updateMovieMeta: (id: string, patch: Partial<MovieResult>) => void
  removeMovie: (id: string) => void

  setWatchGrid: (grid: boolean) => void
  importBackup: (b: BackupFile) => void
  resetAll: () => void
}

function recomputeLastWatched(t: TrackedShow): number | undefined {
  const times = Object.values(t.watched)
  return times.length ? Math.max(...times) : undefined
}

/** Drops the one field that costs more than everything else in an entry combined. */
function withoutDescriptions(movies: Record<string, Movie>): Record<string, Movie> {
  const out: Record<string, Movie> = {}
  for (const [id, movie] of Object.entries(movies)) {
    if (movie.description === undefined) {
      out[id] = movie
      continue
    }
    const { description: _drop, ...rest } = movie
    out[id] = rest as Movie
  }
  return out
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      shows: {},
      movies: {},
      watchGrid: false,

      followShow: (id) =>
        set((s) => {
          if (s.shows[id]) {
            return {
              shows: { ...s.shows, [id]: { ...s.shows[id], status: 'following' } },
            }
          }
          const tracked: TrackedShow = { id, addedAt: Date.now(), status: 'following', watched: {} }
          return { shows: { ...s.shows, [id]: tracked } }
        }),

      removeShow: (id) =>
        set((s) => {
          const shows = { ...s.shows }
          delete shows[id]
          return { shows }
        }),

      setShowStatus: (id, status) =>
        set((s) => {
          const t = s.shows[id]
          if (!t) return s
          return { shows: { ...s.shows, [id]: { ...t, status } } }
        }),

      setEpisodeWatched: (showId, episodeId, watched) => {
        // Side effects stay outside the updater: it must be pure, and StrictMode
        // runs it twice, which would double every counter.
        if (watched) useStats.getState().recordCheckIn()
        set((s) => {
          const t = s.shows[showId]
          if (!t) return s
          const w = { ...t.watched }
          if (watched) w[episodeId] = Date.now()
          else delete w[episodeId]
          const next: TrackedShow = { ...t, watched: w }
          next.lastWatchedAt = recomputeLastWatched(next)
          return { shows: { ...s.shows, [showId]: next } }
        })
      },

      setEpisodesWatched: (showId, episodeIds, watched) =>
        set((s) => {
          const t = s.shows[showId]
          if (!t) return s
          const w = { ...t.watched }
          const now = Date.now()
          for (const id of episodeIds) {
            if (watched) w[id] = w[id] ?? now
            else delete w[id]
          }
          const next: TrackedShow = { ...t, watched: w }
          next.lastWatchedAt = recomputeLastWatched(next)
          return { shows: { ...s.shows, [showId]: next } }
        }),

      addMovie: (m, status) =>
        set((s) => {
          const existing = s.movies[m.id]
          if (existing) {
            return {
              movies: {
                ...s.movies,
                [m.id]: {
                  ...existing,
                  ...m,
                  status,
                  watchedAt: status === 'watched' ? existing.watchedAt ?? Date.now() : undefined,
                },
              },
            }
          }
          const movie: Movie = {
            ...m,
            addedAt: Date.now(),
            status,
            watchedAt: status === 'watched' ? Date.now() : undefined,
          }
          return { movies: { ...s.movies, [m.id]: movie } }
        }),

      setMovieStatus: (id, status) => {
        if (status === 'watched') useStats.getState().recordMovieMarked()
        set((s) => {
          const m = s.movies[id]
          if (!m) return s
          return {
            movies: {
              ...s.movies,
              [id]: { ...m, status, watchedAt: status === 'watched' ? Date.now() : undefined },
            },
          }
        })
      },

      /** Search results carry only a poster and a year; details arrive later. */
      updateMovieMeta: (id, patch) =>
        set((s) => {
          const m = s.movies[id]
          if (!m) return s
          return { movies: { ...s.movies, [id]: { ...m, ...patch, id: m.id } } }
        }),

      removeMovie: (id) =>
        set((s) => {
          const movies = { ...s.movies }
          delete movies[id]
          return { movies }
        }),

      setWatchGrid: (grid) => set({ watchGrid: grid }),

      importBackup: (b) => set({ shows: b.shows ?? {}, movies: b.movies ?? {} }),

      resetAll: () => set({ shows: {}, movies: {} }),
    }),
    {
      name: 'filmtable-library-v1',
      version: 1,
      // IndexedDB via idbStorage: no ~5 MB localStorage ceiling, and the value migrates
      // once from localStorage on first load (see idb-storage.ts). Hydration is async —
      // main.tsx holds the first render until it settles.
      storage: createJSONStorage(() => idbStorage),
      // A movie's overview is re-fetched on its detail page and never shown in a list, so
      // writing it only inflates the library. Shows are unaffected: they are stored by id.
      partialize: (s) => ({
        shows: s.shows,
        movies: withoutDescriptions(s.movies),
        watchGrid: s.watchGrid,
      }),
    },
  ),
)

export function buildBackup(): BackupFile {
  const { shows, movies } = useLibrary.getState()
  return {
    app: 'filmtable',
    version: 1,
    exportedAt: new Date().toISOString(),
    shows,
    movies,
  }
}

export function isValidBackup(data: unknown): data is BackupFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Partial<BackupFile>
  return d.app === 'filmtable' && d.version === 1 && typeof d.shows === 'object' && typeof d.movies === 'object'
}

/** Convenience: mark/unmark an episode object (used by check-in flows) */
export function toggleEpisode(showId: number, ep: Episode, watched: boolean) {
  useLibrary.getState().setEpisodeWatched(showId, ep.id, watched)
}
