import type { Types } from 'mongoose';
import { UserLibraryEntry } from '../models/index.js';

export async function getUserStatistics(userId: Types.ObjectId) {
  type AggregateRow = {
    summary: Array<{ total: number; completed: number; watching: number; planned: number; onHold: number; dropped: number; movies: number; series: number; episodes: number; minutes: number }>;
    categories: Array<{ _id: string; count: number }>;
    months: Array<{ _id: string; count: number }>;
  };
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
        episodes: { $sum: '$episodesWatched' },
        minutes: { $sum: { $cond: [
          { $eq: ['$status', 'completed'] },
          { $cond: [
            { $eq: ['$title.mediaType', 'movie'] },
            '$title.runtime',
            { $multiply: [{ $cond: [{ $and: [{ $eq: ['$status', 'completed'] }, { $gt: ['$title.totalEpisodes', 0] }] }, '$title.totalEpisodes', '$episodesWatched'] }, '$title.runtime'] },
          ] },
          0,
        ] } },
      } }],
      categories: [{ $match: { status: 'completed' } }, { $unwind: '$title.categories' }, { $group: { _id: '$title.categories', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
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
    episodes: summary?.episodes ?? 0,
    minutes: summary?.minutes ?? 0,
    byCategory: (row?.categories ?? []).map((item) => ({ category: item._id, count: item.count })),
    byMonth: (row?.months ?? []).map((item) => ({ month: item._id, count: item.count })),
  };
}
