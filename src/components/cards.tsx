import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Movie, MovieResult, ShowSummary } from '../lib/types'
import {
  daysUntil,
  epCode,
  formatDateShort,
  formatRuntime,
  formatTime,
  yearOf,
} from '../lib/format'
import type { UpcomingEntry, UpcomingMovieEntry, WatchItem } from '../store/selectors'
import { ensureShow, useShowCache } from '../store/cache'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { Badge, CheckCircle, Poster, ShowChip } from './ui'
import { IconCheck, IconPlus } from './Icons'

function isNewEp(airstamp: string | null | undefined, now: Date): boolean {
  if (!airstamp) return false
  const t = new Date(airstamp).getTime()
  return t <= now.getTime() && now.getTime() - t < 36 * 60 * 60 * 1000
}

/** Watch-list row: poster, chip, S03 | E01 +N, episode name, badges, check-in */
export function ShowNextCard({ item, now }: { item: WatchItem; now: Date }) {
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched)
  const showToast = useUi((s) => s.showToast)
  const { show, next } = item
  if (!next) return null

  const checkIn = () => {
    setEpisodeWatched(show.id, next.id, true)
    showToast(`${show.name} ${epCode(next.season, next.number)} watched`, () =>
      setEpisodeWatched(show.id, next.id, false),
    )
  }

  const badges = (
    <>
      {next.number === 1 && <Badge variant="black">{next.season === 1 ? 'PILOT' : 'PREMIERE'}</Badge>}
      {isNewEp(next.airstamp, now) && <Badge variant="yellow">NEW</Badge>}
    </>
  )

  return (
    <Link className="card showcard" to={`/show/${show.id}`}>
      <Poster src={show.image} alt={show.name} className="showcard-poster" />
      <div className="showcard-body">
        <ShowChip name={show.name} />
        <div className="epline">
          <span className="epcode">{epCode(next.season, next.number)}</span>
          {item.moreBehind > 0 && <span className="behind">+{item.moreBehind}</span>}
        </div>
        <div className="eptitle">{next.name}</div>
        <div className="badges">{badges}</div>
      </div>
      <div className="showcard-check">
        <CheckCircle on={false} onClick={checkIn} label={`Check in ${epCode(next.season, next.number)}`} />
      </div>
    </Link>
  )
}

/** Grid cell for the poster-grid view of the watch list */
export function ShowGridCard({ item }: { item: WatchItem }) {
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched)
  const showToast = useUi((s) => s.showToast)
  const { show, next } = item
  return (
    <Link to={`/show/${show.id}`} className="gridcard">
      <div className="gridcard-imgwrap">
        <Poster src={show.image} alt={show.name} className="gridcard-poster" />
        {next && (
          <div className="gridcard-check">
            <CheckCircle
              small
              on={false}
              onClick={() => {
                setEpisodeWatched(show.id, next.id, true)
                showToast(`${show.name} ${epCode(next.season, next.number)} watched`, () =>
                  setEpisodeWatched(show.id, next.id, false),
                )
              }}
            />
          </div>
        )}
      </div>
      <div className="gridcard-code">{next ? epCode(next.season, next.number) : 'UP TO DATE'}</div>
      <div className="gridcard-name">{show.name}</div>
    </Link>
  )
}

/** Upcoming episode row with date/countdown on the right */
export function UpcomingRow({ entry, now }: { entry: UpcomingEntry; now: Date }) {
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched)
  const showToast = useUi((s) => s.showToast)
  const { show, ep, when, aired } = entry
  const days = daysUntil(when, now)

  let right: ReactNode
  if (aired) {
    right = (
      <CheckCircle
        on={entry.watched}
        onClick={() => {
          const next = !entry.watched
          setEpisodeWatched(show.id, ep.id, next)
          if (next)
            showToast(`${show.name} ${epCode(ep.season, ep.number)} watched`, () =>
              setEpisodeWatched(show.id, ep.id, false),
            )
        }}
      />
    )
  } else if (days >= 7) {
    right = (
      <div className="upcoming-days">
        <span className="upcoming-days-num">{days}</span>
        <span className="upcoming-days-label">{days === 1 ? 'DAY' : 'DAYS'}</span>
      </div>
    )
  } else {
    right = (
      <div className="upcoming-when">
        <span className="upcoming-time">{formatTime(when)}</span>
        {show.network && <span className="upcoming-net">{show.network}</span>}
      </div>
    )
  }

  return (
    <Link className="card showcard" to={`/show/${show.id}`}>
      <Poster src={ep.image ?? show.image} alt={show.name} className="showcard-poster" />
      <div className="showcard-body">
        <ShowChip name={show.name} />
        <div className="epline">
          <span className="epcode">{epCode(ep.season, ep.number)}</span>
        </div>
        <div className="eptitle">{ep.name}</div>
        <div className="badges">
          {entry.premiere && <Badge variant="black">PREMIERE</Badge>}
          {isNewEp(ep.airstamp, now) && <Badge variant="yellow">NEW</Badge>}
          {aired && <Badge variant="green">AIRED</Badge>}
          {!aired && entry.isLatest && !entry.premiere && <Badge variant="black">LATEST</Badge>}
        </div>
      </div>
      <div className="showcard-right">{right}</div>
    </Link>
  )
}

/** Movie row for watch list */
export function MovieRow({
  movie,
  onCheck,
  checked,
}: {
  movie: Movie
  onCheck: () => void
  checked: boolean
}) {
  const sub = [formatRuntime(movie.runtimeMin), movie.genre].filter(Boolean).join(' • ')
  return (
    <Link className="card moviecard" to={`/movie/${movie.id}`}>
      <Poster src={movie.poster} alt={movie.title} className="moviecard-poster" />
      <div className="moviecard-body">
        <div className="movietitle">{movie.title}</div>
        {sub && <div className="moviesub">{sub}</div>}
      </div>
      <div className="showcard-check">
        <CheckCircle on={checked} onClick={onCheck} />
      </div>
    </Link>
  )
}

/** Upcoming movie row with release countdown */
export function UpcomingMovieRow({ entry, now }: { entry: UpcomingMovieEntry; now: Date }) {
  const { movie, when } = entry
  const days = daysUntil(when, now)
  const sub = [formatRuntime(movie.runtimeMin), movie.genre].filter(Boolean).join(' • ')
  return (
    <Link className="card moviecard" to={`/movie/${movie.id}`}>
      <Poster src={movie.poster} alt={movie.title} className="moviecard-poster" />
      <div className="moviecard-body">
        <div className="movietitle">{movie.title}</div>
        {sub && <div className="moviesub">{sub}</div>}
        <div className="moviesub dim">{formatDateShort(when)}</div>
      </div>
      <div className="showcard-right">
        {days < 100 ? (
          <div className="upcoming-days">
            <span className="upcoming-days-num">{days}</span>
            <span className="upcoming-days-label">{days === 1 ? 'DAY' : 'DAYS'}</span>
          </div>
        ) : null}
      </div>
    </Link>
  )
}

// ---------- Explore result rows ----------

export function ShowResultRow({ show }: { show: ShowSummary }) {
  const sub = [yearOf(show.premiered), show.network, show.genres.slice(0, 2).join(', ')]
    .filter(Boolean)
    .join(' • ')
  return (
    <Link className="card resultcard" to={`/show/${show.id}`} state={{ show }}>
      <Poster src={show.image} alt={show.name} className="resultcard-poster" />
      <div className="moviecard-body">
        <div className="movietitle">{show.name}</div>
        {sub && <div className="moviesub">{sub}</div>}
        {show.rating ? <div className="moviesub dim">★ {show.rating.toFixed(1)}</div> : null}
      </div>
      <AddShowButton show={show} />
    </Link>
  )
}

export function AddShowButton({ show, big }: { show: ShowSummary; big?: boolean }) {
  const tracked = useLibrary((s) => s.shows[show.id])
  const followShow = useLibrary((s) => s.followShow)
  const removeShow = useLibrary((s) => s.removeShow)
  const showToast = useUi((s) => s.showToast)
  const added = tracked?.status === 'following'
  return (
    <button
      className={`addbtn${added ? ' added' : ''}${big ? ' big' : ''}`}
      aria-label={added ? 'In your shows' : 'Add show'}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (added) {
          removeShow(show.id)
          showToast(`${show.name} removed`)
        } else {
          // prime cache so the row renders immediately while episodes load
          useShowCache.getState().prime(show)
          void ensureShow(show.id)
          followShow(show.id)
          showToast(`${show.name} added to your shows`)
        }
      }}
    >
      {added ? <IconCheck size={big ? 22 : 18} strokeWidth={2.6} /> : <IconPlus size={big ? 22 : 18} strokeWidth={2.4} />}
    </button>
  )
}

export function MovieResultRow({ result }: { result: MovieResult }) {
  const inLib = useLibrary((s) => s.movies[result.id])
  const addMovie = useLibrary((s) => s.addMovie)
  const removeMovie = useLibrary((s) => s.removeMovie)
  const showToast = useUi((s) => s.showToast)
  const sub = [yearOf(result.releaseDate), formatRuntime(result.runtimeMin), result.genre]
    .filter(Boolean)
    .join(' • ')
  return (
    <Link className="card resultcard" to={`/movie/${result.id}`} state={{ result }}>
      <Poster src={result.poster} alt={result.title} className="moviecard-poster" />
      <div className="moviecard-body">
        <div className="movietitle">{result.title}</div>
        {sub && <div className="moviesub">{sub}</div>}
      </div>
      <button
        className={`addbtn${inLib ? ' added' : ''}`}
        aria-label={inLib ? 'In your library' : 'Add to watch list'}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (inLib) {
            removeMovie(result.id)
            showToast(`${result.title} removed`)
          } else {
            addMovie(result, 'watchlist')
            showToast(`${result.title} added to watch list`)
          }
        }}
      >
        {inLib ? <IconCheck size={18} strokeWidth={2.6} /> : <IconPlus size={18} strokeWidth={2.4} />}
      </button>
    </Link>
  )
}
