import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useExplore, type ExploreMode } from '../store/explore'
import type { ScheduleItem } from '../lib/api'
import type { MovieResult, ShowSummary } from '../lib/types'
import { MovieResultRow, ShowResultRow, AddShowButton } from '../components/cards'
import { Poster, SkeletonRows } from '../components/ui'
import { useRecommend } from '../store/recommend'
import { IconSearch, IconTv, IconX } from '../components/Icons'
import { yearOf } from '../lib/format'

const STRIP_COLORS = ['strip-beige', 'strip-blue', 'strip-pink', 'strip-green']

export default function ExplorePage() {
  const [params] = useSearchParams()
  const {
    query,
    mode,
    setMode,
    setQuery,
    runSearch,
    showResults,
    movieResults,
    mixedResults,
    searching,
    searchError,
    tonight,
    popular,
    comingSoon,
    discoverLoading,
    loadDiscover,
  } = useExplore()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const m = params.get('mode')
    if (m === 'movies' || m === 'shows') setMode(m)
    void loadDiscover(new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInput = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(value, useExplore.getState().mode)
    }, 350)
  }

  const hasQuery = query.trim().length > 0

  return (
    <div className="page">
      <div className="searchwrap">
        <div className="searchbar">
          <IconSearch size={20} strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search shows and movies"
            onChange={(e) => onInput(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {hasQuery && (
            <button
              className="searchclear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                void runSearch('', mode)
                inputRef.current?.focus()
              }}
            >
              <IconX size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
        <div className="chips">
          {(['all', 'shows', 'movies'] as ExploreMode[]).map((m) => (
            <button key={m} className={`chip${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {hasQuery ? (
        <div className="results">
          {searching && <SkeletonRows count={4} />}
          {!searching && searchError && (
            <p className="hint">Search failed. Check your connection and try again.</p>
          )}
          {!searching && !searchError && mode === 'all' && (
            <>
              {mixedResults.map((r) =>
                r.kind === 'show' ? (
                  <ShowResultRow key={`s${r.show.id}`} show={r.show} typeTag />
                ) : (
                  <MovieResultRow key={`m${r.movie.id}`} result={r.movie} typeTag />
                ),
              )}
              {mixedResults.length === 0 && (
                <p className="hint">Nothing found for “{query.trim()}”.</p>
              )}
            </>
          )}
          {!searching && !searchError && mode === 'shows' && (
            <>
              {showResults.map((s) => (
                <ShowResultRow key={s.id} show={s} />
              ))}
              {showResults.length === 0 && <p className="hint">No shows found for “{query.trim()}”.</p>}
            </>
          )}
          {!searching && !searchError && mode === 'movies' && (
            <>
              {movieResults.map((m) => (
                <MovieResultRow key={m.id} result={m} />
              ))}
              {movieResults.length === 0 && <p className="hint">No movies found for “{query.trim()}”.</p>}
            </>
          )}
        </div>
      ) : (
        <Discover tonight={tonight} popular={popular} comingSoon={comingSoon} loading={discoverLoading} />
      )}
    </div>
  )
}

function ForYou() {
  const { items, loading, error, taste, load } = useRecommend()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nothing in the library yet — the discovery sections below are the better answer.
  if (!loading && items.length === 0 && (taste?.topGenres.length ?? 0) === 0) return null

  return (
    <section>
      <div className="h2-row">
        <h2 className="h2">For you</h2>
        {taste && taste.topGenres.length > 0 && (
          <button className="textbtn" onClick={() => void load({ force: true })} disabled={loading}>
            Refresh
          </button>
        )}
      </div>
      {taste && taste.topGenres.length > 0 && (
        <p className="chips-hint">
          Based on {taste.seedCount} title{taste.seedCount === 1 ? '' : 's'} in your library ·{' '}
          {taste.topGenres.slice(0, 3).join(', ')}
        </p>
      )}
      {loading && items.length === 0 && <SkeletonRows count={3} />}
      {error && items.length === 0 && (
        <p className="hint">Could not build recommendations right now.</p>
      )}
      {items.map((r) =>
        r.kind === 'show' ? (
          <ShowResultRow key={`rs${r.show.id}`} show={r.show} typeTag reason={r.reason} />
        ) : (
          <MovieResultRow key={`rm${r.movie.id}`} result={r.movie} typeTag reason={r.reason} />
        ),
      )}
    </section>
  )
}

function Discover({
  tonight,
  popular,
  comingSoon,
  loading,
}: {
  tonight: ScheduleItem[]
  popular: ShowSummary[]
  comingSoon: MovieResult[]
  loading: boolean
}) {
  return (
    <>
      <ForYou />
      {comingSoon.length > 0 && (
        <section>
          <h2 className="h2">Coming to theaters</h2>
          {comingSoon.map((m) => (
            <MovieResultRow key={m.id} result={m} />
          ))}
        </section>
      )}
      <h2 className="h2">Airing tonight</h2>
      {tonight.length === 0 && loading && <SkeletonRows count={2} />}
      {tonight.slice(0, 6).map((item, i) => (
        <Link key={item.show.id} to={`/show/${item.show.id}`} className="feedcard">
          <div className="feedcard-img">
            <Poster
              src={item.show.imageOriginal ?? item.show.image}
              alt={item.show.name}
              className="feedcard-poster"
            />
            <div className="feedcard-grad" />
            <div className="feedcard-add">
              <AddShowButton show={item.show} big />
            </div>
            <div className="feedcard-meta">
              <div className="feedcard-title">
                <IconTv size={18} strokeWidth={2} /> {item.show.name}
              </div>
              <div className="feedcard-sub">
                {[
                  item.show.network,
                  yearOf(item.show.premiered),
                  item.show.rating ? `★ ${item.show.rating.toFixed(1)}` : '',
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </div>
            </div>
          </div>
          {item.show.summary && (
            <div className={`feedcard-strip ${STRIP_COLORS[i % STRIP_COLORS.length]}`}>
              {item.show.summary}
            </div>
          )}
        </Link>
      ))}
      {tonight.length === 0 && !loading && (
        <p className="hint">Could not load the schedule. Pull down to retry later.</p>
      )}

      <h2 className="h2">Popular this week</h2>
      {popular.length === 0 && loading && <SkeletonRows count={2} />}
      <div className="grid3">
        {popular.map((s) => (
          <Link key={s.id} to={`/show/${s.id}`} className="gridcard">
            <div className="gridcard-imgwrap">
              <Poster src={s.image} alt={s.name} className="gridcard-poster" />
              <div className="gridcard-add">
                <AddShowButton show={s} />
              </div>
            </div>
            <div className="gridcard-name">{s.name}</div>
          </Link>
        ))}
      </div>
      <p className="attribution">
        TV data from{' '}
        <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
          TVmaze
        </a>{' '}
        · Movie data from TMDB, Cinemeta and iTunes
      </p>
    </>
  )
}
