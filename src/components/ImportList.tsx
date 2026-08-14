import { useState } from 'react'
import { readList, type ImportCandidate } from '../lib/import-list'
import { useLibrary } from '../store/library'
import { useShowCache } from '../store/cache'
import { useUi } from '../store/ui'

/**
 * Paste a list from wherever you tracked before.
 *
 * Nothing is added until the person says so: an import that silently fills a library
 * with near-misses is worse than one that shows its work. Misses are listed too, so a
 * list of twenty that brings in sixteen says which four it could not find.
 */
export function ImportList() {
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [found, setFound] = useState<ImportCandidate[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const follow = useLibrary((s) => s.followShow)
  const prime = useShowCache((s) => s.prime)
  const showToast = useUi((s) => s.showToast)

  const read = async () => {
    setReading(true)
    try {
      const candidates = await readList(text)
      setFound(candidates)
      setChosen(new Set(candidates.filter((c) => c.match).map((c) => c.match!.id)))
    } finally {
      setReading(false)
    }
  }

  const add = () => {
    let added = 0
    for (const candidate of found ?? []) {
      if (!candidate.match || !chosen.has(candidate.match.id)) continue
      prime(candidate.match)
      follow(candidate.match.id)
      added += 1
    }
    setFound(null)
    setText('')
    showToast(added ? `Added ${added} show${added === 1 ? '' : 's'}` : 'Nothing selected')
  }

  const hits = (found ?? []).filter((c) => c.match)
  const misses = (found ?? []).filter((c) => !c.match)

  return (
    <>
      <h2 className="h2">Import a list</h2>
      <p className="chips-hint">
        Paste a list from another tracker — one per line, comma separated, or a messy
        export. Titles are matched against the catalogue before anything is added.
      </p>
      <textarea
        className="feedback-box"
        rows={4}
        placeholder={'Breaking Bad\nThe Wire\nSeverance'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="textbtn" disabled={!text.trim() || reading} onClick={() => void read()}>
        {reading ? 'Looking them up…' : 'Find these shows'}
      </button>

      {found && (
        <div className="datacard">
          {hits.map((c) => (
            <label key={c.match!.id} className="datarow">
              <input
                type="checkbox"
                checked={chosen.has(c.match!.id)}
                onChange={(e) => {
                  const next = new Set(chosen)
                  if (e.target.checked) next.add(c.match!.id)
                  else next.delete(c.match!.id)
                  setChosen(next)
                }}
              />
              <div>
                <div className="datarow-title">{c.match!.name}</div>
                <div className="datarow-sub">
                  {[c.match!.premiered?.slice(0, 4), c.match!.network].filter(Boolean).join(' · ')}
                </div>
              </div>
            </label>
          ))}
          {misses.length > 0 && (
            <p className="chips-hint">
              Not found: {misses.map((c) => c.query).join(', ')}
            </p>
          )}
          <button className="textbtn" onClick={add} disabled={chosen.size === 0}>
            Add {chosen.size} to my shows
          </button>
        </div>
      )}
    </>
  )
}
