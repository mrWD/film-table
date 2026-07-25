import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { buildUpcomingMovies } from '../store/selectors'
import { MovieRow, UpcomingMovieRow } from '../components/cards'
import { EmptyState, SectionPill, TopTabs, useNow } from '../components/ui'
import { IconClapper } from '../components/Icons'

export default function MoviesPage() {
  const [tab, setTab] = useState('WATCHLIST')
  const movies = useLibrary((s) => s.movies)
  const setMovieStatus = useLibrary((s) => s.setMovieStatus)
  const showToast = useUi((s) => s.showToast)
  const now = useNow()

  const all = Object.values(movies)
  const watchlist = all
    .filter((m) => m.status === 'watchlist')
    .sort((a, b) => b.addedAt - a.addedAt)
  const watched = all
    .filter((m) => m.status === 'watched')
    .sort((a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0))
  const upcoming = buildUpcomingMovies(movies, now)

  if (all.length === 0) {
    return (
      <div className="page">
        <TopTabs tabs={['WATCHLIST', 'UPCOMING']} active={tab} onChange={setTab} />
        <EmptyState
          icon={<IconClapper size={44} strokeWidth={1.4} />}
          title="No movies yet"
          text="Search for movies and build your watch list."
          actionLabel="Explore movies"
          actionTo="/explore?mode=movies"
        />
      </div>
    )
  }

  return (
    <div className="page">
      <TopTabs tabs={['WATCHLIST', 'UPCOMING']} active={tab} onChange={setTab} />
      {tab === 'WATCHLIST' ? (
        <>
          {watchlist.length > 0 && (
            <section>
              <SectionPill>UP NEXT</SectionPill>
              {watchlist.map((m) => (
                <MovieRow
                  key={m.id}
                  movie={m}
                  checked={false}
                  onCheck={() => {
                    setMovieStatus(m.id, 'watched')
                    showToast(`${m.title} watched`, () => setMovieStatus(m.id, 'watchlist'))
                  }}
                />
              ))}
            </section>
          )}
          {watched.length > 0 && (
            <section>
              <SectionPill>WATCHED</SectionPill>
              {watched.map((m) => (
                <MovieRow
                  key={m.id}
                  movie={m}
                  checked
                  onCheck={() => {
                    setMovieStatus(m.id, 'watchlist')
                    showToast(`${m.title} moved to watch list`)
                  }}
                />
              ))}
            </section>
          )}
          {watchlist.length === 0 && watched.length === 0 && (
            <EmptyState
              icon={<IconClapper size={44} strokeWidth={1.4} />}
              title="Watch list is empty"
              text="Add movies from Explore."
              actionLabel="Browse movies"
              actionTo="/explore?mode=movies"
            />
          )}
        </>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section>
              <SectionPill>LATER</SectionPill>
              {upcoming.map((e) => (
                <UpcomingMovieRow key={e.movie.id} entry={e} now={now} />
              ))}
            </section>
          ) : (
            <EmptyState
              icon={<IconClapper size={44} strokeWidth={1.4} />}
              title="No upcoming movies"
              text="Movies on your watch list that aren't out yet will appear here."
            />
          )}
          <div className="center-cta">
            <Link to="/explore?mode=movies" className="btn outline">
              BROWSE MOVIES
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
