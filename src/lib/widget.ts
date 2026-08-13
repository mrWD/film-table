import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from 'tables-core'
import { epCode } from './format'
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

    const upcoming: Entry[] = buildUpcoming(shows, entries, now)
      .filter((u) => !u.aired)
      .slice(0, LIMIT)
      .map((u) => ({
        id: String(u.show.id),
        show: u.show.name,
        episode: epCode(u.ep.season, u.ep.number),
        title: u.ep.name,
        airsAt: u.when.getTime(),
        network: u.show.network ?? undefined,
        poster: u.show.image ? posterName(u.show.id) : undefined,
      }))

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
