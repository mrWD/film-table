/**
 * Donation buttons and links out of the app, under App Store guideline 3.1.1.
 *
 * Outside the US storefront an app may neither show a donation button nor lead anyone to
 * one — and the author's site carries Buy Me a Coffee, Ko-fi and PayPal. So inside the
 * native shell the Support section is not rendered, and every link to the author's sites
 * carries `?from=app`. Those sites hide their donation buttons for that visitor for twelve
 * hours: mrwd.github.io through its `from-app.js`, and this app's own web build through
 * `cameFromApp` below, under the same storage key. Everyone else on the web still sees
 * the Support section.
 */
import { isNativeApp } from 'tables-core'

const KEY = 'mrwd-from-app-until'
const TTL_MS = 12 * 60 * 60 * 1000
const MARK = /[?&]from=app(&|$)/

/** `url` with `from=app` added to its query, ahead of any fragment. */
export function fromApp(url: string): string {
  const hashAt = url.indexOf('#')
  const base = hashAt === -1 ? url : url.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : url.slice(hashAt)
  return `${base}${base.includes('?') ? '&' : '?'}from=app${hash}`
}

/** A link to one of the author's sites, marked when it leaves the native app. */
export function siteLink(url: string): string {
  return isNativeApp() ? fromApp(url) : url
}

/**
 * This browser came here from one of the apps, now or within the last twelve hours.
 * Recording the mark is idempotent, so calling this while rendering is harmless.
 */
export function cameFromApp(): boolean {
  if (typeof window === 'undefined') return false
  const marked = MARK.test(window.location.search)
  try {
    if (marked) localStorage.setItem(KEY, String(Date.now() + TTL_MS))
    return marked || Number(localStorage.getItem(KEY) ?? 0) > Date.now()
  } catch {
    // Storage blocked: the mark still covers this visit, because the URL had it.
    return marked
  }
}

/** No donation buttons: inside the native app, or for a visitor who came from one. */
export function donationsHidden(): boolean {
  return isNativeApp() || cameFromApp()
}
