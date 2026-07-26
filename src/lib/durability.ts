/**
 * Two defences for a library that exists only in this browser.
 *
 * `requestPersistence` asks the browser to stop evicting our storage on its own — under
 * disk pressure, or after a long absence. It is a request, not a setting: Chrome grants
 * it on engagement signals (installed, bookmarked, used often), and a fresh profile is
 * simply told no. Nothing here defends against someone clearing site data deliberately;
 * that is a guarantee browsers make to the user and we should not want to break it.
 *
 * The file handle helpers back automatic backup. A handle cannot go in localStorage —
 * it survives structured clone but not JSON — so it lives in a one-key IndexedDB store.
 */

const DB = 'filmtable-handles'
const STORE = 'handles'
const KEY = 'backup-file'

/** Asking with an empty library wastes the one cheap signal we have. */
export async function requestPersistence(hasSomethingToLose: boolean): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    if (!hasSomethingToLose) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

export async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  await withStore('readwrite', (s) => s.put(handle, KEY) as IDBRequest<unknown>)
}

export async function loadHandle(): Promise<FileSystemFileHandle | null> {
  return withStore<FileSystemFileHandle>('readonly', (s) => s.get(KEY))
}

export async function clearHandle(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY) as IDBRequest<unknown>)
}

export function supportsFileBackup(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}
