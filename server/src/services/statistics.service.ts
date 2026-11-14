import type { Types } from 'mongoose';
import { UserLibraryEntry } from '../models/index.js';
import { hydrateProviderTitle } from './catalog.service.js';

async function fillMissingRuntimeMetadata(userId: Types.ObjectId) {
  const missing = await UserLibraryEntry.aggregate<{ titleId: Types.ObjectId }>([
    { $match: { userId, $or: [{ status: 'completed' }, { episodesWatched: { $gt: 0 } }] } },
    { $lookup: { from: 'mediatitles', localField: 'titleId', foreignField: '_id', as: 'title' } },
    { $unwind: '$title' },
    { $match: { $and: [
      { $or: [
        { 'title.runtime': { $exists: false } }, { 'title.runtime': null }, { 'title.runtime': { $lte: 0 } },
        { $and: [{ 'title.mediaType': 'series' }, { $or: [{ 'title.totalEpisodes': { $exists: false } }, { 'title.totalEpisodes': null }, { 'title.totalEpisodes': { $lte: 0 } }] }] },
      ] },
      { $or: [{ 'title.providerIds.tmdb': { $exists: true, $ne: '' } }, { 'title.providerIds.anilist': { $exists: true, $ne: '' } }] },
    ] } },
    { $group: { _id: '$title._id' } },
    { $project: { _id: 0, titleId: '$_id' } },
  ]);
  for (let index = 0; index < missing.length; index += 4) {
    await Promise.all(missing.slice(index, index + 4).map(({ titleId }) => hydrateProviderTitle(String(titleId))));
  }
  const completedWithoutProgress = await UserLibraryEntry.aggregate<{ _id: Types.ObjectId; episodes: number }>([
    { $match: { userId, status: 'completed', $or: [{ episodesWatched: { $exists: false } }, { episodesWatched: null }, { episodesWatched: { $lte: 0 } }] } },
    { $lookup: { from: 'mediatitles', localField: 'titleId', foreignField: '_id', as: 'title' } },
    { $unwind: '$title' },
    { $match: { 'title.mediaType': 'series', 'title.totalEpisodes': { $gt: 0 } } },
    { $project: { _id: 1, episodes: '$title.totalEpisodes' } },
  ]);
  if (completedWithoutProgress.length) {
    await UserLibraryEntry.bulkWrite(completedWithoutProgress.map(({ _id, episodes }) => ({
      updateOne: { filter: { _id, userId, status: 'completed', $or: [{ episodesWatched: { $exists: false } }, { episodesWatched: null }, { episodesWatched: { $lte: 0 } }] }, update: { $set: { episodesWatched: episodes } } },
    })));
  }
}

export async function getUserStatistics(userId: Types.ObjectId) {
  type AggregateRow = {
    summary: Array<{ total: number; completed: number; watching: number; planned: number; onHold: number; dropped: number; movies: number; series: number; completedMovies: number; completedSeries: number; episodes: number; minutes: number; unestimatedTitles: number }>;
    categories: Array<{ _id: string; count: number }>;
    months: Array<{ _id: string; count: number }>;
  };
  await fillMissingRuntimeMetadata(userId);
  const rows = await UserLibraryEntry.aggregate<AggregateRow>([
    { $match: { userId } },
    { $lookup: { from: 'mediatitles', localField: 'titleId', foreignField: '_id', as: 'title' } },
    { $unwind: '$title' },
    { $facet: {
      summary: [{ $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        watching: { $sum: { $cond: [{ $eq: ['$status', 'watching'] }, 1, 0] } },
        planned: { $sum: { $cond: [{ $eq: ['$status', 'planned'] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ['$status', 'on-hold'] }, 1, 0] } },
        dropped: { $sum: { $cond: [{ $eq: ['$status', 'dropped'] }, 1, 0] } },
        movies: { $sum: { $cond: [{ $eq: ['$title.mediaType', 'movie'] }, 1, 0] } },
        series: { $sum: { $cond: [{ $eq: ['$title.mediaType', 'series'] }, 1, 0] } },
        completedMovies: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $eq: ['$title.mediaType', 'movie'] }] }, 1, 0] } },
        completedSeries: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $eq: ['$title.mediaType', 'series'] }] }, 1, 0] } },
        unestimatedTitles: { $sum: { $cond: [
          { $and: [
            { $or: [{ $eq: ['$status', 'completed'] }, { $gt: ['$episodesWatched', 0] }] },
            { $or: [
              { $lte: [{ $ifNull: ['$title.runtime', 0] }, 0] },
              { $and: [
                { $eq: ['$title.mediaType', 'series'] },
                { $eq: ['$status', 'completed'] },
                { $lte: [{ $ifNull: ['$title.totalEpisodes', 0] }, 0] },
                { $lte: [{ $ifNull: ['$episodesWatched', 0] }, 0] },
              ] },
            ] },
          ] },
          1,
          0,
        ] } },
        episodes: { $sum: { $cond: [
          { $and: [{ $eq: ['$status', 'completed'] }, { $eq: ['$title.mediaType', 'series'] }, { $gt: ['$title.totalEpisodes', 0] }] },
          '$title.totalEpisodes',
          { $ifNull: ['$episodesWatched', 0] },
        ] } },
        minutes: { $sum: { $cond: [
          { $eq: ['$title.mediaType', 'movie'] },
          { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$title.runtime', 0] }, 0] },
          { $multiply: [
            { $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gt: ['$title.totalEpisodes', 0] }] }, '$title.totalEpisodes', { $ifNull: ['$episodesWatched', 0] }] },
            { $ifNull: ['$title.runtime', 0] },
          ] },
        ] } },
      } }],
      categories: [
        { $match: { 'title.categories': { $in: ['movies', 'tv-shows', 'k-dramas', 'c-dramas', 'j-dramas', 'thai-dramas', 'anime'] } } },
        { $unwind: '$title.categories' },
        { $match: { 'title.categories': { $in: ['movies', 'tv-shows', 'k-dramas', 'c-dramas', 'j-dramas', 'thai-dramas', 'anime'] } } },
        { $group: { _id: '$title.categories', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
      months: [{ $match: { status: 'completed', completedAt: { $type: 'date' } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$completedAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 24 }],
    } },
  ]);
  const row = rows[0];
  const summary = row?.summary[0];
  return {
    total: summary?.total ?? 0,
    completed: summary?.completed ?? 0,
    watching: summary?.watching ?? 0,
    planned: summary?.planned ?? 0,
    onHold: summary?.onHold ?? 0,
    dropped: summary?.dropped ?? 0,
    movies: summary?.movies ?? 0,
    series: summary?.series ?? 0,
    completedMovies: summary?.completedMovies ?? 0,
    completedSeries: summary?.completedSeries ?? 0,
    unestimatedTitles: summary?.unestimatedTitles ?? 0,
    episodes: summary?.episodes ?? 0,
    minutes: summary?.minutes ?? 0,
    byCategory: (row?.categories ?? []).map((item) => ({ category: item._id, count: item.count })),
    byMonth: (row?.months ?? []).map((item) => ({ month: item._id, count: item.count })),
  };
}
