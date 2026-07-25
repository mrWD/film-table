/**
 * Every source names genres differently — TVmaze says "Science-Fiction", Cinemeta
 * "Sci-Fi", iTunes "Sci-Fi & Fantasy". Taste matching only works once they agree,
 * so everything is folded into Cinemeta's vocabulary (it is also what the catalog
 * endpoints accept as a filter).
 */
export const CANON_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
  'Western',
] as const

export type Genre = (typeof CANON_GENRES)[number]

const CANON_LOOKUP = new Map<string, Genre>(
  CANON_GENRES.map((g) => [g.toLowerCase().replace(/[^a-z]/g, ''), g]),
)

/** Source-specific spellings that do not normalise on their own. */
const ALIASES: Record<string, Genre | null> = {
  sciencefiction: 'Sci-Fi',
  scififantasy: 'Sci-Fi',
  scifi: 'Sci-Fi',
  sports: 'Sport',
  anime: 'Animation',
  animationanime: 'Animation',
  espionage: 'Thriller',
  supernatural: 'Fantasy',
  legal: 'Drama',
  medical: 'Drama',
  children: 'Family',
  kids: 'Family',
  kidsfamily: 'Family',
  diy: 'Documentary',
  food: 'Documentary',
  nature: 'Documentary',
  travel: 'Documentary',
  music: null, // no sensible counterpart; better dropped than mismapped
  musical: null,
  realitytv: null,
  talkshow: null,
  gameshow: null,
  short: null,
  news: null,
}

function normalizeOne(raw: string): Genre | null {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (key in ALIASES) return ALIASES[key]
  return CANON_LOOKUP.get(key) ?? null
}

/**
 * iTunes packs several genres into one string ("Action & Adventure"), so values are
 * split before matching; unmapped names are dropped rather than guessed at.
 */
export function canonicalGenres(raw: readonly (string | null | undefined)[]): Genre[] {
  const out = new Set<Genre>()
  for (const value of raw) {
    if (!value) continue
    for (const part of value.split(/[&,/]/)) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const direct = normalizeOne(trimmed)
      if (direct) out.add(direct)
    }
    // "Sci-Fi & Fantasy" also matches as a whole for aliases like scififantasy
    const whole = normalizeOne(value)
    if (whole) out.add(whole)
  }
  return [...out]
}
