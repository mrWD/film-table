export interface ShowSummary {
  id: number
  name: string
  image?: string | null
  imageOriginal?: string | null
  genres: string[]
  status: string
  premiered?: string | null
  ended?: string | null
  network?: string | null
  rating?: number | null
  averageRuntime?: number | null
  weight?: number
  summary?: string
}

export interface Episode {
  id: number
  season: number
  number: number | null
  name: string
  airstamp?: string | null
  airdate?: string | null
  runtime?: number | null
  image?: string | null
  summary?: string
}

export interface ShowCacheEntry {
  fetchedAt: number
  show: ShowSummary
  episodes: Episode[]
}

export interface TrackedShow {
  id: number
  addedAt: number
  status: 'following' | 'stopped'
  /** episode id -> watched-at timestamp */
  watched: Record<number, number>
  lastWatchedAt?: number
}

export interface Movie {
  id: string
  title: string
  poster?: string | null
  genre?: string
  runtimeMin?: number | null
  releaseDate?: string | null
  description?: string
  contentRating?: string | null
  addedAt: number
  status: 'watchlist' | 'watched'
  watchedAt?: number
}

/** Movie search result before it is added to the library */
export type MovieResult = Omit<Movie, 'addedAt' | 'status' | 'watchedAt'>

export interface BackupFile {
  app: 'filmtable'
  version: 1
  exportedAt: string
  shows: Record<number, TrackedShow>
  movies: Record<string, Movie>
}
