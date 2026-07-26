import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Local usage counters for the hidden /insights page.
 *
 * Deliberately counts only. No search queries, no titles, no identifiers, no
 * timestamps of individual actions — nothing that could describe a person. The
 * data never leaves the device and is not part of the library backup.
 */

export type SourceName = 'tmdb' | 'cinemeta' | 'itunes' | 'tvmaze'

/** Keeping ~13 weeks is enough for the activity strip without growing forever. */
const MAX_DAYS = 90

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface StatsState {
  firstVisit: number | null
  lastVisit: number | null
  /** Backups are the only defence against the browser clearing storage. */
  lastExportAt: number | null
  sessions: number
  /** YYYY-MM-DD of days the app was opened, newest last. */
  activeDays: string[]
  routeViews: Record<string, number>
  searches: number
  /** Which source actually answered — shows how often the keyless fallback carries. */
  sourceHits: Partial<Record<SourceName, number>>
  sourceErrors: Partial<Record<SourceName, number>>
  checkIns: number
  moviesMarked: number
  recommendationsShown: number

  recordExport: () => void
  startSession: () => void
  recordRoute: (route: string) => void
  recordSearch: () => void
  recordSource: (source: SourceName) => void
  recordSourceError: (source: SourceName) => void
  recordCheckIn: () => void
  recordMovieMarked: () => void
  recordRecommendations: (count: number) => void
  reset: () => void
}

const EMPTY = {
  firstVisit: null,
  lastVisit: null,
  lastExportAt: null as number | null,
  sessions: 0,
  activeDays: [] as string[],
  routeViews: {} as Record<string, number>,
  searches: 0,
  sourceHits: {} as Partial<Record<SourceName, number>>,
  sourceErrors: {} as Partial<Record<SourceName, number>>,
  checkIns: 0,
  moviesMarked: 0,
  recommendationsShown: 0,
}

export const useStats = create<StatsState>()(
  persist(
    (set) => ({
      ...EMPTY,

      recordExport: () => set({ lastExportAt: Date.now() }),

      startSession: () =>
        set((s) => {
          const now = Date.now()
          const day = today()
          const days = s.activeDays.includes(day) ? s.activeDays : [...s.activeDays, day]
          return {
            firstVisit: s.firstVisit ?? now,
            lastVisit: now,
            sessions: s.sessions + 1,
            activeDays: days.slice(-MAX_DAYS),
          }
        }),

      recordRoute: (route) =>
        set((s) => ({ routeViews: { ...s.routeViews, [route]: (s.routeViews[route] ?? 0) + 1 } })),

      recordSearch: () => set((s) => ({ searches: s.searches + 1 })),

      recordSource: (source) =>
        set((s) => ({ sourceHits: { ...s.sourceHits, [source]: (s.sourceHits[source] ?? 0) + 1 } })),

      recordSourceError: (source) =>
        set((s) => ({
          sourceErrors: { ...s.sourceErrors, [source]: (s.sourceErrors[source] ?? 0) + 1 },
        })),

      recordCheckIn: () => set((s) => ({ checkIns: s.checkIns + 1 })),

      recordMovieMarked: () => set((s) => ({ moviesMarked: s.moviesMarked + 1 })),

      recordRecommendations: (count) =>
        set((s) => ({ recommendationsShown: s.recommendationsShown + count })),

      reset: () => set({ ...EMPTY }),
    }),
    { name: 'filmtable-stats-v1', version: 1 },
  ),
)

/** One session per browser tab visit, so a reload does not inflate the count. */
export function beginSessionOnce(): void {
  try {
    if (sessionStorage.getItem('ft-session') === '1') return
    sessionStorage.setItem('ft-session', '1')
  } catch {
    // private mode without sessionStorage — counting every load is close enough
  }
  useStats.getState().startSession()
}

/** Module-level helpers so non-React code can report without importing the hook. */
export const stats = {
  source: (s: SourceName) => useStats.getState().recordSource(s),
  error: (s: SourceName) => useStats.getState().recordSourceError(s),
  search: () => useStats.getState().recordSearch(),
}
