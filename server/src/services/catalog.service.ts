import { env } from '../config/env.js';
import { MediaTitle } from '../models/index.js';
import { HttpError } from '../utils/http.js';

type TmdbItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
  origin_country?: string[];
  vote_average?: number;
  vote_count?: number;
};

type TmdbResponse = { results?: TmdbItem[]; total_pages?: number };
type TmdbDetails = {
  title?: string; name?: string; original_title?: string; original_name?: string; overview?: string;
  runtime?: number | null; episode_run_time?: number[]; number_of_episodes?: number; number_of_seasons?: number;
  release_date?: string; first_air_date?: string; genres?: Array<{ name: string }>;
  production_countries?: Array<{ iso_3166_1: string }>; origin_country?: string[];
  vote_average?: number; vote_count?: number;
};
type AniListMedia = {
  id: number;
  title: { english?: string | null; romaji?: string | null; native?: string | null };
  description?: string | null;
  coverImage?: { large?: string | null };
  bannerImage?: string | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null };
  episodes?: number | null;
  seasonYear?: number | null;
  format?: string | null;
  countryOfOrigin?: string | null;
  genres?: string[];
  studios?: { nodes?: Array<{ name: string }> };
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number | null;
};

const searchCache = new Map<string, { expiresAt: number; value: unknown }>();
const searchCacheTtl = 3 * 60_000;

const tmdbGenreNames: Record<number, string> = {
  12: 'Adventure', 14: 'Fantasy', 16: 'Animation', 18: 'Drama', 27: 'Horror', 28: 'Action',
  35: 'Comedy', 36: 'History', 37: 'Western', 53: 'Thriller', 80: 'Crime', 99: 'Documentary',
  878: 'Science Fiction', 9648: 'Mystery', 10749: 'Romance', 10751: 'Family', 10752: 'War',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

function imageUrl(path: string | null | undefined, size: 'w342' | 'w500' | 'original' = 'w500'): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
}

function tmdbCategories(item: TmdbItem, mediaType: 'movie' | 'series'): string[] {
  const categories = [mediaType === 'movie' ? 'movies' : 'tv-shows'];
  const language = item.original_language?.toLowerCase();
  const origin = (item.origin_country ?? []).map((country) => country.toUpperCase());
  if (item.genre_ids?.includes(16) && language === 'ja') categories.push('anime');
  if (origin.includes('KR')) categories.push('k-dramas');
  if (origin.includes('CN')) categories.push('c-dramas');
  if (origin.includes('JP')) categories.push('j-dramas');
  if (origin.includes('TH')) categories.push('thai-dramas');
  if (item.genre_ids?.includes(99)) categories.push('documentaries');
  if (item.genre_ids?.includes(10764)) categories.push('reality-shows');
  return categories;
}

async function upsertTmdb(item: TmdbItem) {
  if (!item.id || !['movie', 'tv'].includes(item.media_type ?? '')) return null;
  const mediaType = item.media_type === 'movie' ? 'movie' : 'series';
  const title = item.title || item.name || item.original_title || item.original_name;
  if (!title) return null;
  const genres = (item.genre_ids ?? []).map((id) => tmdbGenreNames[id]).filter((value): value is string => Boolean(value));
  const sourceFields = {
    title,
    originalTitle: item.original_title || item.original_name || title,
    mediaType,
    formats: [mediaType],
    categories: tmdbCategories(item, mediaType),
    countries: item.origin_country ?? [],
    languages: item.original_language ? [item.original_language] : [],
    genres,
    synopsis: item.overview ?? '',
    poster: imageUrl(item.poster_path),
    backdrop: imageUrl(item.backdrop_path, 'original'),
    releaseDate: item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date!) : undefined,
    metadataSource: 'tmdb',
    tmdbRating: item.vote_average,
    tmdbVoteCount: item.vote_count,
    ratingsCheckedAt: new Date(),
    'providerIds.tmdb': String(item.id),
  };
  return MediaTitle.findOneAndUpdate({ 'providerIds.tmdb': String(item.id) }, { $set: sourceFields }, { new: true, upsert: true, setDefaultsOnInsert: true });
}

async function searchTmdb(query: string, page: number) {
  if (!env.TMDB_API_KEY && !env.TMDB_READ_ACCESS_TOKEN) return { items: [], totalPages: 0 };
  const url = new URL('https://api.themoviedb.org/3/search/multi');
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('page', String(page));
  if (!env.TMDB_READ_ACCESS_TOKEN) url.searchParams.set('api_key', env.TMDB_API_KEY!);
  const response = await fetch(url, { headers: env.TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}` } : {} });
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'The catalog is busy. Try again shortly.' : 'The catalog could not be reached.');
  const payload = await response.json() as TmdbResponse;
  const items = await Promise.all((payload.results ?? []).map(upsertTmdb));
  return { items: items.filter((item): item is NonNullable<typeof item> => Boolean(item)), totalPages: payload.total_pages ?? 0 };
}

async function upsertAniList(item: AniListMedia) {
  const title = item.title.english || item.title.romaji || item.title.native;
  if (!title) return null;
  const date = item.startDate?.year ? new Date(Date.UTC(item.startDate.year, (item.startDate.month ?? 1) - 1, item.startDate.day ?? 1)) : undefined;
  return MediaTitle.findOneAndUpdate({ 'providerIds.anilist': String(item.id) }, { $set: {
    title,
    originalTitle: item.title.native || item.title.romaji || title,
    alternativeTitles: [item.title.english, item.title.romaji, item.title.native].filter((value): value is string => Boolean(value && value !== title)),
    mediaType: ['MOVIE', 'SPECIAL'].includes(item.format ?? '') ? 'movie' : 'series',
    formats: ['anime', String(item.format ?? '').toLowerCase()].filter(Boolean),
    categories: ['anime', ['MOVIE', 'SPECIAL'].includes(item.format ?? '') ? 'movies' : 'tv-shows'],
    countries: item.countryOfOrigin ? [item.countryOfOrigin] : [],
    genres: item.genres ?? [],
    synopsis: (item.description ?? '').replace(/<[^>]*>/g, ''),
    poster: item.coverImage?.large ?? '',
    backdrop: item.bannerImage ?? '',
    releaseDate: date,
    totalEpisodes: item.episodes ?? undefined,
    metadataSource: 'anilist',
    anilistAverageScore: item.averageScore ?? undefined,
    anilistMeanScore: item.meanScore ?? undefined,
    anilistPopularity: item.popularity ?? undefined,
    ratingsCheckedAt: new Date(),
    'providerIds.anilist': String(item.id),
  } }, { new: true, upsert: true, setDefaultsOnInsert: true });
}

async function searchAniList(query: string, page: number) {
  const body = {
    query: `query ($search: String, $page: Int) { Page(page: $page, perPage: 20) { pageInfo { lastPage } media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { english romaji native } description(asHtml: false) coverImage { large } bannerImage startDate { year month day } episodes seasonYear format countryOfOrigin genres studios(isMain: true) { nodes { name } } averageScore meanScore popularity } } }`,
    variables: { search: query, page },
  };
  const response = await fetch(env.ANILIST_GRAPHQL_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'AniList is busy. Try again shortly.' : 'AniList could not be reached.');
  const payload = await response.json() as { data?: { Page?: { pageInfo?: { lastPage?: number }; media?: AniListMedia[] } } };
  const media = payload.data?.Page?.media ?? [];
  const items = await Promise.all(media.map(upsertAniList));
  return { items: items.filter((item): item is NonNullable<typeof item> => Boolean(item)), totalPages: payload.data?.Page?.pageInfo?.lastPage ?? 0 };
}

async function trendingAniList(page: number) {
  const body = {
    query: `query ($page: Int) { Page(page: $page, perPage: 20) { pageInfo { lastPage } media(type: ANIME, sort: TRENDING_DESC) { id title { english romaji native } description(asHtml: false) coverImage { large } bannerImage startDate { year month day } episodes seasonYear format countryOfOrigin genres studios(isMain: true) { nodes { name } } averageScore meanScore popularity } } }`,
    variables: { page },
  };
  const response = await fetch(env.ANILIST_GRAPHQL_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'AniList is busy. Try again shortly.' : 'AniList could not be reached.');
  const payload = await response.json() as { data?: { Page?: { pageInfo?: { lastPage?: number }; media?: AniListMedia[] } } };
  const items = await Promise.all((payload.data?.Page?.media ?? []).map(upsertAniList));
  return { items: items.filter((item): item is NonNullable<typeof item> => Boolean(item)), totalPages: payload.data?.Page?.pageInfo?.lastPage ?? 0 };
}

export async function discoverCatalog(category: string | undefined, page: number) {
  const cacheKey = `trending|${category ?? ''}|${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const useAniList = category === 'anime';
  const configured = useAniList ? Boolean(env.ANILIST_GRAPHQL_URL) : Boolean(env.TMDB_API_KEY || env.TMDB_READ_ACCESS_TOKEN);
  let providerItems: Awaited<ReturnType<typeof trendingAniList>>['items'] = [];
  let totalPages = 0;
  if (configured && useAniList) {
    const result = await trendingAniList(page);
    providerItems = result.items;
    totalPages = result.totalPages;
  } else if (configured) {
    const type = category === 'movies' ? 'movie' : category === 'tv-shows' ? 'tv' : 'all';
    const url = new URL(`https://api.themoviedb.org/3/trending/${type}/week`);
    url.searchParams.set('page', String(page));
    if (!env.TMDB_READ_ACCESS_TOKEN) url.searchParams.set('api_key', env.TMDB_API_KEY!);
    const response = await fetch(url, { headers: env.TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}` } : {} });
    if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'The catalog is busy. Try again shortly.' : 'The catalog could not be reached.');
    const payload = await response.json() as TmdbResponse;
    const items = await Promise.all((payload.results ?? []).map((item) => upsertTmdb({ ...item, media_type: item.media_type ?? (type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : undefined) })));
    providerItems = items.filter((item): item is NonNullable<typeof item> => Boolean(item && (!category || item.categories.includes(category))));
    totalPages = payload.total_pages ?? 0;
  }
  const filter = category ? { categories: category } : {};
  const localItems = await MediaTitle.find(filter).select('title originalTitle alternativeTitles mediaType formats categories countries languages genres synopsis poster backdrop releaseDate runtime seasons totalEpisodes providerIds.tmdb providerIds.anilist tmdbRating tmdbVoteCount anilistAverageScore anilistMeanScore anilistPopularity communityRating communityRatingCount metadataSource').sort({ communityRatingCount: -1, updatedAt: -1 }).skip((page - 1) * 20).limit(20).lean();
  const providerIds = new Set(providerItems.map((item) => String(item._id)));
  const value = { items: [...providerItems, ...localItems.filter((item) => !providerIds.has(String(item._id)))].slice(0, 20), page, totalPages: Math.max(totalPages, Math.ceil(await MediaTitle.countDocuments(filter) / 20)), providers: { tmdb: Boolean(env.TMDB_API_KEY || env.TMDB_READ_ACCESS_TOKEN), anilist: Boolean(env.ANILIST_GRAPHQL_URL) }, searchConfigured: configured };
  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(cacheKey, { expiresAt: Date.now() + searchCacheTtl, value });
  return value;
}

export async function hydrateProviderTitle(titleId: string) {
  const title = await MediaTitle.findById(titleId);
  if (!title) return null;
  const tmdbId = title.providerIds?.tmdb;
  const anilistId = title.providerIds?.anilist;
  const hasTmdbCredentials = Boolean(env.TMDB_API_KEY || env.TMDB_READ_ACCESS_TOKEN);
  const ratingsAreFresh = title.ratingsCheckedAt && Date.now() - title.ratingsCheckedAt.getTime() < 7 * 86_400_000;
  if (ratingsAreFresh && title.metadataCheckedAt && Date.now() - title.metadataCheckedAt.getTime() < 7 * 86_400_000) return title;

  if (anilistId && !ratingsAreFresh) {
    const body = {
      query: `query ($id: Int) { Media(id: $id, type: ANIME) { id title { english romaji native } description(asHtml: false) coverImage { large } bannerImage startDate { year month day } episodes seasonYear format countryOfOrigin genres studios(isMain: true) { nodes { name } } averageScore meanScore popularity } }`,
      variables: { id: Number(anilistId) },
    };
    try {
      const response = await fetch(env.ANILIST_GRAPHQL_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) {
        const payload = await response.json() as { data?: { Media?: AniListMedia } };
        const media = payload.data?.Media;
        if (media) {
          const mapped = await upsertAniList(media);
          if (mapped) return mapped;
        }
      }
    } catch { /* Use the cached title when AniList cannot be reached. */ }
    title.ratingsCheckedAt = new Date();
    await title.save();
  }

  if (!tmdbId || !hasTmdbCredentials || ratingsAreFresh && title.metadataCheckedAt) return title;
  const type = title.mediaType === 'movie' ? 'movie' : 'tv';
  const url = new URL(`https://api.themoviedb.org/3/${type}/${encodeURIComponent(tmdbId)}`);
  if (!env.TMDB_READ_ACCESS_TOKEN) url.searchParams.set('api_key', env.TMDB_API_KEY!);
  try {
    const response = await fetch(url, { headers: env.TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}` } : {} });
    if (!response.ok) {
      title.metadataCheckedAt = new Date();
      title.ratingsCheckedAt = new Date();
      await title.save();
      return title;
    }
    const details = await response.json() as TmdbDetails;
    const categories = new Set(title.categories);
    if (title.mediaType === 'movie') categories.add('movies');
    else categories.add('tv-shows');
    const countries = details.origin_country ?? details.production_countries?.map((country) => country.iso_3166_1) ?? title.countries;
    if (countries?.includes('KR')) categories.add('k-dramas');
    if (countries?.includes('CN')) categories.add('c-dramas');
    if (countries?.includes('JP')) categories.add('j-dramas');
    if (countries?.includes('TH')) categories.add('thai-dramas');
    return MediaTitle.findByIdAndUpdate(title._id, { $set: {
      ...(details.title || details.name ? { title: details.title || details.name } : {}),
      ...(details.original_title || details.original_name ? { originalTitle: details.original_title || details.original_name } : {}),
      ...(details.overview ? { synopsis: details.overview } : {}),
      ...(typeof details.runtime === 'number' ? { runtime: details.runtime } : details.episode_run_time?.[0] ? { runtime: details.episode_run_time[0] } : {}),
      ...(typeof details.number_of_episodes === 'number' ? { totalEpisodes: details.number_of_episodes } : {}),
      ...(typeof details.number_of_seasons === 'number' ? { seasons: details.number_of_seasons } : {}),
      ...(details.genres ? { genres: details.genres.map((genre) => genre.name) } : {}),
      ...(countries ? { countries } : {}),
      ...(typeof details.vote_average === 'number' ? { tmdbRating: details.vote_average } : {}),
      ...(typeof details.vote_count === 'number' ? { tmdbVoteCount: details.vote_count } : {}),
      categories: [...categories],
      ...(details.release_date || details.first_air_date ? { releaseDate: new Date(details.release_date || details.first_air_date!) } : {}),
      metadataCheckedAt: new Date(),
      ratingsCheckedAt: new Date(),
    } }, { new: true });
  } catch {
    await MediaTitle.updateOne({ _id: title._id }, { $set: { metadataCheckedAt: new Date(), ratingsCheckedAt: new Date() } });
    return title;
  }
}

export async function searchCatalog(query: string, category: string | undefined, page: number) {
  const cacheKey = `${query.toLocaleLowerCase()}|${category ?? ''}|${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const useAniList = category === 'anime';
  const configured = useAniList ? Boolean(env.ANILIST_GRAPHQL_URL) : Boolean(env.TMDB_API_KEY || env.TMDB_READ_ACCESS_TOKEN);
  const providers = { tmdb: Boolean(env.TMDB_API_KEY || env.TMDB_READ_ACCESS_TOKEN), anilist: Boolean(env.ANILIST_GRAPHQL_URL) };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, 'i');
  const localQuery: Record<string, unknown> = { $or: [{ title: expression }, { originalTitle: expression }, { alternativeTitles: expression }] };
  if (category) localQuery.categories = category;
  const local = await MediaTitle.find(localQuery).select('title originalTitle alternativeTitles mediaType formats categories countries languages genres synopsis poster backdrop releaseDate runtime seasons totalEpisodes providerIds.tmdb providerIds.anilist tmdbRating tmdbVoteCount anilistAverageScore anilistMeanScore anilistPopularity communityRating communityRatingCount metadataSource').sort({ communityRatingCount: -1, updatedAt: -1 }).skip((page - 1) * 20).limit(20).lean();
  const localTotal = await MediaTitle.countDocuments(localQuery);
  const providerResult = configured ? (useAniList ? await searchAniList(query, page) : await searchTmdb(query, page)) : { items: [], totalPages: 0 };
  const providerIds = new Set(providerResult.items.map((item) => String(item._id)));
  const value = {
    items: [...providerResult.items, ...local.filter((item) => !providerIds.has(String(item._id)))],
    page,
    totalPages: Math.max(providerResult.totalPages, Math.ceil(localTotal / 20)),
    providers,
    searchConfigured: configured,
  };
  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(cacheKey, { expiresAt: Date.now() + searchCacheTtl, value });
  return value;
}
