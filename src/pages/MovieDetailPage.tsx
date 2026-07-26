import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { MovieResult } from '../lib/types'
import { lookupMovie } from '../lib/api'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { formatDateShort, formatRuntime, yearOf } from '../lib/format'
import { Poster, useNow } from '../components/ui'
import { IconBack, IconCheck, IconPlus, IconTrash } from '../components/Icons'

export default function MovieDetailPage() {
  const { id } = useParams()
  const movieId = String(id)
  const navigate = useNavigate()
  const location = useLocation()
  const passed = (location.state as { result?: MovieResult } | null)?.result
  const inLib = useLibrary((s) => s.movies[movieId])
  const addMovie = useLibrary((s) => s.addMovie)
  const setMovieStatus = useLibrary((s) => s.setMovieStatus)
  const removeMovie = useLibrary((s) => s.removeMovie)
  const showToast = useUi((s) => s.showToast)
  const askConfirm = useUi((s) => s.askConfirm)
  const now = useNow()
  const [fetched, setFetched] = useState<MovieResult | null>(null)

  const known: MovieResult | undefined = inLib ?? passed ?? undefined
  // Search results omit runtime and description, so merge in the detail fetch.
  const movie: MovieResult | undefined = known
    ? { ...known, ...Object.fromEntries(Object.entries(fetched ?? {}).filter(([, v]) => v != null)), id: known.id, poster: known.poster ?? fetched?.poster ?? null }
    : (fetched ?? undefined)

  useEffect(() => {
    if (known?.runtimeMin && known.description) return
    void lookupMovie(movieId).then((m) => {
      if (!m) return
      setFetched(m)
      if (useLibrary.getState().movies[movieId]) {
        useLibrary.getState().updateMovieMeta(movieId, m)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId])

  if (!movie) {
    return (
      <div className="page detail">
        <button className="floatback dark" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
        <div className="detail-body" style={{ paddingTop: 72 }}>
          <div className="skel skel-line w70" />
          <div className="skel skel-line w40" />
        </div>
      </div>
    )
  }

  const released = !movie.releaseDate || new Date(movie.releaseDate).getTime() <= now.getTime()
  const meta = [
    yearOf(movie.releaseDate),
    formatRuntime(movie.runtimeMin),
    movie.genre,
    movie.contentRating,
  ]
    .filter(Boolean)
    .join(' • ')

  const watched = inLib?.status === 'watched'
  const onWatchlist = inLib?.status === 'watchlist'

  return (
    <div className="page detail">
      <button className="floatback dark" onClick={() => navigate(-1)} aria-label="Back">
        <IconBack size={22} />
      </button>
      <div className="detail-body moviedetail">
        <div className="moviedetail-top">
          <Poster src={movie.poster} alt={movie.title} className="moviedetail-poster" />
          <div className="moviedetail-info">
            <h1 className="detail-title">{movie.title}</h1>
            {meta && <div className="detail-meta">{meta}</div>}
            {!released && movie.releaseDate && (
              <div className="detail-meta accent">
                Releases {formatDateShort(new Date(movie.releaseDate))}
              </div>
            )}
          </div>
        </div>

        <div className="moviedetail-actions">
          <button
            className={`btn wide ${watched ? '' : 'accent'}`}
            onClick={() => {
              if (watched) {
                setMovieStatus(movieId, 'watchlist')
                showToast(`${movie.title} moved to watch list`)
              } else {
                if (inLib) setMovieStatus(movieId, 'watched')
                else addMovie(movie, 'watched')
                showToast(`${movie.title} watched`, () => {
                  if (inLib) setMovieStatus(movieId, 'watchlist')
                  else removeMovie(movieId)
                })
              }
            }}
          >
            <IconCheck size={18} strokeWidth={2.4} />
            {watched ? 'Watched ✓' : 'Mark watched'}
          </button>
          {!watched && (
            <button
              className={`btn wide ${onWatchlist ? 'outline' : ''}`}
              onClick={() => {
                if (onWatchlist) {
                  removeMovie(movieId)
                  showToast(`${movie.title} removed from watch list`)
                } else {
                  addMovie(movie, 'watchlist')
                  showToast(`${movie.title} added to watch list`)
                }
              }}
            >
              {onWatchlist ? (
                <>On watch list ✓</>
              ) : (
                <>
                  <IconPlus size={18} strokeWidth={2.4} /> Add to watch list
                </>
              )}
            </button>
          )}
        </div>

        {movie.description && <p className="detail-about open">{movie.description}</p>}

        {inLib && (
          <button
            className="textbtn danger"
            onClick={async () => {
              const ok = await askConfirm({
                title: `Remove ${movie.title}?`,
                message: 'The movie will be removed from your library.',
                confirmLabel: 'Remove',
                danger: true,
              })
              if (ok) {
                removeMovie(movieId)
                showToast(`${movie.title} removed`)
                navigate(-1)
              }
            }}
          >
            <IconTrash size={16} /> Remove from library
          </button>
        )}
        <p className="attribution">Movie data from TMDB, Cinemeta and the iTunes Search API</p>
      </div>
    </div>
  )
}
