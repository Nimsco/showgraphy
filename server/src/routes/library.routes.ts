import { Router } from 'express';
import mongoose, { type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { MediaTitle, UserLibraryEntry, UserList } from '../models/index.js';
import { getUserStatistics } from '../services/statistics.service.js';
import { HttpError, pageParams, route } from '../utils/http.js';

export const libraryRouter = Router();
libraryRouter.use(authenticate);

const statusSchema = z.enum(['completed', 'watching', 'planned', 'on-hold', 'dropped']);
const personalRatingSchema = z.number().min(1).max(10).refine((value) => Number.isInteger(value * 2), 'Use whole or half-point ratings.');
const entryFields = z.object({
  status: statusSchema.optional(),
  episodesWatched: z.number().int().min(0).max(10000).optional(),
  seasonsWatched: z.number().int().min(0).max(1000).optional(),
  personalRating: personalRatingSchema.nullable().optional(),
  notes: z.string().max(2000).optional(),
  rewatchCount: z.number().int().min(0).max(1000).optional(),
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function syncWatchlist(userId: mongoose.Types.ObjectId, titleId: mongoose.Types.ObjectId, status: string) {
  const watchlist = await UserList.findOne({ userId, listType: 'watchlist' });
  if (!watchlist) return;
  const existing = watchlist.orderedItems.findIndex((item) => String(item.titleId) === String(titleId));
  if (status === 'planned' && existing === -1) watchlist.orderedItems.push({ titleId, addedAt: new Date(), position: watchlist.orderedItems.length });
  if (status !== 'planned' && existing !== -1) watchlist.orderedItems.splice(existing, 1);
  watchlist.orderedItems.forEach((item, position) => { item.position = position; });
  await watchlist.save();
}

libraryRouter.get('/', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const status = request.query.status ? statusSchema.parse(request.query.status) : undefined;
  const sort = z.enum(['updated', 'added', 'title', 'release', 'rating']).default('updated').parse(request.query.sort);
  const category = typeof request.query.category === 'string' ? request.query.category.trim().toLowerCase() : undefined;
  const query = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 100) : '';
  const match: Record<string, unknown> = { userId: request.auth!.userId };
  if (status) match.status = status;
  const afterLookup: PipelineStage[] = [];
  if (category) afterLookup.push({ $match: { 'title.categories': category } });
  if (query) {
    const expression = new RegExp(escapeRegex(query), 'i');
    afterLookup.push({ $match: { $or: [{ 'title.title': expression }, { 'title.originalTitle': expression }, { 'title.alternativeTitles': expression }] } });
  }
  const sortFields: Record<typeof sort, Record<string, 1 | -1>> = {
    updated: { updatedAt: -1 }, added: { createdAt: -1 }, title: { 'title.title': 1 }, release: { 'title.releaseDate': -1 }, rating: { personalRating: -1 },
  };
  const result = await UserLibraryEntry.aggregate([
    { $match: match },
    { $lookup: { from: 'mediatitles', localField: 'titleId', foreignField: '_id', as: 'title' } },
    { $unwind: '$title' },
    { $set: { titleId: '$title' } },
    ...afterLookup,
    { $sort: sortFields[sort] },
    { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'value' }] } },
  ]);
  response.json({ items: result[0]?.items ?? [], page, limit, total: result[0]?.total[0]?.value ?? 0 });
}));

libraryRouter.post('/', route(async (request, response) => {
  const schema = z.object({ titleId: z.string().refine(mongoose.isValidObjectId, 'Invalid title.'), ...entryFields.shape });
  const input = schema.parse(request.body);
  const titleId = new mongoose.Types.ObjectId(input.titleId);
  const title = await MediaTitle.findById(titleId);
  if (!title) throw new HttpError(404, 'Title not found.');
  const status = input.status ?? 'planned';
  const episodesWatched = title.mediaType === 'movie' ? 0 : status === 'completed' && title.totalEpisodes ? title.totalEpisodes : input.episodesWatched ?? 0;
  if (title.totalEpisodes && episodesWatched > title.totalEpisodes) throw new HttpError(400, 'Episode progress cannot exceed the title total.');
  const entry = await UserLibraryEntry.findOneAndUpdate(
    { userId: request.auth!.userId, titleId },
    { $set: { ...input, titleId, status, episodesWatched, ...(status === 'watching' ? { startedAt: new Date() } : {}), ...(status === 'completed' ? { completedAt: new Date() } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).populate('titleId');
  await syncWatchlist(request.auth!.userId, titleId, status);
  response.status(201).json({ item: entry });
}));

libraryRouter.patch('/:id', route(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new HttpError(404, 'Library entry not found.');
  const input = entryFields.parse(request.body);
  const current = await UserLibraryEntry.findOne({ _id: request.params.id, userId: request.auth!.userId }).populate('titleId');
  if (!current) throw new HttpError(404, 'Library entry not found.');
  const title = current.titleId as unknown as { _id: mongoose.Types.ObjectId; mediaType: string; totalEpisodes?: number };
  if (input.episodesWatched !== undefined && title.mediaType === 'series' && title.totalEpisodes && input.episodesWatched > title.totalEpisodes) throw new HttpError(400, 'Episode progress cannot exceed the title total.');
  const status = input.status ?? current.status;
  const update: Record<string, unknown> = { ...input };
  const unset: Record<string, 1> = {};
  if (input.personalRating === null) delete update.personalRating, unset.personalRating = 1;
  if (status === 'watching' && !current.startedAt) update.startedAt = new Date();
  if (status === 'completed' && !current.completedAt) update.completedAt = new Date();
  if (status !== 'completed') unset.completedAt = 1;
  if (status === 'completed' && title.mediaType === 'series' && title.totalEpisodes) update.episodesWatched = title.totalEpisodes;
  const entry = await UserLibraryEntry.findOneAndUpdate({ _id: current._id, userId: request.auth!.userId }, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true }).populate('titleId');
  await syncWatchlist(request.auth!.userId, title._id, status);
  response.json({ item: entry });
}));

libraryRouter.delete('/:id', route(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new HttpError(404, 'Library entry not found.');
  const entry = await UserLibraryEntry.findOneAndDelete({ _id: request.params.id, userId: request.auth!.userId });
  if (!entry) throw new HttpError(404, 'Library entry not found.');
  await syncWatchlist(request.auth!.userId, entry.titleId, 'removed');
  response.status(204).end();
}));

export const statsRouter = Router();
statsRouter.get('/', authenticate, route(async (request, response) => {
  const stats = await getUserStatistics(request.auth!.userId);
  response.json({ stats });
}));
