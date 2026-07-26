import { create } from 'zustand'
import {
  clearHandle,
  loadHandle,
  requestPersistence,
  saveHandle,
  supportsFileBackup,
} from '../lib/durability'
import { buildBackup, useLibrary } from './library'
import { useStats } from './stats'
import { useUi } from './ui'

/**
 * Automatic backup to a file the person chooses.
 *
 * The point is to put a copy where clearing site data cannot reach it. Everything inside
 * the browser — localStorage, IndexedDB, caches — goes together when someone clears the
 * site; a file on their own disk does not.
 *
 * There is no way to do this silently on first run, and there should not be: the app gets
 * to write to a file only because the person picked it. After that, Chromium remembers
 * the grant and writes need no further clicks. Safari and Firefox have no such API, so
 * there the profile keeps nudging for a manual export instead — the honest fallback.
 */

/**
 * File System Access is Chromium-only, so it is absent from the DOM lib. Declare the one
 * call used here rather than pulling in a types package for a single signature.
 */
interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

const WRITE_DEBOUNCE_MS = 4000

export type BackupState = 'unsupported' | 'off' | 'on' | 'needs-permission'

interface AutoBackupState {
  state: BackupState
  fileName: string | null
  lastWriteAt: number | null
  writing: boolean

  init: () => Promise<void>
  choose: () => Promise<void>
  resume: () => Promise<void>
  disable: () => Promise<void>
}

let handle: FileSystemFileHandle | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let subscribed = false

type PermissionState = 'granted' | 'denied' | 'prompt'
interface WithPermissions extends FileSystemFileHandle {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
}

async function permission(h: FileSystemFileHandle, ask: boolean): Promise<PermissionState> {
  const p = h as WithPermissions
  const current = (await p.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  if (current === 'granted' || !ask) return current
  return (await p.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
}

async function write(): Promise<boolean> {
  if (!handle) return false
  const stream = await handle.createWritable()
  await stream.write(JSON.stringify(buildBackup(), null, 2))
  await stream.close()
  return true
}

export const useAutoBackup = create<AutoBackupState>((set, get) => ({
  state: supportsFileBackup() ? 'off' : 'unsupported',
  fileName: null,
  lastWriteAt: null,
  writing: false,

  init: async () => {
    // Worth asking only once there is a library to protect.
    void requestPersistence(Object.keys(useLibrary.getState().shows).length +
        Object.keys(useLibrary.getState().movies).length >
        0)

    if (!supportsFileBackup()) return
    const saved = await loadHandle()
    if (!saved) return
    handle = saved
    const p = await permission(saved, false)
    set({
      state: p === 'granted' ? 'on' : 'needs-permission',
      fileName: saved.name,
    })
    if (p === 'granted') get().resume()
  },

  choose: async () => {
    try {
      const picker = window.showSaveFilePicker
      if (!picker) return
      const picked = await picker({
        suggestedName: 'filmtable-backup.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      handle = picked
      await saveHandle(picked)
      set({ state: 'on', fileName: picked.name })
      await write()
      set({ lastWriteAt: Date.now() })
      useStats.getState().recordExport()
      useUi.getState().showToast(`Backing up to ${picked.name}`)
      get().resume()
    } catch {
      // Cancelling the picker is a normal answer, not an error.
    }
  },

  /** Start (or restart) mirroring library changes into the chosen file. */
  resume: async () => {
    if (!handle) return
    if ((await permission(handle, true)) !== 'granted') {
      set({ state: 'needs-permission' })
      return
    }
    set({ state: 'on' })
    if (subscribed) return
    subscribed = true
    useLibrary.subscribe(() => {
      // Debounced: checking off a status should not mean a disk write per keystroke.
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        set({ writing: true })
        try {
          if (await write()) {
            set({ lastWriteAt: Date.now() })
            useStats.getState().recordExport()
          }
        } catch {
          // The file may have been moved or the grant revoked; ask again rather than
          // failing silently every few seconds.
          set({ state: 'needs-permission' })
        } finally {
          set({ writing: false })
        }
      }, WRITE_DEBOUNCE_MS)
    })
  },

  disable: async () => {
    handle = null
    if (timer) clearTimeout(timer)
    await clearHandle()
    set({ state: 'off', fileName: null, lastWriteAt: null })
  },
}))
