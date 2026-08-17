import {
  findKeyword,
  keywordCorpusSize,
  keywordsForMovie,
  keywordsForTv,
  searchMoviesTmdb,
  searchTvTmdb,
  similarToTmdb,
  similarTvTmdb,
  type Keyword,
  type TvResult,
} from './tmdb'
import { searchShowsTvmaze } from './api'
import { aiAvailable, summarise } from './ai'
import type { MovieResult, ShowSummary } from './types'

/**
 * "Something like John Wick, Nobody or Monkey Man."
 *
 * The temptation is to hand the whole sentence to the on-device model and let it name
 * films. It would — and some of them would not exist. A three-billion-parameter model
 * has opinions about cinema the way a stranger in a pub does, and no way to tell you
 * which ones it made up.
 *
 * So the work is split at its natural seam. The sentence is read for the titles the
 * person actually named — reading, not recall — and everything after that is TMDB: the
 * named films' recommendations, their similar lists, and their keywords. Nothing reaches
 * the screen that TMDB did not return, and every reason shown is computed from its data
 * rather than phrased by a model.
 *
 * Two things were measured before this was written, and both changed the design.
 *
 * The keywords shared by the named films are a better ranking signal than the similar
 * lists alone. Asked for John Wick, Nobody and Monkey Man, the similar lists put Running
 * Scared and Dawn of the Dead near the top; adding keyword overlap lifts John Wick:
 * Chapter 2 (assassin, hitman, secret organization, revenge, dog) and Code of Silence
 * (hitman, gangster, revenge) above them, and says why in words a person can check.
 *
 * The description itself mostly cannot be used, and pretending otherwise is worse than
 * admitting it. "corridor fights" is not a thing TMDB tracks: "corridor" exists in its
 * vocabulary and carries three films, "hallway" three. Used as a filter, either would
 * return three arbitrary films with total confidence. So a description only counts when
 * it lands on a keyword with a real corpus behind it — "martial arts", "one man army",
 * "heist" — and when it does not, the UI says so instead of quietly ignoring it.
 */

/**
 * A named title, whichever half of the app it belongs to.
 *
 * Films and series are separate catalogues at TMDB, and this feature only asked the film
 * one. Someone typed "with vibe like in Ted Lasso" and was told no titles were found —
 * for a show the app itself tracks, on its own screen. So a reference now carries which
 * kind it is, and everything downstream follows it.
 */
export type Medium = 'movie' | 'tv'

export interface Reference {
  medium: Medium
  title: string
  /** The film's `tmdb:` id, or the series' numeric TMDB id. */
  key: string
}

export interface Suggestion {
  medium: Medium
  movie?: MovieResult
  /** Kept so a series can be looked up in TVmaze once it is known to be shown. */
  tv?: TvResult
  /** Series come back as the app's own TVmaze record, so a row can open one. */
  show?: ShowSummary
  /** Which of the named films pointed here — computed, never phrased by the model. */
  because: string[]
  /** The shared keywords worth showing — a row is a line, not a list. */
  shares: string[]
  /** Which named films those particular keywords came from. */
  sharedWith: string[]
  /** Every shared keyword, weighted by how rare it is — what the ranking runs on. */
  shareCount: number
  /** Keywords from the description itself, when the description landed on real ones. */
  matches: string[]
}

export interface LikeTheseResult {
  references: Reference[]
  /** Description words that turned out to be real, well-populated TMDB keywords. */
  described: string[]
  /** The person described something, and none of it exists in TMDB's vocabulary. */
  describedNothing: boolean
  /**
   * Where the on-device model actually did something, so the screen can say so and
   * nowhere else. Both are usually false: titles come off capitalisation or the word
   * "like", and everything after that is the catalogue.
   */
  readByModel: { titles: boolean; description: boolean }
  suggestions: Suggestion[]
}

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Enough references to triangulate; more is a paragraph, not a request. */
const MAX_REFERENCES = 4

/**
 * Fetching a keyword list per candidate is one request each, so the tail is cut. They are
 * week-cached at the edge and issued together, which keeps a button press to about a
 * second after the first person asks.
 */
const MAX_SCORED = 24

/**
 * Words that open a request rather than name a film. Without these, "Хочу фильм…" and
 * "Looking for something…" are read as titles, and TMDB — which will find a film for
 * almost any string — obliges.
 */
const NOT_A_TITLE = new Set([
  'хочу', 'ищу', 'посоветуй', 'найди', 'что', 'фильм', 'фильме', 'фильмы', 'сериал',
  'сериалы', 'посмотреть', 'как', 'или', 'типа', 'вроде', 'want', 'looking', 'find',
  'something', 'anything', 'show', 'shows', 'movie', 'movies', 'film', 'films', 'like',
  'similar', 'or', 'and', 'the', 'a', 'an', 'i', 'me', 'give', 'recommend',
])

/**
 * Tags about how a film was made or released rather than what is in it. Left in, they
 * invent kinship: Dawn of the Dead ranked among the John Wick answers on the strength of
 * sharing "duringcreditsstinger".
 */
const NOT_ABOUT_THE_FILM = new Set([
  'duringcreditsstinger', 'aftercreditsstinger', 'woman director', 'imax', '3d',
  'live action remake', 'remake', 'sequel', 'reboot',
])

/**
 * What a shared keyword is worth, given how many films wear it.
 *
 * Measured on "something with corridor fights like Nobody or Monkey Man", which put The
 * Collector — a horror film about a burglar — second, on the strength of sharing "thief"
 * and "home invasion" with Nobody. Those tags carry 419 and 352 films. "bratva (russian
 * mafia)", which John Wick shares, carries 56; "underground fights" carries one. Two
 * films both tagged "thief" is barely a fact about either, so the common tags are worth
 * a fraction of a rare one, and the horror film drops out of the answer.
 *
 * One request per keyword, so only the tags that can affect the ranking are priced: the
 * ones the named films carry, plus anything the description matched. Nothing else can
 * score, so nothing else is worth asking about. They are week-cached and issued together.
 *
 * The cap is a backstop, and it has bitten once: priced against every tag in play instead
 * of the named films' own, the list ran to hundreds, the first two dozen were priced, and
 * everything after them silently fell back to weight 1 — which is the unweighted ranking
 * this was written to replace. It looked exactly like the change not being deployed.
 */
const MAX_WEIGHED = 48

async function rarity(ids: number[]): Promise<Map<number, number>> {
  const sized = await Promise.all(
    ids.slice(0, MAX_WEIGHED).map(async (id) => [id, await keywordCorpusSize(id)] as const),
  )
  const out = new Map<number, number>()
  // Capped, so "underground fights" (one film) does not outweigh everything else at once.
  for (const [id, films] of sized) out.set(id, Math.min(3, 400 / Math.max(films ?? 400, 1)))
  return out
}

/** A screenful. Each series among them costs a TVmaze lookup to become openable. */
const SHOWN = 12

/**
 * Series turned into the records this app actually tracks.
 *
 * Shows are kept by TVmaze id here, and TMDB knows nothing about TVmaze, so a suggested
 * series has to be found again by name before its row can lead anywhere. A show that
 * cannot be found is dropped rather than shown as a dead end — the point of the row is
 * that you can open it.
 */
async function openable(suggestions: Suggestion[]): Promise<Suggestion[]> {
  const resolved = await Promise.all(
    suggestions.map(async (s) => {
      if (s.medium === 'movie') return s
      const hits = await searchShowsTvmaze(s.tv!.name)
      const match =
        hits.find((h) => normalise(h.name) === normalise(s.tv!.name)) ??
        hits.find((h) => normalise(h.name).startsWith(normalise(s.tv!.name)))
      return match ? { ...s, show: match } : null
    }),
  )
  return resolved.filter((s): s is Suggestion => s !== null)
}

const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s)

/** Longest first, so "ами" is tried before "и". */
const RU_ENDINGS = ['ами', 'ями', 'ом', 'ем', 'ой', 'ей', 'ах', 'ях', 'ов', 'ев',
  'а', 'у', 'е', 'и', 'ы', 'ю', 'я', 'о']

/**
 * Russian declines titles inside a sentence: someone asking for a film "как в Джон Вике"
 * has written a form TMDB does not know — the search returns nothing at all for it, while
 * "Джон Вик" finds the film. Trimming one case ending off the last word recovers it.
 */
function variants(title: string): string[] {
  if (!hasCyrillic(title)) return [title]
  const words = title.split(/\s+/)
  const last = words[words.length - 1]
  for (const ending of RU_ENDINGS) {
    if (last.length > ending.length + 2 && last.toLowerCase().endsWith(ending)) {
      return [title, [...words.slice(0, -1), last.slice(0, -ending.length)].join(' ')]
    }
  }
  return [title]
}

/**
 * Titles are usually capitalised or quoted, which carries most requests on its own — so
 * the model is only asked when that finds nothing, and never for the answer itself.
 */
const CAPITALISED = /[A-ZА-ЯЁ][\p{L}\p{N}'’-]*(?:\s+[A-ZА-ЯЁ][\p{L}\p{N}'’-]*){0,3}/gu

function guessTitles(text: string): string[] {
  const quoted = [...text.matchAll(/["«“']([^"»”']{2,60})["»”']/g)].map((m) => m[1].trim())
  if (quoted.length) return quoted.slice(0, MAX_REFERENCES)

  const capitalised = [...text.matchAll(CAPITALISED)]
    .filter((m) => opensARequest(text, m) === false)
    .map((m) => m[0].trim())
    .filter((t) => t.length > 2 && !NOT_A_TITLE.has(t.toLowerCase()))
  if (capitalised.length) return capitalised.slice(0, MAX_REFERENCES)

  return afterTheWordLike(text)
}

/**
 * What comes after "like", when nothing was capitalised.
 *
 * Typed on a phone, "With vibe like ted lasso" has exactly one capital and it belongs to
 * the sentence, not the show. Reading titles off capitalisation finds nothing at all
 * there, and this feature answered "no titles found" for a show the app tracks.
 *
 * People say what they want the same way every time — "like X", "как X", "типа X" — so
 * the tail of the sentence is worth trying as a title. It is only tried when
 * capitalisation found nothing, and TMDB is the one that decides whether it names
 * anything: a phrase that is not a title comes back empty, which is where this started.
 */
/*
 * Word boundaries by hand, because `\b` is ASCII: in "что-то как во все тяжкие" there is
 * no boundary before "как" as far as `\b` is concerned, so every Russian marker was
 * silently never matching.
 */
const EDGE = { start: String.raw`(?<![\p{L}\p{N}])`, end: String.raw`(?![\p{L}\p{N}])` }
const LIKE = new RegExp(
  `${EDGE.start}(?:like|similar to|как в|как|типа|вроде)${EDGE.end}`,
  'giu',
)
const SEPARATOR = new RegExp(
  `\\s*(?:,|${EDGE.start}(?:or|and|или|и)${EDGE.end})\\s*`,
  'iu',
)

function afterTheWordLike(text: string): string[] {
  const marks = [...text.matchAll(LIKE)]
  const last = marks[marks.length - 1]
  const from = last ? (last.index ?? 0) + last[0].length : 0
  const tail = text
    .slice(from)
    .split(SEPARATOR)
    .map((part) => part.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((part) => part.length > 2 && !NOT_A_TITLE.has(part.toLowerCase()))
  return tail.slice(0, MAX_REFERENCES)
}

/**
 * Is this capitalised run just the start of a sentence?
 *
 * A phone capitalises the first word of everything typed into it. "martial arts like The
 * Raid" arrives as "Martial arts like The Raid", the run "Martial" reads as a title, and
 * TMDB answers with Martial Law — after which the whole page is Lethal Weapon sequels.
 * The same trap caught "Corridor" earlier and got a weaker fix.
 *
 * What separates the two cases is the word after. A request that opens with a title
 * continues with a separator — "John Wick or Nobody", "The Raid and Ip Man" — or ends.
 * A request that opens with a sentence continues with an ordinary word: "arts", "fights".
 * Only the run at the very beginning is judged this way; anywhere else, a capital letter
 * means something.
 */
function opensARequest(text: string, match: RegExpMatchArray): boolean {
  if ((match.index ?? 0) > text.length - text.trimStart().length) return false
  const after = text.slice((match.index ?? 0) + match[0].length).trim()
  if (after.length === 0) return false
  const next = after.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0]
  // A comma or "or" after the run means it was an item in a list, not an opening phrase.
  if (!next || !/^\p{Ll}/u.test(next)) return false
  return !NOT_A_TITLE.has(next.toLowerCase())
}

async function extractTitles(text: string): Promise<{ titles: string[]; byModel: boolean }> {
  const guessed = guessTitles(text)
  if (guessed.length > 0) return { titles: guessed, byModel: false }
  if (!(await aiAvailable())) return { titles: [], byModel: false }
  const answer = await summarise(
    text,
    'This request mentions films or shows by name. Reply with only those titles, one ' +
      'per line, exactly as written. If it names none, reply with nothing.',
  )
  const titles = (answer ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 1 && line.length < 60)
    .slice(0, MAX_REFERENCES)
  return { titles, byModel: titles.length > 0 }
}

/**
 * A guessed title turned into the film it names, or nothing.
 *
 * The two scripts need different proof, because they go wrong differently. A Latin guess
 * is checked by prefix: a phone capitalises the first word, so "Corridor fights like John
 * Wick" offers "Corridor" as a title and TMDB returns a film called "Safe Corridor" —
 * requiring the result to begin with what was asked for drops that and keeps "Nobody".
 * A Cyrillic guess cannot be checked that way at all, since TMDB matches it through
 * alternative titles and answers in another spelling entirely ("Джон Вик" finds "Джон
 * Уик"). There the guard is a release date: the junk that outranks the real "Никто" is an
 * undated fragment, and the 2021 film is the first dated hit.
 */
async function resolve(title: string): Promise<Reference | null> {
  const cyrillic = hasCyrillic(title)
  const good = (found: string, query: string) =>
    cyrillic || normalise(found).startsWith(normalise(query))

  for (const query of variants(title)) {
    // Russian titles rank correctly only when the search is told the language.
    for (const language of cyrillic ? ['ru-RU', undefined] : [undefined]) {
      const films = (await searchMoviesTmdb(query, language)) ?? []
      const dated = films.filter((m) => m.releaseDate)
      // The exact title wins over the popular one: asked for "The Raid", TMDB ranks
      // "The Raid 2" first, and answering with the sequel to a film someone named is a
      // small lie about what they said.
      const exact = dated.find((m) => normalise(m.title) === normalise(query))
      if (exact) return { medium: 'movie', title: exact.title, key: exact.id }
      if (dated[0] && good(dated[0].title, query)) {
        return { medium: 'movie', title: dated[0].title, key: dated[0].id }
      }

      // Films first only because most requests name one. A series is asked about
      // whenever the film catalogue has nothing that matches.
      const shows = (await searchTvTmdb(query, language)) ?? []
      const aired = shows.filter((t) => t.year)
      const exactTv = aired.find((t) => normalise(t.name) === normalise(query))
      if (exactTv) return { medium: 'tv', title: exactTv.name, key: String(exactTv.tmdbId) }
      if (aired[0] && good(aired[0].name, query)) {
        return { medium: 'tv', title: aired[0].name, key: String(aired[0].tmdbId) }
      }
    }
  }
  return null
}

/** Whatever the reference points at, asked the same two questions. */
async function keywordsOf(ref: Reference): Promise<Keyword[] | null> {
  return ref.medium === 'movie'
    ? keywordsForMovie(ref.key)
    : keywordsForTv(Number(ref.key))
}

/** What the request says apart from the titles: "corridor fights", "с драками". */
function description(text: string, titles: string[]): { rest: string; words: string[] } {
  let rest = text
  for (const t of titles) rest = rest.replace(t, ' ')
  return {
    rest,
    words: rest
      .split(/[^\p{L}\p{N}]+/u)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2 && !NOT_A_TITLE.has(w)),
  }
}

/**
 * The part of the request that is not a title, turned into TMDB keywords — only the ones
 * that exist and carry enough films to mean anything.
 */
async function describedKeywords(
  rest: string,
  words: string[],
): Promise<{ found: Keyword[]; byModel: boolean }> {
  if (words.length === 0) return { found: [], byModel: false }

  // Pairs first: "martial arts" is a keyword, "martial" on its own is not. Plurals are
  // tried singular because the vocabulary is written in the singular ("gunfight").
  const terms: string[] = []
  for (let i = 0; i < words.length - 1; i++) terms.push(`${words[i]} ${words[i + 1]}`)
  for (const w of words) terms.push(w)
  for (const w of words) if (w.endsWith('s')) terms.push(w.slice(0, -1))

  const found: Keyword[] = []
  for (const term of [...new Set(terms)].slice(0, 8)) {
    // "martial arts" is looked up before "arts" and "art", and all three are real
    // vocabulary entries — keeping the fragments makes the app announce it is looking
    // for "martial arts, arts and art", which is one thing said three times.
    if (found.some((k) => k.name.includes(term))) continue
    const kw = await findKeyword(term)
    if (kw && !found.some((k) => k.id === kw.id)) found.push({ id: kw.id, name: kw.name })
    if (found.length >= 3) break
  }
  if (found.length > 0) return { found, byModel: false }

  /*
   * Nothing matched, which for a request written in Russian is expected: the vocabulary
   * is English. Translation is the one thing the model does reliably here — "боевые
   * искусства" comes back as "martial arts" every time, "ограбление банка" as "heist".
   * It is also wrong often: "подводная лодка" became "Underwater adventure" when the tag
   * is "submarine". That costs nothing, because whatever it says is looked up like any
   * other word and a phrase TMDB does not have simply finds nothing.
   *
   * Asking it for more than translation was tried and abandoned. Given the tags these
   * films actually carry and asked which fit "corridor fights", it picked nothing in 18
   * runs out of 18, and on an easier phrasing answered "thief, bratva (russian mafia)".
   * An earlier version of that test looked promising only because the list I handed it
   * was one I had written myself, with the obvious answers already in it.
   */
  if (!(await aiAvailable())) return { found: [], byModel: false }
  const english = await summarise(
    rest,
    'Translate what the person wants to watch into at most two short English film tags, ' +
      'one per line — like "heist", "time travel", "martial arts". Nothing else.',
  )
  for (const line of (english ?? '').split(/\n+/).slice(0, 2)) {
    // It ends sentences: "Zombie apocalypse." is the right tag with a full stop attached.
    const term = line.replace(/^[-*\d.)\s]+/, '').replace(/[.!?,;:]+$/, '').trim()
    if (term.length < 3 || term.length > 40) continue
    const kw = await findKeyword(term)
    if (kw && !found.some((k) => k.id === kw.id)) found.push({ id: kw.id, name: kw.name })
  }
  return { found, byModel: found.length > 0 }
}

export async function findLikeThese(text: string): Promise<LikeTheseResult> {
  const { titles, byModel: titlesByModel } = await extractTitles(text)
  const references: Reference[] = []
  for (const title of titles) {
    const found = await resolve(title)
    if (found && !references.some((r) => r.key === found.key && r.medium === found.medium)) {
      references.push(found)
    }
  }
  const empty = {
    references: [],
    described: [],
    describedNothing: false,
    suggestions: [],
    readByModel: { titles: false, description: false },
  }
  if (references.length === 0) return empty

  const { rest, words } = description(text, titles)
  const { found: described, byModel: describedByModel } = await describedKeywords(rest, words)

  const referenceIds = new Set(references.map((r) => `${r.medium}:${r.key}`))
  const votes = new Map<
    string,
    { medium: Medium; movie?: MovieResult; tv?: TvResult; because: string[] }
  >()
  // Keyword -> the named films carrying it. A set would be enough to rank by, but not to
  // explain: "dog" is John Wick's tag, and a film sharing it was being credited to
  // whichever reference happened to list it first — Dawn of the Dead read "dog — like
  // Никто", which is simply untrue.
  const named = new Map<string, { id: number; refs: string[] }>()

  for (const reference of references) {
    for (const kw of (await keywordsOf(reference)) ?? []) {
      if (NOT_ABOUT_THE_FILM.has(kw.name)) continue
      const carrier = named.get(kw.name)
      if (carrier) carrier.refs.push(reference.title)
      else named.set(kw.name, { id: kw.id, refs: [reference.title] })
    }

    // A named film suggests films and a named series suggests series: TMDB keeps the two
    // catalogues apart, and there is no "films like this show" list to ask for. Name one
    // of each and both kinds come back, which is what the app tracks anyway.
    const vote = (key: string, entry: () => Omit<(typeof votes) extends Map<string, infer V> ? V : never, 'because'>) => {
      if (referenceIds.has(key)) return
      const seen = votes.get(key)
      if (seen) {
        if (!seen.because.includes(reference.title)) seen.because.push(reference.title)
      } else {
        votes.set(key, { ...entry(), because: [reference.title] })
      }
    }

    if (reference.medium === 'movie') {
      for (const movie of (await similarToTmdb(reference.key)) ?? []) {
        vote(`movie:${movie.id}`, () => ({ medium: 'movie', movie }))
      }
    } else {
      for (const tv of (await similarTvTmdb(Number(reference.key))) ?? []) {
        vote(`tv:${tv.tmdbId}`, () => ({ medium: 'tv', tv }))
      }
    }
  }

  // Agreement narrows the field; keywords then decide the order within it.
  const shortlist = [...votes.values()]
    .sort((a, b) => b.because.length - a.because.length)
    .slice(0, MAX_SCORED)

  const withKeywords = await Promise.all(
    shortlist.map(async (entry) => ({
      entry,
      kws:
        (entry.medium === 'movie'
          ? await keywordsForMovie(entry.movie!.id)
          : await keywordsForTv(entry.tv!.tmdbId)) ?? [],
    })),
  )

  // Every tag in play, and how many of the shortlisted films wear it. This is both the
  // list the model chooses from and the source of ids for pricing.
  const inPlay = new Map<string, { id: number; count: number }>()
  for (const [name, { id }] of named) inPlay.set(name, { id, count: Infinity })
  for (const { kws } of withKeywords) {
    for (const kw of kws) {
      if (NOT_ABOUT_THE_FILM.has(kw.name)) continue
      const seen = inPlay.get(kw.name)
      if (seen) seen.count += 1
      else inPlay.set(kw.name, { id: kw.id, count: 1 })
    }
  }

  for (const k of described) if (!inPlay.has(k.name)) inPlay.set(k.name, { id: k.id, count: 0 })

  const describedNames = described.map((k) => k.name)
  const weights = await rarity([
    ...new Set([...[...named.values()].map((v) => v.id), ...described.map((k) => k.id)]),
  ])
  const weigh = (name: string) => weights.get(inPlay.get(name)?.id ?? -1) ?? 1

  const suggestions: Suggestion[] = withKeywords.map(({ entry, kws }) => {
    const names = kws.map((k) => k.name)
    const mine = names.filter((k) => named.has(k))
    // Rarest first, so the line shows what actually distinguishes this film rather than
    // whichever tag TMDB happened to list first.
    const shown = [...mine].sort((a, b) => weigh(b) - weigh(a)).slice(0, 3)
    return {
      ...entry,
      shares: shown,
      // Derived from the three that are shown, so the row never credits a film for a
      // keyword the reader cannot see.
      sharedWith: [...new Set(shown.flatMap((k) => named.get(k)?.refs ?? []))],
      shareCount: mine.reduce((sum, k) => sum + weigh(k), 0),
      matches: names.filter((k) => describedNames.includes(k)),
    }
  })

  // What the person described is the most specific thing they said, so it counts three
  // times over — but still by rarity, because the model pads its picks and a generic one
  // like "assassin" should not carry the same force as "brawl".
  const score = (s: Suggestion) =>
    s.matches.reduce((sum, k) => sum + 3 * weigh(k), 0) + s.shareCount + s.because.length
  suggestions.sort((a, b) => score(b) - score(a))

  return {
    references,
    suggestions: await openable(suggestions.slice(0, SHOWN)),
    described: describedNames,
    readByModel: { titles: titlesByModel, description: describedByModel },
    // Only when something was actually described. A request that is just a list of
    // films has nothing left over, and telling that person the catalogue lacks a tag
    // for what they described would be answering a question they did not ask.
    describedNothing: words.length > 0 && described.length === 0,
  }
}
