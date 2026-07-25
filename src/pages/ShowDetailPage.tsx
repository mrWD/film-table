import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Episode, ShowSummary } from '../lib/types'
import { ensureShow, useShowCache } from '../store/cache'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { buildWatchItem, epDate, isAired } from '../store/selectors'
import {
  daysUntil,
  epCode,
  formatDateNoYear,
  formatRuntime,
  yearOf,
} from '../lib/format'
import { Badge, CheckCircle, Poster, ProgressBar, useNow } from '../components/ui'
import {
  IconBack,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconPlay,
  IconPlus,
  IconStop,
  IconTrash,
} from '../components/Icons'

export default function ShowDetailPage() {
  const { id } = useParams()
  const showId = Number(id)
  const navigate = useNavigate()
  const location = useLocation()
  const passedShow = (location.state as { show?: ShowSummary } | null)?.show
  const entry = useShowCache((s) => s.entries[showId])
  const prime = useShowCache((s) => s.prime)
  const tracked = useLibrary((s) => s.shows[showId])
  const followShow = useLibrary((s) => s.followShow)
  const removeShow = useLibrary((s) => s.removeShow)
  const setShowStatus = useLibrary((s) => s.setShowStatus)
  const setEpisodeWatched = useLibrary((s) => s.setEpisodeWatched)
  const setEpisodesWatched = useLibrary((s) => s.setEpisodesWatched)
  const showToast = useUi((s) => s.showToast)
  const askConfirm = useUi((s) => s.askConfirm)
  const now = useNow()
  const [expandAbout, setExpandAbout] = useState(false)

  useEffect(() => {
    if (passedShow) prime(passedShow)
    if (!Number.isNaN(showId)) void ensureShow(showId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId])

  const show = entry?.show ?? passedShow
  const episodes = useMemo(() => entry?.episodes ?? [], [entry])
  const loadingEpisodes = !entry || (entry.fetchedAt === 0 && episodes.length === 0)

  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>()
    for (const ep of episodes) {
      const list = map.get(ep.season) ?? []
      list.push(ep)
      map.set(ep.season, list)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [episodes])

  const item = tracked && entry ? buildWatchItem(tracked, entry, now) : null
  const next = item?.next

  const [openSeason, setOpenSeason] = useState<number | null>(null)
  useEffect(() => {
    if (next) setOpenSeason(next.season)
    else if (seasons.length > 0) setOpenSeason(seasons[seasons.length - 1][0])
  }, [next?.id, seasons.length])

  if (!show) {
    return (
      <div className="page detail">
        <button className="floatback" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
        <div className="skel hero-skel" />
      </div>
    )
  }

  const following = tracked?.status === 'following'
  const stopped = tracked?.status === 'stopped'
  const meta = [
    show.network,
    show.status,
    yearOf(show.premiered) + (show.ended ? `–${yearOf(show.ended)}` : show.status === 'Ended' ? '' : '–'),
    show.averageRuntime ? formatRuntime(show.averageRuntime) : '',
  ]
    .filter(Boolean)
    .join(' • ')

  const checkInNext = () => {
    if (!next) return
    setEpisodeWatched(showId, next.id, true)
    showToast(`${show.name} ${epCode(next.season, next.number)} watched`, () =>
      setEpisodeWatched(showId, next.id, false),
    )
  }

  return (
    <div className="page detail">
      <div className="hero">
        <Poster src={show.imageOriginal ?? show.image} alt={show.name} className="hero-img" />
        <div className="hero-grad" />
        <button className="floatback" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
      </div>

      <div className="detail-body">
        <h1 className="detail-title">{show.name}</h1>
        {meta && <div className="detail-meta">{meta}</div>}
        {show.genres.length > 0 && (
          <div className="genrechips">
            {show.genres.map((g) => (
              <span key={g} className="genrechip">
                {g}
              </span>
            ))}
          </div>
        )}

        {!tracked && (
          <button
            className="btn wide"
            onClick={() => {
              followShow(showId)
              showToast(`${show.name} added to your shows`)
            }}
          >
            <IconPlus size={18} strokeWidth={2.4} /> Add to my shows
          </button>
        )}

        {tracked && item && (
          <div className="trackpanel">
            <div className="trackpanel-row">
              <span className="trackpanel-count">
                {item.watchedCount}/{item.airedCount} episodes
              </span>
              {stopped && <Badge variant="black">STOPPED</Badge>}
              {item.bucket === 'upToDate' && item.watchedCount > 0 && (
                <Badge variant="green">CAUGHT UP</Badge>
              )}
            </div>
            <ProgressBar value={item.watchedCount} max={item.airedCount} />
            {next && !stopped && (
              <button className="btn accent wide" onClick={checkInNext}>
                <IconCheck size={18} strokeWidth={2.6} />
                Check in {epCode(next.season, next.number)}
              </button>
            )}
            {item.bucket === 'upToDate' && item.firstUpcoming && (
              <div className="nextair">
                Next episode {epCode(item.firstUpcoming.season, item.firstUpcoming.number)}
                {(() => {
                  const d = epDate(item.firstUpcoming)
                  if (!d) return null
                  const days = daysUntil(d, now)
                  return ` — ${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`
                })()}
              </div>
            )}
            <div className="trackactions">
              {following && (
                <button
                  className="textbtn"
                  onClick={() => {
                    setShowStatus(showId, 'stopped')
                    showToast(`Stopped watching ${show.name}`)
                  }}
                >
                  <IconStop size={16} /> Stop watching
                </button>
              )}
              {stopped && (
                <button
                  className="textbtn"
                  onClick={() => {
                    setShowStatus(showId, 'following')
                    showToast(`Resumed ${show.name}`)
                  }}
                >
                  <IconPlay size={16} /> Resume
                </button>
              )}
              <button
                className="textbtn danger"
                onClick={async () => {
                  const ok = await askConfirm({
                    title: `Remove ${show.name}?`,
                    message: 'The show and its watch history will be removed from your library.',
                    confirmLabel: 'Remove',
                    danger: true,
                  })
                  if (ok) {
                    removeShow(showId)
                    showToast(`${show.name} removed`)
                    navigate(-1)
                  }
                }}
              >
                <IconTrash size={16} /> Remove
              </button>
            </div>
          </div>
        )}

        {show.summary && (
          <p className={`detail-about${expandAbout ? ' open' : ''}`} onClick={() => setExpandAbout(!expandAbout)}>
            {show.summary}
          </p>
        )}

        <h2 className="h2">Episodes</h2>
        {loadingEpisodes && (
          <div className="skel-list">
            <div className="skel skel-line w70" />
            <div className="skel skel-line w55" />
            <div className="skel skel-line w70" />
          </div>
        )}
        {seasons.map(([seasonNum, eps]) => {
          const airedEps = eps.filter((e) => isAired(e, now))
          const watchedInSeason = tracked ? eps.filter((e) => tracked.watched[e.id]).length : 0
          const allAiredWatched =
            tracked && airedEps.length > 0 && airedEps.every((e) => tracked.watched[e.id])
          const open = openSeason === seasonNum
          return (
            <div key={seasonNum} className="season">
              <div className="season-head">
                <button
                  className="season-toggle"
                  onClick={() => setOpenSeason(open ? null : seasonNum)}
                  aria-expanded={open}
                  aria-label={`Season ${seasonNum}`}
                >
                  {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                  <span className="season-name">Season {seasonNum}</span>
                  <span className="season-count">
                    {tracked ? `${watchedInSeason}/${eps.length}` : `${eps.length} ep`}
                  </span>
                </button>
                {tracked && airedEps.length > 0 && (
                  <CheckCircle
                    small
                    on={Boolean(allAiredWatched)}
                    label={`Mark season ${seasonNum}`}
                    onClick={() => {
                      const ids = airedEps.map((e) => e.id)
                      const marking = !allAiredWatched
                      setEpisodesWatched(showId, ids, marking)
                      showToast(
                        marking
                          ? `Season ${seasonNum} marked watched`
                          : `Season ${seasonNum} unmarked`,
                        () => setEpisodesWatched(showId, ids, !marking),
                      )
                    }}
                  />
                )}
              </div>
              {open && (
                <div className="season-eps">
                  {eps.map((ep) => {
                    const aired = isAired(ep, now)
                    const when = epDate(ep)
                    const days = when ? daysUntil(when, now) : null
                    return (
                      <div key={ep.id} className={`eprow${aired ? '' : ' future'}`}>
                        <span className="eprow-num">{ep.number ?? '–'}</span>
                        <div className="eprow-main">
                          <div className="eprow-name">{ep.name}</div>
                          <div className="eprow-sub">
                            {when ? formatDateNoYear(when) : 'TBA'}
                            {ep.runtime ? ` • ${formatRuntime(ep.runtime)}` : ''}
                            {!aired && days !== null && days >= 0
                              ? ` • in ${days === 0 ? 'hours' : days === 1 ? '1 day' : `${days} days`}`
                              : ''}
                          </div>
                        </div>
                        {tracked ? (
                          <CheckCircle
                            small
                            on={Boolean(tracked.watched[ep.id])}
                            disabled={!aired}
                            onClick={() => {
                              const marking = !tracked.watched[ep.id]
                              setEpisodeWatched(showId, ep.id, marking)
                              if (marking)
                                showToast(`${epCode(ep.season, ep.number)} watched`, () =>
                                  setEpisodeWatched(showId, ep.id, false),
                                )
                            }}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {!loadingEpisodes && episodes.length === 0 && (
          <p className="hint">No episode data available for this show.</p>
        )}
        <p className="attribution">
          Data from <a href={`https://www.tvmaze.com/shows/${show.id}`} target="_blank" rel="noreferrer">TVmaze</a> (CC BY-SA)
        </p>
      </div>
    </div>
  )
}
