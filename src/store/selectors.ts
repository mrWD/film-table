import type { Episode, Movie, ShowCacheEntry, ShowSummary, TrackedShow } from '../lib/types'
import { daysUntil, startOfDay, weekdayName } from '../lib/format'

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_RUNTIME = 40

export function isAired(ep: Episode, now: Date): boolean {
  if (ep.airstamp) return new Date(ep.airstamp).getTime() <= now.getTime()
  if (ep.airdate) {
    const end = new Date(`${ep.airdate}T23:59:59`)
    return end.getTime() <= now.getTime()
  }
  return false
}

export function epDate(ep: Episode): Date | null {
  if (ep.airstamp) return new Date(ep.airstamp)
  if (ep.airdate) return new Date(`${ep.airdate}T20:00:00`)
  return null
}

export type ShowBucket = 'watchNext' | 'notStarted' | 'stale' | 'upToDate' | 'loading'

export interface WatchItem {
  show: ShowSummary
  tracked: TrackedShow
  bucket: ShowBucket
  next?: Episode
  /** count of aired unwatched episodes beyond `next` (the "+N") */
  moreBehind: number
  airedCount: number
  watchedCount: number
  totalCount: number
  firstUpcoming?: Episode
}

export function buildWatchItem(
  tracked: TrackedShow,
  entry: ShowCacheEntry | undefined,
  now: Date,
): WatchItem | null {
  if (!entry) return null
  const { show, episodes } = entry
  if (entry.fetchedAt === 0 && episodes.length === 0) {
    return {
      show,
      tracked,
      bucket: 'loading',
      moreBehind: 0,
      airedCount: 0,
      watchedCount: 0,
      totalCount: 0,
    }
  }
  const aired = episodes.filter((e) => isAired(e, now))
  const watchedCount = episodes.filter((e) => tracked.watched[e.id]).length
  const unwatchedAired = aired.filter((e) => !tracked.watched[e.id])
  const next = unwatchedAired[0]
  const firstUpcoming = episodes.find((e) => !isAired(e, now) && epDate(e) !== null)

  let bucket: ShowBucket
  if (!next) {
    bucket = 'upToDate'
  } else if (watchedCount === 0) {
    bucket = 'notStarted'
  } else if (tracked.lastWatchedAt && now.getTime() - tracked.lastWatchedAt > STALE_AFTER_MS) {
    bucket = 'stale'
  } else {
    bucket = 'watchNext'
  }

  return {
    show,
    tracked,
    bucket,
    next,
    moreBehind: Math.max(0, unwatchedAired.length - 1),
    airedCount: aired.length,
    watchedCount,
    totalCount: episodes.length,
    firstUpcoming,
  }
}

export function buildWatchItems(
  shows: Record<number, TrackedShow>,
  entries: Record<number, ShowCacheEntry>,
  now: Date,
): WatchItem[] {
  const items: WatchItem[] = []
  for (const tracked of Object.values(shows)) {
    if (tracked.status !== 'following') continue
    const item = buildWatchItem(tracked, entries[tracked.id], now)
    if (item) items.push(item)
  }
  // Most recently watched first inside each bucket feels natural
  items.sort((a, b) => (b.tracked.lastWatchedAt ?? b.tracked.addedAt) - (a.tracked.lastWatchedAt ?? a.tracked.addedAt))
  return items
}

// ---------- Upcoming (shows) ----------

export interface UpcomingEntry {
  show: ShowSummary
  ep: Episode
  when: Date
  aired: boolean
  isLatest: boolean
  premiere: boolean
  watched: boolean
}

export function buildUpcoming(
  shows: Record<number, TrackedShow>,
  entries: Record<number, ShowCacheEntry>,
  now: Date,
): UpcomingEntry[] {
  const out: UpcomingEntry[] = []
  const today = startOfDay(now).getTime()
  for (const tracked of Object.values(shows)) {
    if (tracked.status !== 'following') continue
    const entry = entries[tracked.id]
    if (!entry) continue
    const future: UpcomingEntry[] = []
    let latestMarked = false
    for (const ep of entry.episodes) {
      const when = epDate(ep)
      if (!when) continue
      const isToday = startOfDay(when).getTime() === today
      const aired = isAired(ep, now)
      if (aired && !isToday) continue
      const e: UpcomingEntry = {
        show: entry.show,
        ep,
        when,
        aired,
        isLatest: false,
        premiere: ep.number === 1,
        watched: Boolean(tracked.watched[ep.id]),
      }
      if (!aired && !latestMarked) {
        e.isLatest = true
        latestMarked = true
      }
      if (isToday) out.push(e)
      else future.push(e)
    }
    // Keep the noise down: everything within 14 days, plus the next one beyond that
    const soon = future.filter((e) => daysUntil(e.when, now) <= 14)
    const beyond = future.filter((e) => daysUntil(e.when, now) > 14)
    out.push(...soon.slice(0, 6))
    if (soon.length === 0 && beyond.length > 0) out.push(beyond[0])
  }
  out.sort((a, b) => a.when.getTime() - b.when.getTime())
  return out
}

export interface UpcomingGroup<T> {
  label: string
  entries: T[]
}

export function groupByDay<T extends { when: Date }>(entries: T[], now: Date): UpcomingGroup<T>[] {
  const groups: UpcomingGroup<T>[] = []
  const byLabel = new Map<string, UpcomingGroup<T>>()
  for (const e of entries) {
    const days = daysUntil(e.when, now)
    let label: string
    if (days <= 0) label = 'TODAY'
    else if (days === 1) label = 'TOMORROW'
    else if (days < 7) label = weekdayName(e.when)
    else label = 'LATER'
    let g = byLabel.get(label)
    if (!g) {
      g = { label, entries: [] }
      byLabel.set(label, g)
      groups.push(g)
    }
    g.entries.push(e)
  }
  return groups
}

// ---------- Movies ----------

export function movieReleased(m: Movie, now: Date): boolean {
  if (!m.releaseDate) return true
  return new Date(m.releaseDate).getTime() <= now.getTime()
}

export interface UpcomingMovieEntry {
  movie: Movie
  when: Date
}

export function buildUpcomingMovies(movies: Record<string, Movie>, now: Date): UpcomingMovieEntry[] {
  const out: UpcomingMovieEntry[] = []
  for (const m of Object.values(movies)) {
    if (m.status !== 'watchlist' || !m.releaseDate) continue
    const when = new Date(m.releaseDate)
    if (when.getTime() > now.getTime()) out.push({ movie: m, when })
  }
  out.sort((a, b) => a.when.getTime() - b.when.getTime())
  return out
}

// ---------- Stats ----------

export interface Stats {
  episodesWatched: number
  tvMinutes: number
  moviesWatched: number
  movieMinutes: number
}

export function buildStats(
  shows: Record<number, TrackedShow>,
  entries: Record<number, ShowCacheEntry>,
  movies: Record<string, Movie>,
): Stats {
  let episodesWatched = 0
  let tvMinutes = 0
  for (const tracked of Object.values(shows)) {
    const entry = entries[tracked.id]
    if (!entry) {
      episodesWatched += Object.keys(tracked.watched).length
      tvMinutes += Object.keys(tracked.watched).length * DEFAULT_RUNTIME
      continue
    }
    for (const ep of entry.episodes) {
      if (tracked.watched[ep.id]) {
        episodesWatched += 1
        tvMinutes += ep.runtime ?? entry.show.averageRuntime ?? DEFAULT_RUNTIME
      }
    }
  }
  let moviesWatched = 0
  let movieMinutes = 0
  for (const m of Object.values(movies)) {
    if (m.status === 'watched') {
      moviesWatched += 1
      movieMinutes += m.runtimeMin ?? 100
    }
  }
  return { episodesWatched, tvMinutes, moviesWatched, movieMinutes }
}
