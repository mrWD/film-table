import type { StateStorage } from 'zustand/middleware'
import { useUi } from '../store/ui'

/**
 * IndexedDB-backed storage for the two stores that hold real data: the library and the
 * show cache.
 *
 * localStorage served well until two of its limits started to matter. Its ~5 MB ceiling
 * is why movie descriptions are stripped before writing and why a quota guard existed at
 * all; IndexedDB quotas are measured in hundreds of megabytes. And on iOS the plan is to
 * wrap the app natively, where the WebView's localStorage is the first thing the OS
 * reclaims under pressure — IndexedDB is both sturdier there and the format the native
 * storage plugin migrates from.
 *
 * The values are still the same JSON strings zustand's persist writes; only the shelf
 * they sit on changes. Each value lives under its store name in one object store.
 */

const DB_NAME = 'filmtable-kv'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        // If the connection is severed (another tab upgrades, browser reclaims it),
        // drop the cached promise so the next call reopens instead of failing forever.
        req.result.onclose = () => {
          dbPromise = null
        }
        resolve(req.result)
      }
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = run(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

/** A write that fails silently would lose check-ins one by one; say so, once. */
let writeWarned = false

/**
 * The one-time move from localStorage. The old value is copied, not deleted: a frozen
 * copy costs a few megabytes and means that rolling back to a build that still reads
 * localStorage finds the library as of the migration moment rather than nothing.
 */
async function migrateFromLocalStorage(name: string): Promise<string | null> {
  const legacy = localStorage.getItem(name)
  if (legacy === null) return null
  try {
    await request('readwrite', (s) => s.put(legacy, name))
  } catch {
    // IndexedDB refused; the app keeps running off the localStorage value this session.
  }
  return legacy
}

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const value = await request<string | undefined>('readonly', (s) => s.get(name))
      if (value !== undefined) return value
      return await migrateFromLocalStorage(name)
    } catch {
      // IndexedDB unavailable (broken profile, some private modes) — fall back to
      // whatever localStorage holds so the person at least sees their old library.
      return localStorage.getItem(name)
    }
  },
  setItem: async (name, value) => {
    try {
      await request('readwrite', (s) => s.put(value, name))
      writeWarned = false
    } catch {
      if (writeWarned) return
      writeWarned = true
      useUi.getState().showToast('Saving failed — export a backup from your profile')
    }
  },
  removeItem: async (name) => {
    try {
      await request('readwrite', (s) => s.delete(name))
    } catch {
      // Nothing to do: the key either goes next time or the DB itself is gone.
    }
  },
}

/**
 * Async storage means async hydration: for a moment after load the stores hold their
 * defaults, and anything reading them sees an empty library. Rendering is therefore
 * held until hydration settles (main.tsx). The timeout is a backstop for the rare
 * profile where IndexedDB hangs on open — a late library beats a blank screen.
 */
export function whenHydrated(
  stores: { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } }[],
  timeoutMs = 2500,
): Promise<void> {
  const all = Promise.all(
    stores.map(
      (s) =>
        new Promise<void>((resolve) => {
          if (s.persist.hasHydrated()) return resolve()
          const un = s.persist.onFinishHydration(() => {
            un()
            resolve()
          })
        }),
    ),
  )
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  return Promise.race([all, timeout]).then(() => undefined)
}
