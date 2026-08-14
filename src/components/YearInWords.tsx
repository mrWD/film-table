import { useEffect, useState } from 'react'
import type { YearReview } from '../store/selectors'
import { formatBigDuration } from '../lib/format'
import { aiAvailable, summarise } from '../lib/ai'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The year in review, said out loud.
 *
 * Every number here is already on the screen above it — this only turns the tiles into a
 * sentence. The model is handed the figures and asked to phrase them, never asked what
 * happened, so there is nothing for it to recall incorrectly. If it drops or mangles a
 * figure the paragraph simply does not appear: a wrong number stated confidently is
 * worse than no paragraph at all.
 */
/**
 * The same facts, arranged by hand. Used whenever the model's version cannot be
 * trusted — which is often enough that this is not a rare path.
 */
function plainSentence(review: YearReview): string {
  const parts = [
    `${review.episodes} episode${review.episodes === 1 ? '' : 's'} in ${review.year}, ` +
      `about ${formatBigDuration(review.minutes)} of watching`,
  ]
  if (review.topShows.length) {
    const top = review.topShows[0]
    parts.push(`mostly ${top.name}, with ${top.episodes}`)
  }
  if (review.busiestMonth !== null) {
    parts.push(`and ${MONTHS[review.busiestMonth]} was the busiest month`)
  }
  return `${parts.join(' — ')}.`
}

export function YearInWords({ review }: { review: YearReview }) {
  const [available, setAvailable] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void aiAvailable().then(setAvailable)
  }, [])
  // A different year is a different paragraph.
  useEffect(() => setText(null), [review.year])

  if (!available || review.episodes === 0) return null

  const write = async () => {
    setBusy(true)
    try {
      const facts = [
        `Year: ${review.year}`,
        `Episodes watched: ${review.episodes}`,
        `Time watching: ${formatBigDuration(review.minutes)}`,
        review.movies > 0 ? `Films watched: ${review.movies}` : null,
        review.busiestMonth !== null
          ? `Busiest month: ${MONTHS[review.busiestMonth]}, with ` +
            `${review.byMonth[review.busiestMonth]} episodes`
          : null,
        review.topShows.length
          ? `Most watched: ${review.topShows
              .slice(0, 3)
              .map((s) => `${s.name} (${s.episodes} episodes)`)
              .join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')

      const written = await summarise(
        facts,
        'Turn these figures into two friendly sentences addressed to the person. Use ' +
          'every number exactly as given. Do not add facts, opinions or anything not ' +
          'listed here.',
      )
      // The guard that makes this safe to ship. Told only that August was the busiest
      // month, the model wrote "with 11 episodes watched" — a figure nobody supplied.
      // So the rule is not "did the total survive" but "is every number here one we
      // gave it": anything else means it started filling in blanks, and a made-up
      // statistic stated warmly is worse than no paragraph.
      const supplied = new Set(facts.match(/\d+/g) ?? [])
      const invented = (written?.match(/\d+/g) ?? []).filter((n) => !supplied.has(n))
      const keepsTotal = written?.includes(String(review.episodes)) ?? false
      const trustworthy = Boolean(written) && keepsTotal && invented.length === 0
      // Rejecting silently leaves a button that does nothing when tapped, so the
      // sentence falls back to one this file writes itself: plainer than the model's,
      // and incapable of being wrong.
      setText(trustworthy ? written : plainSentence(review))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {text && <p className="recap">{text}</p>}
      {!text && (
        <button className="textbtn" disabled={busy} onClick={() => void write()}>
          {busy ? 'Writing…' : 'Say it in words'}
        </button>
      )}
    </>
  )
}
