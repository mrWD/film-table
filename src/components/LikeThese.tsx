import { useState } from 'react'
import { findLikeThese, type Suggestion } from '../lib/like-these'
import { MovieResultRow } from './cards'

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
  const [references, setReferences] = useState<string[] | null>(null)
  const [results, setResults] = useState<Suggestion[] | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      const found = await findLikeThese(text)
      setReferences(found.references.map((r) => r.title))
      setResults(found.suggestions)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="h2">Something like…</h2>
      <p className="chips-hint">
        Name a few films you have in mind. This answers “like those”, using the
        catalogue's own similarity — it cannot pick out one particular scene.
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
      <button className="textbtn" disabled={!text.trim() || busy} onClick={() => void run()}>
        {busy ? 'Looking…' : 'Find something like these'}
      </button>

      {references !== null && references.length === 0 && (
        <p className="hint">
          No titles found in that. Name at least one film — the suggestions are built
          from films you point at.
        </p>
      )}

      {references !== null && references.length > 0 && (
        <p className="chips-hint">Matched: {references.join(', ')}</p>
      )}

      {results?.map((s) => (
        <MovieResultRow
          key={s.movie.id}
          result={s.movie}
          typeTag
          reason={`Because you named ${
            s.because.length > 1
              ? `${s.because.slice(0, -1).join(', ')} and ${s.because[s.because.length - 1]}`
              : s.because[0]
          }`}
        />
      ))}
    </section>
  )
}
