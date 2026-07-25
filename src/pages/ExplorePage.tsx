import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useExplore, type ExploreMode } from '../store/explore'
import type { ScheduleItem } from '../lib/api'
import type { ShowSummary } from '../lib/types'
import { MovieResultRow, ShowResultRow, AddShowButton } from '../components/cards'
import { Poster, SkeletonRows } from '../components/ui'
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
    searching,
    searchError,
    tonight,
    popular,
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
          {(['shows', 'movies'] as ExploreMode[]).map((m) => (
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
        <Discover tonight={tonight} popular={popular} loading={discoverLoading} />
      )}
    </div>
  )
}

function Discover({
  tonight,
  popular,
  loading,
}: {
  tonight: ScheduleItem[]
  popular: ShowSummary[]
  loading: boolean
}) {
  return (
    <>
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
        · Movie data from iTunes Search API
      </p>
    </>
  )
}
