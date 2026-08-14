import { useEffect, useState } from 'react'
import type { ShowCacheEntry, TrackedShow } from '../lib/types'
import { aiAvailable } from '../lib/ai'
import { canRecap, recapMarker, recapSource, useRecap } from '../store/recap'

/**
 * "Where was I" for a show you have not opened in months.
 *
 * Absent entirely unless the device can answer: a button that explains why it does not
 * work is worse than no button, and this is a nicety rather than part of the tracker.
 */
export function Recap({ tracked, entry }: { tracked: TrackedShow; entry: ShowCacheEntry }) {
  const [available, setAvailable] = useState(false)
  const saved = useRecap((s) => s.entries[tracked.id])
  const generating = useRecap((s) => s.generating === tracked.id)
  const generate = useRecap((s) => s.generate)

  useEffect(() => {
    void aiAvailable().then(setAvailable)
  }, [])

  if (!available || !canRecap(tracked, entry)) return null

  const fresh = saved?.marker === recapMarker(recapSource(tracked, entry))

  return (
    <section>
      <h2 className="h2">Where you left off</h2>
      {saved && (
        <p className="recap">{saved.text}</p>
      )}
      {!fresh && (
        <button
          className="textbtn"
          disabled={generating}
          onClick={() => void generate(tracked, entry)}
        >
          {generating ? 'Writing…' : saved ? 'Update the recap' : 'Recap what I have watched'}
        </button>
      )}
      <p className="chips-hint">
        Written on your phone from the episodes you have already watched — nothing ahead,
        and nothing leaves the device.
      </p>
    </section>
  )
}
