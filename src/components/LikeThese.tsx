import { useState } from 'react'
import { findLikeThese, type Suggestion } from '../lib/like-these'
import { MovieResultRow } from './cards'

/** Names, joined the way a person would say them. */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Why this film is here, in TMDB's own words rather than a model's.
 *
 * Shared keywords come first when there are any, because "hitman, revenge, dog" is
 * something a person can agree or disagree with, while "you named John Wick" only says
 * the machinery ran.
 */
function reason(s: Suggestion): string {
  const parts: string[] = []
  if (s.matches.length) parts.push(list(s.matches))
  if (s.shares.length) parts.push(`${list(s.shares)} — like ${list(s.sharedWith)}`)
  if (parts.length === 0) parts.push(`you named ${list(s.because)}`)
  return parts.join(' · ')
}

/**
 * "Something like John Wick, Nobody or Monkey Man."
 *
 * The references are shown back before the results, because the first thing that can go
 * wrong is quietly looking up the wrong film — "Nobody" is a common word, and a person
 * who sees which Nobody was matched can tell instantly whether the answers below are
 * about anything they meant.
 */
export function LikeThese() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<Awaited<ReturnType<typeof findLikeThese>> | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      setFound(await findLikeThese(text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="h2">Something like…</h2>
      <p className="chips-hint">
        Name a few films you have in mind, and say what you are after. The suggestions
        come from the catalogue's own data — films it links to yours, and the tags they
        share.
      </p>
      <input
        className="regionselect"
        value={text}
        placeholder="like John Wick, Nobody, Monkey Man"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void run()
        }}
      />
      {/* A real button. As borrowed text styling it read as a caption under the field,
          and the person it was built for did not know it could be pressed. */}
      <button
        className="btn accent asksubmit"
        disabled={!text.trim() || busy}
        onClick={() => void run()}
      >
        {busy ? 'Looking…' : 'Find something like these'}
      </button>

      {found && found.references.length === 0 && (
        <p className="hint">
          No titles found in that. Name at least one film — the suggestions are built
          from films you point at.
        </p>
      )}

      {found && found.references.length > 0 && (
        <>
          <p className="chips-hint">Matched: {found.references.map((r) => r.title).join(', ')}</p>
          {found.described.length > 0 && (
            <p className="chips-hint">Looking for: {list(found.described)}</p>
          )}
          {/* Said plainly rather than swallowed: someone who asked for corridor fights
              should know the catalogue has no such tag, not wonder why it was ignored. */}
          {found.describedNothing && (
            <p className="chips-hint">
              The catalogue has no tag for the rest of what you described, so these are
              films like the ones you named.
            </p>
          )}
        </>
      )}

      {found?.suggestions.map((s) => (
        <MovieResultRow key={s.movie.id} result={s.movie} typeTag reason={reason(s)} />
      ))}
    </section>
  )
}
