import { searchMoviesTmdb, similarToTmdb } from './tmdb'
import { aiAvailable, summarise } from './ai'
import type { MovieResult } from './types'

/**
 * "Something like John Wick, Nobody or Monkey Man."
 *
 * The temptation is to hand the whole sentence to the on-device model and let it name
 * films. It would — and some of them would not exist. A three-billion-parameter model
 * has opinions about cinema the way a stranger in a pub does, and no way to tell you
 * which ones it made up.
 *
 * So the work is split at its natural seam. The model reads the sentence and pulls out
 * the titles the person actually named, which is reading, not recall — the same job it
 * does well for pasted lists. Everything after that is TMDB: each title is looked up,
 * its recommendations and similar films are fetched, and the results are ranked by how
 * many of the named films point at them. Nothing reaches the screen that TMDB did not
 * return.
 *
 * The honest limit, worth saying out loud in the UI: this answers "like those films",
 * not "with that specific thing in them". TMDB's similarity is built from genres and
 * keywords, so "corridor fights" narrows nothing — the three films named do.
 */

export interface Suggestion {
  movie: MovieResult
  /** Which of the named films pointed here — computed, never phrased by the model. */
  because: string[]
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Enough references to triangulate; more is a paragraph, not a request. */
const MAX_REFERENCES = 4

/**
 * Titles are usually capitalised or quoted, which carries most requests on its own —
 * so the model is only asked when that finds nothing, and never for the answer itself.
 */
function guessTitles(text: string): string[] {
  const quoted = [...text.matchAll(/["«"']([^"»"']{2,60})["»"']/g)].map((m) => m[1].trim())
  if (quoted.length) return quoted.slice(0, MAX_REFERENCES)
  const capitalised = [...text.matchAll(/\b([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,3})/g)]
    .map((m) => m[1].trim())
    .filter((t) => t.length > 2)
  return capitalised.slice(0, MAX_REFERENCES)
}

async function extractTitles(text: string): Promise<string[]> {
  const guessed = guessTitles(text)
  if (guessed.length > 0) return guessed
  if (!(await aiAvailable())) return []
  const answer = await summarise(
    text,
    'This request mentions films or shows by name. Reply with only those titles, one ' +
      'per line, exactly as written. If it names none, reply with nothing.',
  )
  return (answer ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 1 && line.length < 60)
    .slice(0, MAX_REFERENCES)
}

export interface LikeTheseResult {
  references: MovieResult[]
  suggestions: Suggestion[]
}

export async function findLikeThese(text: string): Promise<LikeTheseResult> {
  const titles = await extractTitles(text)
  const references: MovieResult[] = []
  for (const title of titles) {
    const hits = await searchMoviesTmdb(title)
    const best = hits?.[0]
    // The match has to begin with what was asked for. Typed on a phone, "corridor
    // fights like John Wick" arrives with a capital C, the guesser reads "Corridor" as
    // a title, and TMDB helpfully returns a film called "Safe Corridor" — which then
    // appears in the list of things the person supposedly named. Requiring the title to
    // start with the query keeps "Nobody" and drops that.
    if (best && normalise(best.title).startsWith(normalise(title))) references.push(best)
  }
  if (references.length === 0) return { references: [], suggestions: [] }

  const referenceIds = new Set(references.map((r) => r.id))
  const votes = new Map<string, { movie: MovieResult; because: string[] }>()

  for (const reference of references) {
    const similar = await similarToTmdb(reference.id)
    for (const movie of similar ?? []) {
      if (referenceIds.has(movie.id)) continue
      const seen = votes.get(movie.id)
      if (seen) {
        if (!seen.because.includes(reference.title)) seen.because.push(reference.title)
      } else {
        votes.set(movie.id, { movie, because: [reference.title] })
      }
    }
  }

  // Agreement first: a film three of the named ones point at is a better answer than
  // one that only appeared beside a single reference.
  const suggestions = [...votes.values()]
    .sort((a, b) => b.because.length - a.because.length)
    .slice(0, 20)

  return { references, suggestions }
}
