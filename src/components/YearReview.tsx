import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../store/library'
import { useShowCache } from '../store/cache'
import { buildYearReview, yearsWithActivity } from '../store/selectors'
import { formatBigDuration } from '../lib/format'

/**
 * A year of watching, added up on this device.
 *
 * Every check-in already stores when it happened, so nothing new had to be recorded and
 * nothing leaves the browser to produce this. Only years with something in them are
 * offered — an empty recap is worse than no recap.
 */

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function YearReview() {
  const shows = useLibrary((s) => s.shows)
  const movies = useLibrary((s) => s.movies)
  const entries = useShowCache((s) => s.entries)

  const years = yearsWithActivity(shows, movies)
  const [year, setYear] = useState<number | null>(null)
  const active = year ?? years[0]

  if (years.length === 0) return null

  const review = buildYearReview(shows, entries, movies, active)
  if (review.episodes === 0 && review.movies === 0) return null

  const peak = Math.max(...review.byMonth)

  return (
    <section>
      <div className="h2-row">
        <h2 className="h2">{active} in review</h2>
        {years.length > 1 && (
          <select
            className="yearselect"
            value={active}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-num">{review.episodes}</span>
          <span className="stat-label">EPISODES</span>
        </div>
        <div className="stat">
          <span className="stat-num">{formatBigDuration(review.minutes)}</span>
          <span className="stat-label">WATCH TIME</span>
        </div>
        <div className="stat">
          <span className="stat-num">{review.movies}</span>
          <span className="stat-label">MOVIES</span>
        </div>
        <div className="stat">
          <span className="stat-num">{formatBigDuration(review.movieMinutes)}</span>
          <span className="stat-label">MOVIE TIME</span>
        </div>
      </div>

      {peak > 0 && (
        <div className="months" aria-label="Episodes and movies watched per month">
          {review.byMonth.map((count, i) => (
            <span key={i} className="month" title={`${count} in month ${i + 1}`}>
              <span
                className={`month-bar${i === review.busiestMonth ? ' peak' : ''}`}
                style={{ height: `${Math.max(3, (count / peak) * 100)}%` }}
              />
              <span className="month-label">{MONTHS[i]}</span>
            </span>
          ))}
        </div>
      )}

      {review.topShows.length > 0 && (
        <div className="datacard">
          {review.topShows.map((s) => (
            <Link key={s.id} className="datarow" to={`/show/${s.id}`}>
              <div>
                <div className="datarow-title">{s.name}</div>
                <div className="datarow-sub">
                  {s.episodes} episode{s.episodes === 1 ? '' : 's'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
