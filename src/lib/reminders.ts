import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from 'tables-core'
import { useShowCache } from '../store/cache'
import { useLibrary } from '../store/library'

/**
 * "A new episode airs" notifications, built entirely from data already on the device:
 * the episode lists in the cache carry air timestamps, so no server and no push
 * infrastructure is involved — the schedule is recomputed from the cache on every open.
 *
 * iOS silently keeps only the 64 soonest pending notifications per app, so the schedule
 * is capped well below that and simply refills as time passes and the app is opened.
 *
 * Everything is a no-op in a browser, and nothing here may ever throw into the app.
 */

/** Fixed id block, so rescheduling can cancel exactly its own notifications. */
const EPISODE_ID_BASE = 1000
const MAX_SCHEDULED = 20

function airTime(airstamp?: string | null, airdate?: string | null): number {
  if (airstamp) {
    const t = Date.parse(airstamp)
    if (Number.isFinite(t)) return t
  }
  // Date-only sources get the evening of that day, local time — better a slightly
  // wrong hour than a notification at midnight.
  if (airdate) {
    const t = new Date(`${airdate}T20:00:00`).getTime()
    if (Number.isFinite(t)) return t
  }
  return NaN
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

export async function rescheduleEpisodeAlerts(enabled: boolean): Promise<void> {
  if (!isNativeApp()) return
  try {
    await LocalNotifications.cancel({
      notifications: Array.from({ length: MAX_SCHEDULED }, (_, i) => ({ id: EPISODE_ID_BASE + i })),
    })
    if (!enabled) return

    const { shows } = useLibrary.getState()
    const { entries } = useShowCache.getState()
    const now = Date.now()

    const upcoming: { show: string; season: number; number: number | null; name: string; at: number }[] = []
    for (const tracked of Object.values(shows)) {
      if (tracked.status !== 'following') continue
      const entry = entries[tracked.id]
      if (!entry) continue
      for (const ep of entry.episodes) {
        const at = airTime(ep.airstamp, ep.airdate)
        if (Number.isFinite(at) && at > now) {
          upcoming.push({ show: entry.show.name, season: ep.season, number: ep.number, name: ep.name, at })
        }
      }
    }
    upcoming.sort((a, b) => a.at - b.at)

    const batch = upcoming.slice(0, MAX_SCHEDULED).map((e, i) => ({
      id: EPISODE_ID_BASE + i,
      title: e.show,
      // The app's own episode format — 3×01, deliberately not S03E01 (see DECISIONS).
      body: `${e.season}×${e.number != null ? String(e.number).padStart(2, '0') : '?'} · ${e.name} airs today.`,
      schedule: { at: new Date(e.at), allowWhileIdle: true },
    }))
    if (batch.length > 0) await LocalNotifications.schedule({ notifications: batch })
  } catch {
    // Scheduling failed; the library is untouched and the next open tries again.
  }
}
