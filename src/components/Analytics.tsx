import { Analytics as VercelAnalytics } from '@vercel/analytics/react'

/**
 * Vercel Web Analytics: cookieless page-view counts, no persistent identifiers,
 * no cross-site tracking. It is the only thing in the app that reports anything
 * off-device, and it reports a screen name — never a search term or a title.
 */

/** The script is served by Vercel, so on GitHub Pages it would only 404. */
function onVercel(): boolean {
  const host = window.location.hostname
  return host.endsWith('.vercel.app') || host === 'film-table.app'
}

/**
 * HashRouter keeps the screen in the fragment, which analytics never sees — every
 * view would arrive as "/". Rewrite it to the screen, collapsing per-title routes
 * so the report stays a handful of pages instead of one row per show.
 */
function screenUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  const path = url.hash.replace(/^#/, '').split('?')[0] || '/'
  const collapsed = path.startsWith('/show/')
    ? '/show'
    : path.startsWith('/movie/')
      ? '/movie'
      : path
  return `${url.origin}${collapsed}`
}

export function Analytics() {
  if (!onVercel()) return null
  return <VercelAnalytics beforeSend={(event) => ({ ...event, url: screenUrl(event.url) })} />
}
