export type ThemePreference = 'dark' | 'light' | 'ocean' | 'forest' | 'rose' | 'sunset' | 'ocean-light' | 'sage-light' | 'rose-light' | 'sunset-light' | 'system';
export type TextSizePreference = 'small' | 'default' | 'large';
export type WatchStatus = 'completed' | 'watching' | 'planned' | 'on-hold' | 'dropped';

export interface User {
  id: string;
  username: string;
  usernameSetupRequired: boolean;
  email: string;
  emailVerified: boolean;
  avatar: string;
  bio: string;
  profileVisibility: 'public' | 'private';
  privacySettings: { showStats: boolean; showLists: boolean; showRatings: boolean; showActivity: boolean; showFavorites: boolean; allowMessageRequests: boolean };
  themePreference: ThemePreference;
  textSizePreference: TextSizePreference;
  favoriteTitleIds?: string[];
  createdAt: string;
}

export interface MediaTitle {
  _id: string;
  title: string;
  originalTitle?: string;
  alternativeTitles?: string[];
  mediaType: 'movie' | 'series';
  formats?: string[];
  categories: string[];
  countries?: string[];
  languages?: string[];
  genres?: string[];
  synopsis?: string;
  poster?: string;
  backdrop?: string;
  releaseDate?: string;
  runtime?: number;
  seasons?: number;
  totalEpisodes?: number;
  tmdbRating?: number;
  tmdbVoteCount?: number;
  anilistAverageScore?: number;
  anilistMeanScore?: number;
  anilistPopularity?: number;
  communityRating?: number;
  communityRatingCount?: number;
  metadataSource: 'manual' | 'tmdb' | 'anilist' | 'combined';
}

export interface LibraryEntry {
  _id: string;
  userId: string;
  titleId: MediaTitle;
  status: WatchStatus;
  episodesWatched: number;
  seasonsWatched: number;
  personalRating?: number;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
  rewatchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserList {
  _id: string;
  name: string;
  slug: string;
  description: string;
  visibility: 'public' | 'private';
  listType: 'watchlist' | 'custom' | 'favorites';
  orderedItems: Array<{ titleId: MediaTitle; position: number; addedAt: string }>;
  updatedAt: string;
}

export interface Statistics {
  total: number;
  completed: number;
  watching: number;
  planned: number;
  onHold: number;
  dropped: number;
  movies: number;
  series: number;
  completedMovies: number;
  completedSeries: number;
  episodes: number;
  byCategory: Array<{ category: string; count: number }>;
  byMonth: Array<{ month: string; count: number }>;
}
