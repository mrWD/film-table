import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from 'tables-core'
import { epCode } from './format'
import { epDate } from '../store/selectors'
import { useLibrary } from '../store/library'
import { useShowCache } from '../store/cache'
import { buildUpcoming, buildWatchItems } from '../store/selectors'

/**
 * Feeding the home-screen widgets.
 *
 * The widgets run outside the app and cannot read its storage, so what they show is a
 * snapshot the app pushes into a shared App Group. This is the only place that snapshot
 * is built, and it is built from the same selectors the Shows screen uses — a widget
 * that computed "up next" its own way would eventually disagree with the app, and the
 * disagreement would be invisible until someone noticed the numbers differ.
 *
 * Nothing is sent anywhere. The App Group is on-device storage shared between two of
 * our own processes; the library still never leaves the phone.
 */

interface WidgetBridgePlugin {
  write(options: { json: string }): Promise<void>
  cachePoster(options: { name: string; url: string }): Promise<void>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

interface Entry {
  id: string
  show: string
  episode: string
  title: string
  airsAt?: number
  /** True for an episode that is already out and still unwatched. */
  aired?: boolean
  network?: string
  remaining?: number
  poster?: string
}

/** Two rows fit a medium widget and five a large one; more would only be written. */
const LIMIT = 5

/** Stable, filesystem-safe name so the same poster is cached once. */
function posterName(showId: number): string {
  return `show-${showId}.jpg`
}

export async function refreshWidgets(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const now = new Date()
    const { shows } = useLibrary.getState()
    const { entries } = useShowCache.getState()

    const upNext: Entry[] = buildWatchItems(shows, entries, now)
      .filter((item) => item.bucket === 'watchNext' && item.next)
      .slice(0, LIMIT)
      .map((item) => ({
        id: String(item.show.id),
        show: item.show.name,
        episode: epCode(item.next!.season, item.next!.number),
        title: item.next!.name,
        remaining: item.moreBehind,
        poster: item.show.image ? posterName(item.show.id) : undefined,
      }))

    // Deliberately not `buildUpcoming` alone: that one hides everything already aired
    // except today's, because the app's Upcoming tab is a schedule. On a widget the
    // interesting rows are the ones you can act on — an episode that came out on Tuesday
    // and is still unwatched belongs above one that airs on Friday. Sorting by date
    // ascending puts the recent past first and the schedule after it, which is the order
    // TV Time uses and the reason it reads well.
    const RECENT_DAYS = 14
    const since = now.getTime() - RECENT_DAYS * 86400000
    const recentlyAired: Entry[] = []
    for (const tracked of Object.values(shows)) {
      if (tracked.status !== 'following') continue
      const entry = entries[tracked.id]
      if (!entry) continue
      for (const ep of entry.episodes) {
        const when = epDate(ep)
        if (!when || tracked.watched[ep.id]) continue
        const at = when.getTime()
        if (at > now.getTime() || at < since) continue
        recentlyAired.push({
          id: String(entry.show.id),
          show: entry.show.name,
          episode: epCode(ep.season, ep.number),
          title: ep.name,
          airsAt: at,
          aired: true,
          network: entry.show.network ?? undefined,
          poster: entry.show.image ? posterName(entry.show.id) : undefined,
        })
      }
    }

    const scheduled: Entry[] = buildUpcoming(shows, entries, now)
      .filter((u) => !u.aired)
      .map((u) => ({
        id: String(u.show.id),
        show: u.show.name,
        episode: epCode(u.ep.season, u.ep.number),
        title: u.ep.name,
        airsAt: u.when.getTime(),
        aired: false,
        network: u.show.network ?? undefined,
        poster: u.show.image ? posterName(u.show.id) : undefined,
      }))

    const upcoming = [...recentlyAired, ...scheduled]
      .sort((a, b) => (a.airsAt ?? 0) - (b.airsAt ?? 0))
      .slice(0, LIMIT)

    await WidgetBridge.write({
      json: JSON.stringify({ upNext, upcoming, updatedAt: Date.now() }),
    })

    // Posters go over one at a time and after the snapshot: the widget should get its
    // text immediately and fill in pictures as they land, rather than wait for both.
    const wanted = new Map<number, string>()
    for (const item of [...upNext, ...upcoming]) {
      const id = Number(item.id)
      const image = entries[id]?.show.image
      if (item.poster && image) wanted.set(id, image)
    }
    for (const [id, url] of wanted) {
      await WidgetBridge.cachePoster({ name: posterName(id), url }).catch(() => {})
    }
  } catch (err) {
    // A widget that fails to update is not a reason for anything in the app to break,
    // but staying silent about it cost an hour once — so it says so where the device
    // log can see it.
    console.error('[widget] refresh failed', err)
  }
}
