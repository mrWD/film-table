import { useState } from 'react'
import { findLikeThese, type Suggestion } from '../lib/like-these'
import { MovieResultRow, ShowResultRow } from './cards'
import { IconSparkle } from './Icons'

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
        Name a few films or shows you have in mind, and say what you are after. The
        suggestions come from the catalogue's own data — what it links to yours, and the
        tags they share.
      </p>
      <input
        className="regionselect"
        value={text}
        placeholder="like John Wick, or Ted Lasso"
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
        {busy ? (
          <>
            <IconSparkle size={16} strokeWidth={2} className="spark" /> Looking…
          </>
        ) : (
          'Find something like these'
        )}
      </button>

      {found && found.references.length === 0 && (
        <p className="hint">
          No titles found in that. Name at least one film or show — the suggestions are
          built from what you point at.
        </p>
      )}

      {found && found.references.length > 0 && (
        <>
          <p className="chips-hint">Matched: {found.references.map((r) => r.title).join(', ')}</p>
          {/* Marked where it is true and nowhere else. Almost everything on this screen
              comes from the catalogue; the model reads the sentence when nothing in it
              was capitalised, and puts a description into English. Badging the whole
              feature as AI would be a claim about the app that is not one. */}
          {(found.readByModel.titles || found.readByModel.description) && (
            <p className="chips-hint ondevice">
              <IconSparkle size={14} strokeWidth={1.9} />
              {found.readByModel.titles && found.readByModel.description
                ? 'Your phone read the title and the description — on the device, nothing sent anywhere'
                : found.readByModel.titles
                  ? 'Your phone read the title out of that sentence — on the device'
                  : 'Your phone put what you described into English — on the device'}
            </p>
          )}
          {found.described.length > 0 && (
            <p className="chips-hint">Looking for: {list(found.described)}</p>
          )}
          {/* Said plainly rather than swallowed: someone who asked for corridor fights
              should know the catalogue has no such tag, not wonder why it was ignored. */}
          {found.describedNothing && (
            <p className="chips-hint">
              The catalogue has no tag for the rest of what you described, so these are
              titles like the ones you named.
            </p>
          )}
        </>
      )}

      {/* Both kinds, because both are what this app tracks and either can be named. */}
      {found?.suggestions.map((s) =>
        s.show ? (
          <ShowResultRow key={`s${s.show.id}`} show={s.show} typeTag reason={reason(s)} />
        ) : s.movie ? (
          <MovieResultRow key={`m${s.movie.id}`} result={s.movie} typeTag reason={reason(s)} />
        ) : null,
      )}
    </section>
  )
}
