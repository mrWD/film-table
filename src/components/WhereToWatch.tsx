import { useEffect, useState } from 'react'
import { movieAvailability, showAvailability, tmdbEnabled, type Availability } from '../lib/tmdb'
import { useRegion } from '../store/region'
import { COUNTRIES } from '../store/region'

/**
 * Where a title can actually be watched, per country.
 *
 * Not the same thing as the network in the subtitle: that says who made or first aired
 * it, which is often not where you can watch it today. Data is TMDB's JustWatch feed,
 * and their terms require the attribution below — it is not decoration, keep it.
 */

const KIND_LABEL: Record<string, string> = {
  stream: 'Streaming',
  rent: 'Rent',
  buy: 'Buy',
}

export function WhereToWatch({ movieId, imdbId }: { movieId?: string; imdbId?: string | null }) {
  const country = useRegion((s) => s.country)
  const [data, setData] = useState<Availability | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tmdbEnabled()) return
    if (!movieId && !imdbId) return
    let live = true
    setLoading(true)
    const load = movieId
      ? movieAvailability(movieId, country)
      : showAvailability(imdbId as string, country)
    void load
      .then((r) => {
        if (live) setData(r)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [movieId, imdbId, country])

  // Nothing to say is better than an empty heading: plenty of titles are simply not
  // licensed anywhere in a given country, and TMDB has no data at all for some regions.
  if (loading || !data || data.providers.length === 0) return null

  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country
  const groups = (['stream', 'rent', 'buy'] as const)
    .map((kind) => ({ kind, names: data.providers.filter((p) => p.kind === kind).map((p) => p.name) }))
    .filter((g) => g.names.length > 0)

  return (
    <section>
      <h2 className="h2">Where to watch</h2>
      <p className="chips-hint">
        In {countryName} — change it in your profile.
      </p>
      <div className="providers">
        {groups.map(({ kind, names }) => (
          <div key={kind} className="provider-row">
            <span className="provider-kind">{KIND_LABEL[kind]}</span>
            <span className="provider-names">{names.join(', ')}</span>
          </div>
        ))}
      </div>
      <p className="attribution">
        Availability from{' '}
        <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
          JustWatch
        </a>{' '}
        via TMDB
        {data.link && (
          <>
            {' · '}
            <a href={data.link} target="_blank" rel="noreferrer">
              all options
            </a>
          </>
        )}
      </p>
    </section>
  )
}
