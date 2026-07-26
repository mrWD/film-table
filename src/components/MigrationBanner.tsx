import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconX } from './Icons'

/**
 * Shown only on the old GitHub Pages origin once the app moves to Vercel.
 * localStorage does not follow a domain change, so the banner points people at
 * Export/Import instead of pretending the move is transparent.
 */
const OLD_HOST = 'mrwd.github.io'
export const NEW_HOME = 'https://film-table.vercel.app'

export function MigrationBanner() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('ft-move-dismissed') === '1',
  )
  if (dismissed || window.location.hostname !== OLD_HOST) return null
  return (
    <div className="movebanner" role="status">
      <p>
        FilmTable moved to{' '}
        <a href={NEW_HOME} rel="noreferrer">
          {NEW_HOME.replace('https://', '')}
        </a>
        . This page keeps working, but new features land there. Your library lives on this
        device — use <Link to="/profile">Profile → Export</Link>, then Import at the new
        address.
      </p>
      <button
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem('ft-move-dismissed', '1')
          setDismissed(true)
        }}
      >
        <IconX size={16} strokeWidth={2.4} />
      </button>
    </div>
  )
}
