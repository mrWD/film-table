import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { metricsEnabled, subscribeMetrics } from '../lib/metrics'
import { IconX } from './Icons'

/**
 * The one-time word that the app counts usage (lib/metrics). Shown until dismissed,
 * never in the way, and not at all while counting is off — Global Privacy Control on
 * the web, or the Profile switch — because then there is nothing to tell.
 */

const DISMISSED = 'filmtable-metrics-notice-dismissed'

export function MetricsNotice() {
  const [gone, setGone] = useState(() => localStorage.getItem(DISMISSED) === '1')
  const enabled = useSyncExternalStore(subscribeMetrics, metricsEnabled)

  const dismiss = () => {
    localStorage.setItem(DISMISSED, '1')
    setGone(true)
  }

  if (gone || !enabled) return null

  return (
    <div className="installhint" role="note">
      <div className="installhint-body">
        <p>
          FilmTable sends anonymous usage counts once a day — no IDs, nothing you type. You
          can turn this off in{' '}
          <Link to="/profile" onClick={dismiss}>
            Profile
          </Link>
          .
        </p>
      </div>
      <button className="installhint-close" onClick={dismiss} aria-label="Dismiss">
        <IconX size={16} strokeWidth={2.4} />
      </button>
    </div>
  )
}
