import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Episode, ShowCacheEntry, TrackedShow } from '../lib/types'
import { epCode } from '../lib/format'
import { summarise } from '../lib/ai'
import { deviceStorage } from '../lib/storage'

/**
 * "What happened so far" — a recap of a show built only from the episodes you have
 * actually watched.
 *
 * The spoiler-free promise is kept by this file, not by the model: unwatched episodes
 * are filtered out before anything is sent, so there is nothing ahead for it to leak
 * even if it wanted to. Asking a model to "avoid spoilers" while handing it the whole
 * season would be a promise made of hope.
 *
 * The model only ever sees text this app already downloaded and already shows on the
 * episode list. It is asked to join it up, not to recall the show.
 */

/** Enough to remember the thread; more than this and a small model starts summarising. */
const MAX_EPISODES = 8

/** Below this there is nothing to recap — the episode list itself is shorter. */
const MIN_EPISODES = 3

interface RecapState {
  /** Keyed by show id; the marker is the last watched episode, so it re-generates. */
  entries: Record<number, { text: string; marker: string }>
  generating: number | null
  generate: (tracked: TrackedShow, entry: ShowCacheEntry) => Promise<void>
}

/** Watched, in broadcast order, with something to say. */
export function recapSource(tracked: TrackedShow, entry: ShowCacheEntry): Episode[] {
  return entry.episodes
    .filter((ep) => tracked.watched[ep.id] && (ep.summary ?? '').trim().length > 0)
    .slice(-MAX_EPISODES)
}

/**
 * Changes whenever the watched set grows, so a recap is never stale — and stays put
 * when nothing has been watched since, so it is not regenerated on every visit.
 */
export function recapMarker(source: Episode[]): string {
  return source.length ? `${source.length}:${source[source.length - 1].id}` : ''
}

export function canRecap(tracked: TrackedShow, entry: ShowCacheEntry | undefined): boolean {
  if (!entry) return false
  return recapSource(tracked, entry).length >= MIN_EPISODES
}

export const useRecap = create<RecapState>()(
  persist(
    (set, get) => ({
      entries: {},
      generating: null,

      generate: async (tracked, entry) => {
        const source = recapSource(tracked, entry)
        if (source.length < MIN_EPISODES) return
        const marker = recapMarker(source)
        if (get().entries[tracked.id]?.marker === marker) return

        set({ generating: tracked.id })
        const body = source
          .map((ep) => `${epCode(ep.season, ep.number)} ${ep.name}: ${ep.summary}`)
          .join('\n')
        const text = await summarise(
          body,
          'These are episodes someone has already watched, in order. Retell them as one ' +
            'short paragraph reminding them where the story stands. Use only what is ' +
            'written here. Do not add events, and do not mention episode numbers.',
        )
        set((s) => ({
          generating: null,
          entries: text ? { ...s.entries, [tracked.id]: { text, marker } } : s.entries,
        }))
      },
    }),
    {
      name: 'filmtable-recap-v1',
      storage: createJSONStorage(() => deviceStorage),
      // Only the finished recaps are worth keeping; `generating` is about this moment.
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
)
