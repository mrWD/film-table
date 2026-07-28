import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { buildBackup, isValidBackup, useLibrary } from '../store/library'
import { useShowCache } from '../store/cache'
import { useUi } from '../store/ui'
import { buildStats } from '../store/selectors'
import { useTheme, type ThemeChoice } from '../store/theme'
import { useStats } from '../store/stats'
import { COUNTRIES, useRegion } from '../store/region'
import { YearReview } from '../components/YearReview'
import { AutoBackup } from '../components/AutoBackup'
import { SupportLinks } from '../components/Support'
import { Feedback } from '../components/Feedback'
import { formatBigDuration } from '../lib/format'
import { Poster } from '../components/ui'
import { IconDownload, IconTrash, IconUpload, IconUser } from '../components/Icons'

/**
 * The library exists only in this browser: clearing site data wipes it, and Safari's
 * tracking prevention can clear it on its own for a site that lives in a tab. A backup is
 * the only defence, so once there is enough to lose, say so — quietly, and not forever.
 */
function BackupNudge({ items }: { items: number }) {
  const lastExportAt = useStats((s) => s.lastExportAt)
  if (items < 15) return null
  const days = lastExportAt ? Math.floor((Date.now() - lastExportAt) / 86400000) : null
  if (days !== null && days < 60) return null
  return (
    <p className="chips-hint">
      {days === null
        ? `${items} entries and no backup yet — export one, it is a single file.`
        : `Last backup was ${days} days ago.`}
    </p>
  )
}

export default function ProfilePage() {
  const shows = useLibrary((s) => s.shows)
  const movies = useLibrary((s) => s.movies)
  const importBackup = useLibrary((s) => s.importBackup)
  const resetAll = useLibrary((s) => s.resetAll)
  const entries = useShowCache((s) => s.entries)
  const showToast = useUi((s) => s.showToast)
  const askConfirm = useUi((s) => s.askConfirm)
  const country = useRegion((s) => s.country)
  const setCountry = useRegion((s) => s.setCountry)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const fileRef = useRef<HTMLInputElement>(null)

  const stats = buildStats(shows, entries, movies)

  const shelves: { label: string; ids: number[] }[] = [
    {
      label: 'Watching',
      ids: Object.values(shows)
        .filter((t) => t.status === 'following')
        .map((t) => t.id),
    },
    {
      label: 'Stopped',
      ids: Object.values(shows)
        .filter((t) => t.status === 'stopped')
        .map((t) => t.id),
    },
  ]

  const movieShelves = [
    { label: 'Movie watch list', list: Object.values(movies).filter((m) => m.status === 'watchlist') },
    { label: 'Movies watched', list: Object.values(movies).filter((m) => m.status === 'watched') },
  ]

  const doExport = () => {
    const backup = buildBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `filmtable-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    useStats.getState().recordExport()
    showToast('Backup exported')
  }

  const doImport = async (file: File) => {
    try {
      const text = await file.text()
      const data: unknown = JSON.parse(text)
      if (!isValidBackup(data)) throw new Error('not a FilmTable backup')
      const ok = await askConfirm({
        title: 'Import backup?',
        message: 'Your current library will be replaced by the backup contents.',
        confirmLabel: 'Import',
      })
      if (!ok) return
      importBackup(data)
      showToast('Backup imported')
    } catch (err) {
      console.warn(err)
      showToast('Import failed: not a valid backup file')
    }
  }

  return (
    <div className="page profile">
      <div className="profile-head">
        <div className="avatar">
          <IconUser size={34} strokeWidth={1.6} />
        </div>
        <h1>My library</h1>
        <p className="profile-sub">Stored on this device · no account needed</p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-num">{formatBigDuration(stats.tvMinutes)}</span>
          <span className="stat-label">WATCH TIME</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.episodesWatched}</span>
          <span className="stat-label">EPISODES</span>
        </div>
        <div className="stat">
          <span className="stat-num">{formatBigDuration(stats.movieMinutes)}</span>
          <span className="stat-label">MOVIE TIME</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.moviesWatched}</span>
          <span className="stat-label">MOVIES</span>
        </div>
      </div>

      {shelves.map(
        (shelf) =>
          shelf.ids.length > 0 && (
            <section key={shelf.label}>
              <h2 className="h2">
                {shelf.label} <span className="h2-count">{shelf.ids.length}</span>
              </h2>
              <div className="shelf">
                {shelf.ids.map((id) => {
                  const entry = entries[id]
                  return (
                    <Link key={id} to={`/show/${id}`} className="shelf-item">
                      <Poster src={entry?.show.image} alt={entry?.show.name ?? `Show ${id}`} className="shelf-poster" />
                    </Link>
                  )
                })}
              </div>
            </section>
          ),
      )}

      {movieShelves.map(
        (shelf) =>
          shelf.list.length > 0 && (
            <section key={shelf.label}>
              <h2 className="h2">
                {shelf.label} <span className="h2-count">{shelf.list.length}</span>
              </h2>
              <div className="shelf">
                {shelf.list.map((m) => (
                  <Link key={m.id} to={`/movie/${m.id}`} className="shelf-item">
                    <Poster src={m.poster} alt={m.title} className="shelf-poster" />
                  </Link>
                ))}
              </div>
            </section>
          ),
      )}

      <section>
        <YearReview />

        <h2 className="h2">Where to watch</h2>
        <p className="chips-hint">
          Streaming availability is licensed per country, so it needs to know yours.
        </p>
        <select
          className="regionselect"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          aria-label="Country for streaming availability"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        <h2 className="h2">Appearance</h2>
        <div className="chips">
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((t) => (
            <button
              key={t}
              className={`chip${theme === t ? ' active' : ''}`}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="chips-hint">
          {theme === 'system'
            ? 'Following your device setting.'
            : `Always ${theme}, whatever the device is set to.`}
        </p>
      </section>

      <section>
        <h2 className="h2">Data</h2>
        <BackupNudge items={Object.keys(shows).length + Object.keys(movies).length} />
        <div className="datacard">
          <button className="datarow" onClick={doExport}>
            <IconDownload size={20} />
            <div>
              <div className="datarow-title">Export backup</div>
              <div className="datarow-sub">Download your library as a JSON file</div>
            </div>
          </button>
          <button className="datarow" onClick={() => fileRef.current?.click()}>
            <IconUpload size={20} />
            <div>
              <div className="datarow-title">Import backup</div>
              <div className="datarow-sub">Restore from a FilmTable backup file</div>
            </div>
          </button>
          <AutoBackup />
          <button
            className="datarow danger"
            onClick={async () => {
              const ok = await askConfirm({
                title: 'Reset everything?',
                message: 'All shows, movies and watch history on this device will be deleted.',
                confirmLabel: 'Delete all',
                danger: true,
              })
              if (ok) {
                resetAll()
                showToast('Library cleared')
              }
            }}
          >
            <IconTrash size={20} />
            <div>
              <div className="datarow-title">Reset all data</div>
              <div className="datarow-sub">Delete the whole library from this device</div>
            </div>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
            e.target.value = ''
          }}
        />
      </section>

      <section>
        <h2 className="h2">Feedback &amp; contact</h2>
        <Feedback />
      </section>

      <section>
        <h2 className="h2">Support</h2>
        <SupportLinks />
      </section>

      <section>
        <h2 className="h2">More from the author</h2>
        <p className="attribution">
          <a href="https://mrwd.github.io/" target="_blank" rel="noreferrer">
            All products &rarr;
          </a>
        </p>
      </section>

      <p className="attribution">
        FilmTable · a free, fan-made, local-first tracker · not affiliated with TV Time or Whip
        Media
      </p>
      <p className="attribution">
        TV data from{' '}
        <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
          TVmaze
        </a>{' '}
        (CC BY-SA) · movie data from{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
          TMDB
        </a>
        , Cinemeta and iTunes
      </p>
      <p className="attribution">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  )
}
