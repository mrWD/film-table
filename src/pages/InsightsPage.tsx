import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStats, type SourceName } from '../store/stats'
import { useLibrary } from '../store/library'
import { useShowCache } from '../store/cache'
import { buildStats } from '../store/selectors'
import { formatBigDuration, formatDateShort } from '../lib/format'
import { useUi } from '../store/ui'
import { aiAvailable } from '../lib/ai'
import { translateAvailability, type TranslateStatus } from '../lib/translate'

/**
 * What the phone itself can do, which is otherwise invisible.
 *
 * Both of these decide whether a feature appears at all, and when one says no the app
 * simply shows nothing — correct behaviour, and indistinguishable from a bug. Worth a
 * line on the page that already exists for questions like this. It also settled a real
 * one: the simulator reports Russian unsupported while the same Mac reports it supported,
 * so the phone is the only place the answer can be read.
 */
function OnDeviceStatus() {
  const [model, setModel] = useState<boolean | null>(null)
  const [translation, setTranslation] = useState<TranslateStatus | null>(null)

  useEffect(() => {
    void aiAvailable().then(setModel)
    void translateAvailability().then(setTranslation)
  }, [])

  if (model === null && translation === null) return null
  return (
    <>
      <h2 className="h2">On this device</h2>
      <p className="chips-hint">
        Writing model: {model === null ? '…' : model ? 'available' : 'not available'}
        {' · '}
        Translation: {translation ?? '…'}
      </p>
    </>
  )
}
import { isPersisted } from '../lib/durability'
import { IconBack } from '../components/Icons'

/**
 * Hidden diagnostics page (/insights) — not linked from the navigation.
 * Everything shown is computed on this device from counters that hold no
 * personal data: no search terms, no titles, no identifiers, nothing sent anywhere.
 */

const ROUTE_LABELS: Record<string, string> = {
  '/shows': 'Shows',
  '/movies': 'Movies',
  '/explore': 'Explore',
  '/profile': 'Profile',
  '/show': 'Show details',
  '/movie': 'Movie details',
  '/insights': 'Insights',
}

interface Environment {
  display: string
  serviceWorker: string
  storageUsedMb: string | null
  storageQuotaMb: string | null
  libraryKb: string
  cacheKb: string
  online: boolean
  storagePersisted: boolean
  language: string
  buildTime: string
}

function kb(text: string): string {
  return `${Math.round(new Blob([text]).size / 1024)} KB`
}

async function readEnvironment(): Promise<Environment> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null)
  let used: string | null = null
  let quota: string | null = null
  try {
    const est = await navigator.storage?.estimate()
    if (est?.usage != null) used = (est.usage / 1_048_576).toFixed(1)
    if (est?.quota != null) quota = (est.quota / 1_048_576).toFixed(0)
  } catch {
    /* not supported */
  }
  return {
    display: window.matchMedia('(display-mode: standalone)').matches
      ? 'Installed (standalone)'
      : 'Browser tab',
    serviceWorker: reg?.active?.state ?? 'not registered',
    storageUsedMb: used,
    storageQuotaMb: quota,
    libraryKb: kb(localStorage.getItem('filmtable-library-v1') ?? ''),
    cacheKb: kb(localStorage.getItem('filmtable-cache-v1') ?? ''),
    online: navigator.onLine,
    storagePersisted: await isPersisted(),
    language: navigator.language,
    buildTime: __BUILD_TIME__,
  }
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-num">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Bars({ data }: { data: [string, number][] }) {
  const max = Math.max(1, ...data.map(([, v]) => v))
  return (
    <div className="barlist">
      {data.map(([label, value]) => (
        <div key={label} className="barrow">
          <span className="barrow-label">{label}</span>
          <span className="barrow-track">
            <span className="barrow-fill" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="barrow-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** 13 weeks of activity, newest on the right. */
function ActivityStrip({ days }: { days: string[] }) {
  const set = new Set(days)
  const cells: { key: string; active: boolean }[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let i = 90; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    cells.push({ key, active: set.has(key) })
  }
  return (
    <div className="activity" aria-label="Days the app was opened, last 90 days">
      {cells.map((c) => (
        <span key={c.key} className={`activity-cell${c.active ? ' on' : ''}`} title={c.key} />
      ))}
    </div>
  )
}

export default function InsightsPage() {
  const navigate = useNavigate()
  const s = useStats()
  const reset = useStats((x) => x.reset)
  const shows = useLibrary((x) => x.shows)
  const movies = useLibrary((x) => x.movies)
  const entries = useShowCache((x) => x.entries)
  const askConfirm = useUi((x) => x.askConfirm)
  const showToast = useUi((x) => x.showToast)
  const [env, setEnv] = useState<Environment | null>(null)

  useEffect(() => {
    void readEnvironment().then(setEnv)
  }, [])

  const library = buildStats(shows, entries, movies)
  const followed = Object.values(shows).filter((t) => t.status === 'following').length
  const stopped = Object.values(shows).filter((t) => t.status === 'stopped').length
  const daysKnown = s.firstVisit
    ? Math.max(1, Math.round((Date.now() - s.firstVisit) / 86400000))
    : 0
  const stickiness = daysKnown > 0 ? Math.round((s.activeDays.length / daysKnown) * 100) : 0

  const routes = Object.entries(s.routeViews).sort((a, b) => b[1] - a[1])
  const sources = (['tmdb', 'cinemeta', 'itunes', 'tvmaze'] as SourceName[])
    .map((name) => [name.toUpperCase(), s.sourceHits[name] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)
  const errors = (['tmdb', 'cinemeta', 'itunes', 'tvmaze'] as SourceName[])
    .map((name) => [name.toUpperCase(), s.sourceErrors[name] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)

  return (
    <div className="page insights">
      <div className="insights-head">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
        <h1>Insights</h1>
      </div>
      <p className="chips-hint">
        Counted on this device only. No search terms, no titles, no identifiers — nothing is
        sent anywhere.
      </p>

      <OnDeviceStatus />

      <h2 className="h2">Usage</h2>
      <div className="stats">
        <Stat value={s.sessions} label="SESSIONS" />
        <Stat value={s.activeDays.length} label="ACTIVE DAYS" />
        <Stat value={`${stickiness}%`} label="OF DAYS USED" />
        <Stat value={s.searches} label="SEARCHES" />
      </div>
      {s.firstVisit && (
        <p className="chips-hint">
          First opened {formatDateShort(new Date(s.firstVisit))}
          {s.lastVisit ? ` · last ${formatDateShort(new Date(s.lastVisit))}` : ''}
        </p>
      )}
      {s.activeDays.length > 0 && <ActivityStrip days={s.activeDays} />}

      <h2 className="h2">Engagement</h2>
      <div className="stats">
        <Stat value={s.checkIns} label="CHECK-INS" />
        <Stat value={s.moviesMarked} label="MOVIES MARKED" />
        <Stat value={followed} label="SHOWS FOLLOWED" />
        <Stat value={stopped} label="SHOWS DROPPED" />
      </div>
      <p className="chips-hint">
        Library: {library.episodesWatched} episodes ({formatBigDuration(library.tvMinutes)}) ·{' '}
        {library.moviesWatched} movies ({formatBigDuration(library.movieMinutes)}) ·{' '}
        {Object.keys(entries).length} shows cached
      </p>

      {routes.length > 0 && (
        <>
          <h2 className="h2">Screens opened</h2>
          <Bars data={routes.map(([r, v]) => [ROUTE_LABELS[r] ?? r, v])} />
        </>
      )}

      {(sources.length > 0 || errors.length > 0) && (
        <>
          <h2 className="h2">Which source answered</h2>
          {sources.length > 0 && <Bars data={sources} />}
          {errors.length > 0 && (
            <>
              <p className="chips-hint">Failures (fell back to another source)</p>
              <Bars data={errors} />
            </>
          )}
        </>
      )}

      <h2 className="h2">Environment</h2>
      {env && (
        <div className="datacard">
          {[
            ['Mode', env.display],
            ['Service worker', env.serviceWorker],
            ['Network', env.online ? 'online' : 'offline'],
            [
              'Storage',
              env.storagePersisted
                ? 'persistent — the browser will not evict it on its own'
                : 'best effort — may be evicted; installing the app helps',
            ],
            [
              'Storage used',
              env.storageUsedMb ? `${env.storageUsedMb} MB of ${env.storageQuotaMb} MB` : 'n/a',
            ],
            ['Library size', env.libraryKb],
            ['Show cache size', env.cacheKb],
            ['Language', env.language],
            ['Build', env.buildTime],
          ].map(([k, v]) => (
            <div className="datarow" key={k}>
              <div>
                <div className="datarow-title">{k}</div>
                <div className="datarow-sub">{v}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="textbtn danger"
        onClick={async () => {
          const ok = await askConfirm({
            title: 'Reset these counters?',
            message: 'Usage counters go back to zero. Your library is not affected.',
            confirmLabel: 'Reset',
            danger: true,
          })
          if (ok) {
            reset()
            showToast('Counters reset')
          }
        }}
      >
        Reset counters
      </button>
      <p className="attribution">
        Hidden page · reachable at /#/insights · not linked from the navigation
      </p>
    </div>
  )
}
