import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ShowCacheEntry, ShowSummary } from '../lib/types'
import { fetchShowWithEpisodes } from '../lib/api'
import { deviceStorage } from '../lib/storage'

const TTL_MS = 12 * 60 * 60 * 1000

interface CacheState {
  entries: Record<number, ShowCacheEntry>
  prime: (show: ShowSummary) => void
  put: (entry: ShowCacheEntry) => void
}

export const useShowCache = create<CacheState>()(
  persist(
    (set) => ({
      entries: {},
      /** Store a summary immediately (from search results) so UI can render while episodes load */
      prime: (show) =>
        set((s) => {
          if (s.entries[show.id]) return s
          return {
            entries: { ...s.entries, [show.id]: { fetchedAt: 0, show, episodes: [] } },
          }
        }),
      put: (entry) =>
        set((s) => ({ entries: { ...s.entries, [entry.show.id]: entry } })),
    }),
    {
      name: 'filmtable-cache-v1',
      version: 1,
      // Episode lists for every followed show — the other blob that outgrew localStorage.
      storage: createJSONStorage(() => deviceStorage),
    },
  ),
)

const inflight = new Set<number>()

export async function ensureShow(id: number, opts: { force?: boolean } = {}): Promise<void> {
  const { entries } = useShowCache.getState()
  const entry = entries[id]
  const fresh = entry && Date.now() - entry.fetchedAt < TTL_MS
  if (fresh && !opts.force) return
  if (inflight.has(id)) return
  inflight.add(id)
  try {
    const { show, episodes } = await fetchShowWithEpisodes(id)
    useShowCache.getState().put({ fetchedAt: Date.now(), show, episodes })
  } catch (err) {
    console.warn('ensureShow failed', id, err)
  } finally {
    inflight.delete(id)
  }
}

/** Refresh stale followed shows, politely staggered for TVmaze rate limits. */
export async function refreshShows(ids: number[]): Promise<void> {
  for (const id of ids) {
    const entry = useShowCache.getState().entries[id]
    const fresh = entry && Date.now() - entry.fetchedAt < TTL_MS
    if (fresh) continue
    await ensureShow(id)
    await new Promise((r) => setTimeout(r, 250))
  }
}
