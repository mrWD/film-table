import { searchShows } from './api'
import { aiAvailable, summarise } from './ai'
import type { ShowSummary } from './types'

/**
 * Bringing a list in from somewhere else.
 *
 * People arrive with a list in whatever shape the old app exported it — one per line,
 * comma separated, numbered, or a CSV row with ratings and dates around the title. The
 * catalogue can only be searched for a title, so something has to find the titles.
 *
 * Two things keep this honest:
 *
 * - **Plain text is handled without the model.** A list that is already one title per
 *   line does not need a language model, and pretending otherwise would make the
 *   feature unavailable on devices that have none.
 * - **Every title is verified against the catalogue.** The model's output is a guess at
 *   what the text says; a guess that matches nothing on TVmaze is dropped. It cannot
 *   invent a show into the library, because the library only ever receives real search
 *   results.
 */

/** Beyond this a paste is a file, not a list, and the model's context is not free. */
const MAX_CHARS = 4000
const MAX_TITLES = 25

/**
 * The shape most exports already have. Handles "1. Breaking Bad", "Breaking Bad (2008)",
 * bullet points and comma-separated lines — which between them cover a plain list
 * completely, with no model involved.
 */
export function splitPlainList(text: string): string[] {
  const lines = text
    .slice(0, MAX_CHARS)
    .split(/[\n\r]+/)
    .flatMap((line) => (line.includes(',') && !line.includes('"') ? line.split(',') : [line]))
  return lines
    .map((line) =>
      line
        .replace(/^\s*[-*•\d]+[.)]?\s*/, '')
        .replace(/\((?:19|20)\d\d\)\s*$/, '')
        .replace(/^["']|["']$/g, '')
        .trim(),
    )
    .filter((line) => line.length > 1 && line.length < 90)
    .slice(0, MAX_TITLES)
}

/**
 * Whether the paste looks messier than `splitPlainList` can handle — a CSV export, or
 * lines carrying ratings and dates around the title. Only then is the model worth
 * waking, and only then can it earn its second or so.
 */
function looksMessy(text: string): boolean {
  const lines = text.split(/[\n\r]+/).filter((l) => l.trim())
  if (lines.length === 0) return false
  const withExtras = lines.filter((l) => /[",;]|\d{4}-\d\d-\d\d|\b\d(\.\d)?\/\d\b/.test(l))
  return withExtras.length > lines.length / 3
}

export interface ImportCandidate {
  query: string
  match: ShowSummary | null
}

/**
 * Extract titles, then look each one up. The result deliberately includes the misses:
 * a person pasting twenty titles wants to know which four did not arrive, and silently
 * dropping them would look like the import losing things.
 */
export async function readList(text: string): Promise<ImportCandidate[]> {
  let titles = splitPlainList(text)

  if (looksMessy(text) && (await aiAvailable())) {
    const extracted = await summarise(
      text.slice(0, MAX_CHARS),
      'Each line of this list refers to one TV show. Reply with only the show titles, ' +
        'one per line, exactly as written, with no numbering, ratings, dates or extra words.',
    )
    const fromModel = extracted ? splitPlainList(extracted) : []
    // Trusted only when it produced something plausible; otherwise the plain split
    // stands, because a shorter honest list beats a longer invented one.
    if (fromModel.length > 0) titles = fromModel
  }

  const seen = new Set<string>()
  const unique = titles.filter((t) => {
    const key = t.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const out: ImportCandidate[] = []
  for (const query of unique) {
    const results = await searchShows(query)
    // Only an exact-ish first hit counts: "The Wire" must not import "The Wire Next
    // Door" because someone's list was abbreviated.
    const best = results[0]
    const close =
      best && best.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        .startsWith(query.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6))
    out.push({ query, match: close ? best : null })
  }
  return out
}
