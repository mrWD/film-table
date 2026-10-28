import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Anonymous usage counts, sent once a day.
 *
 * The owner chose this over an analytics service (2026-10-28): on by default, an off
 * switch in Profile, no identifiers of any kind. Every app follows one contract —
 * app-metrics/docs/CLIENT.md — and the server refuses a body that strays from it, so
 * a mistake here shows up as a 400 rather than as bad numbers.
 *
 * What leaves the device: counts of named actions and screens, error kinds, the app
 * version, platform, UI language and the local date. Never a title, a search, anything
 * typed, an error message or a URL. `count` and `countError` only add to counters kept
 * in localStorage; the one network call is `flush`, at launch and on resume.
 */

const ENDPOINT =
  (import.meta.env.VITE_METRICS_URL as string | undefined) ??
  'https://mrwd-metrics.vercel.app/api/ping'

const APP = 'film-table'
const KEY = 'filmtable-metrics-v1'
/** The UI is English-only; this is the language actually shown, not the phone's. */
const LANG = 'en'

/** The server's own limits (lib/protocol.js). Past them a ping is refused forever. */
const NAME = /^[a-z][a-z0-9_]{1,31}$/
const KIND = /^[A-Za-z][A-Za-z0-9_]{1,31}$/
const MAX_EVENTS = 40
const MAX_ERRORS = 20

interface State {
  enabled: boolean
  installDay: string
  /** ISO week of the first launch with metrics, or 'legacy' for a library from before. */
  cohort: string
  /** Set from the last successful ping only. */
  lastDay: string | null
  lastWeek: string | null
  lastMonth: string | null
  events: Record<string, number>
  errors: Record<string, number>
}

let state: State | null = null
let sending = false
const listeners = new Set<() => void>()

/** The device's local date — a ping belongs to the day the person is living in. */
function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO 8601 week of a 'YYYY-MM-DD' date, as 'YYYY-Www' — the same as the server's. */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  const weekday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - weekday + 3)
  const year = date.getUTCFullYear()
  const week = 1 + Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000))
  return `${year}-W${String(week).padStart(2, '0')}`
}

function load(): State | null {
  if (state) return state
  try {
    const raw = localStorage.getItem(KEY)
    state = raw ? (JSON.parse(raw) as State) : null
  } catch {
    state = null
  }
  return state
}

function save(next: State): void {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage full or blocked — the counters live on in memory for this run
  }
}

function add(into: Record<string, number>, name: string, n: number, max: number) {
  if (!(name in into) && Object.keys(into).length >= max) return
  into[name] = (into[name] ?? 0) + n
}

/** Add to a local counter. No network, and nothing at all while switched off. */
export function count(name: string, n = 1): void {
  const s = load()
  if (!s?.enabled || !NAME.test(name) || !Number.isInteger(n) || n < 1) return
  add(s.events, name, n, MAX_EVENTS)
  save(s)
}

/** An error by kind (`TypeError`, `api_tmdb`) — never its message. */
export function countError(kind: string): void {
  const s = load()
  if (!s?.enabled) return
  add(s.errors, KIND.test(kind) ? kind : 'Other', 1, MAX_ERRORS)
  save(s)
}

/** A failed API call. Offline is not a failure of the source, so it is not counted. */
export function countApiError(source: string): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  countError(`api_${source}`)
}

export function metricsEnabled(): boolean {
  return load()?.enabled ?? false
}

/** For useSyncExternalStore, so the Profile switch and the notice move together. */
export function subscribeMetrics(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Off clears what has been counted and sends nothing more; on resumes the same cohort. */
export function setMetricsEnabled(enabled: boolean): void {
  const s = load()
  if (!s) return
  save(enabled ? { ...s, enabled } : { ...s, enabled, events: {}, errors: {} })
  for (const listener of listeners) listener()
}

let versionPromise: Promise<string> | null = null

/** Marketing version and build in the app; the build date on the web. */
function appVersion(): Promise<string> {
  versionPromise ??= Capacitor.isNativePlatform()
    ? App.getInfo().then(
        (info) => `${info.version} (${info.build})`,
        () => 'unknown',
      )
    : Promise.resolve(__BUILD_TIME__.slice(0, 10))
  return versionPromise.then((v) => v.replace(/[^0-9A-Za-z.()\- ]/g, '').slice(0, 24) || 'unknown')
}

function platform(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}

/** Send the counters since the last ping, if today has not had one yet. */
export async function flush(): Promise<void> {
  const s = load()
  if (!s?.enabled || sending) return
  const day = localDay()
  if (s.lastDay === day) return

  const week = isoWeek(day)
  const month = day.slice(0, 7)
  const ever = s.lastDay === null && s.cohort !== 'legacy'
  // The server takes a first-ever ping only in its cohort's week. A device that could
  // not get one through that week (offline, switched off) joins in the week it does.
  const cohort = ever ? week : s.cohort
  const events = { ...s.events }
  const errors = { ...s.errors }
  const body = {
    v: 1,
    app: APP,
    platform: platform(),
    version: await appVersion(),
    lang: LANG,
    day,
    cohort,
    first: { ever, week: s.lastWeek !== week, month: s.lastMonth !== month },
    events,
    errors,
  }

  sending = true
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      // text/plain keeps the browser from sending a preflight request first.
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      keepalive: true,
    })
    if (res.status !== 204) return
    // Only what was sent is cleared: anything counted while the request was out stays.
    const now = load()!
    const left = (from: Record<string, number>, sent: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(from)
          .map(([k, v]) => [k, v - (sent[k] ?? 0)] as const)
          .filter(([, v]) => v > 0),
      )
    save({
      ...now,
      cohort,
      lastDay: day,
      lastWeek: week,
      lastMonth: month,
      events: left(now.events, events),
      errors: left(now.errors, errors),
    })
  } catch {
    // No network: everything stays for the next launch.
  } finally {
    sending = false
  }
}

function errorKind(value: unknown): string {
  const name = value instanceof Error ? value.name : ''
  return KIND.test(name) ? name : 'Other'
}

/**
 * Called once the library has hydrated, so `hasData` can tell a device that used the app
 * before metrics existed — its first ping must not look like an install.
 */
export function startMetrics(hasData: () => boolean): void {
  if (!load()) {
    const day = localDay()
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    save({
      enabled: !(platform() === 'web' && gpc === true),
      installDay: day,
      cohort: hasData() ? 'legacy' : isoWeek(day),
      lastDay: null,
      lastWeek: null,
      lastMonth: null,
      events: {},
      errors: {},
    })
  }

  window.addEventListener('error', (e) => countError(errorKind(e.error)))
  window.addEventListener('unhandledrejection', (e) => countError(errorKind(e.reason)))

  void flush()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
  // The WebView does not always report visibility when the app returns from the background.
  if (Capacitor.isNativePlatform()) void App.addListener('resume', () => void flush())
}
