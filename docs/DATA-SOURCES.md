# Data sources

Every quirk below was established by measurement, not by guesswork. The dates are
when it was checked. If an API's behaviour changes, check again and fix this file.

## Summary

| Source | What it provides | Key | Role |
|---|---|---|---|
| **TVmaze** | shows: seasons, episodes, air times, schedule | no | the only source of episodes |
| **TMDB** | movies: catalogue, posters, theatrical releases | yes, via the proxy | the lead source for movies when configured |
| **Cinemeta** | movies and shows: a catalogue with posters and IMDb ids | no | the key-free foundation, fallback |
| **iTunes** | movies | no | fills in what the others do not have |

## TVmaze

Licensed **CC BY-SA**; the terms explicitly permit any use, including commercial
use, with attribution. The attribution appears in the Profile, in Explore and on
the show page. The rate limit is roughly 20 requests per 10 seconds per IP.

**Quirk (verified 2026-07-25):** `/search/shows` returns **at most 10 results** for
any query. There is no page parameter and no limit parameter. Verified on `spider`,
`star`, `the` — exactly 10 every time. That is why the results are widened with the
Cinemeta catalogue.

**The bridge between sources:** `/lookup/shows?imdb=tt…` finds a show by IMDb id.
That makes it possible to take a show from Cinemeta and get a full TVmaze record
with episodes for it. It returns 404 when TVmaze does not have the show — such
candidates are simply discarded.

## TMDB

The key was issued for **personal use** (certified "non-commercial, generates no
revenue"). It lives only in the Vercel `TMDB_API_KEY` environment variable.

The proxy accepts both formats: the short v3 API Key (sent as a query parameter)
and the long v4 Read Access Token (sent as `Authorization: Bearer`). It is detected
by the `eyJ` prefix.

The mandatory attribution is in the Profile: "This product uses the TMDB API but is
not endorsed or certified by TMDB".

What TMDB covers (verified 2026-07-26 against a live key):

- `search/movie` — the full catalogue: `the matrix` → 56 results with "The Matrix"
  first, `spider-man` → 75. Exactly what the other sources could not provide.
- `movie/upcoming?region=US` — theatrical announcements with dates. **No key-free
  source knows them**; the "Coming to theaters" section exists because of this.
- `image.tmdb.org` — posters, whose use is explicitly permitted by TMDB's terms.

## Cinemeta

`https://v3-cinemeta.strem.io` — Stremio's public metadata catalogue. CORS is open
(`*`) and no key is required.

**This is not a documented public API with terms of use.** There is no legal risk
for us here (there is nothing to violate), but there is an operational one: access
could be closed off at any moment without warning. So Cinemeta must never be the
only path — if it fails, movie search must degrade to iTunes and show search to
TVmaze.

Useful endpoints:

- `/catalog/movie|series/top/search=QUERY.json` — search
- `/catalog/{type}/{top|imdbRating|year}/genre=GENRE.json` — a catalogue with a
  filter and `skip`-based pagination; the recommendations are built on this
- `/meta/{type}/tt….json` — the record with genres, rating, runtime and description

The result list is lightweight: title, poster and year only. Runtime and description
arrive in a separate detail request — which is why a film is enriched when it is
added to the library.

Cinemeta posters point at `m.media-amazon.com` and `images.metahub.space` — that is
hotlinking somebody else's images. Tolerable for a fan project, but it is precisely
the weakest point from a rights perspective; moving to TMDB makes the images
legitimate.

## iTunes Search API

**Quirk (verified 2026-07-25, critical):** the `media=movie` and `entity=movie`
filters return **zero results for any query** — verified on `dune`, `inception`,
`titanic`, `spider-man`. Because of that we have to search without a filter and
select `kind === 'feature-movie'` ourselves.

But without the filter the results are packed with podcasts, audiobooks and TV
episodes: for `spider-man`, 200 results contained **4 films**, and the wrong ones at
that (none of the main instalments), while `the matrix` was not found **at all**.
So iTunes is demoted to the role of "fill in what the others lack".

Also: iTunes only knows films available in the digital store — theatrical
announcements are not there in principle.

CORS is sometimes missing, so `api.ts` has a JSONP fallback.

## Wikidata — tested and rejected

Considered as a key-free movie source. Not suitable: `wbsearchentities` for
`spider-man` returns video games, comic book characters and a pinball machine
instead of films, and there are almost no posters — they are not free. Do not
reconsider.

## Merge order

**Movies** (`searchMovies` in `api.ts`): TMDB → if empty or the proxy is absent,
Cinemeta and iTunes in parallel, with Cinemeta leading and iTunes adding only what
is missing (matched by normalised title + year).

**Shows** (`searchShows`): TVmaze (up to 10) + Cinemeta; Cinemeta candidates absent
from the TVmaze results are resolved by IMDb id, at most 8 of them, with a
concurrency of 4.

All supplementary requests are wrapped in `withTimeout` — a slow secondary source
never holds up the main results.

## Genre vocabularies

The three sources differ: TVmaze says `Science-Fiction`, Cinemeta `Sci-Fi`, iTunes
`Sci-Fi & Fantasy`. Without reconciling them into a common vocabulary, taste
matching does not work. Everything is mapped to Cinemeta's vocabulary in
`src/lib/genres.ts` (which their catalogue also accepts as a filter). Unknown genres
are discarded rather than guessed.
