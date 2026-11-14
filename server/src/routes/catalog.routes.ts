import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, authenticateOptional } from '../middleware/authenticate.js';
import { CommunityRating, MediaTitle, UserLibraryEntry } from '../models/index.js';
import { discoverCatalog, hydrateProviderTitle, searchCatalog } from '../services/catalog.service.js';
import { HttpError, pageParams, route } from '../utils/http.js';

export const catalogRouter = Router();

catalogRouter.get('/search', route(async (request, response) => {
  const query = z.string().trim().min(2).max(100).parse(request.query.q ?? '');
  const category = typeof request.query.category === 'string' ? request.query.category.toLowerCase() : undefined;
  const { page } = pageParams(request.query as Record<string, unknown>);
  response.json(await searchCatalog(query, category, page));
}));

catalogRouter.get('/discover', route(async (request, response) => {
  const category = typeof request.query.category === 'string' ? request.query.category.toLowerCase() : undefined;
  const { page } = pageParams(request.query as Record<string, unknown>);
  response.json(await discoverCatalog(category, page));
}));

catalogRouter.post('/manual', authenticate, route(async (request, response) => {
  const input = z.object({
    title: z.string().trim().min(1).max(180),
    originalTitle: z.string().trim().max(180).optional(),
    mediaType: z.enum(['movie', 'series']),
    categories: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    genres: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    releaseDate: z.iso.date().optional(),
    totalEpisodes: z.number().int().min(0).max(10000).optional(),
    synopsis: z.string().trim().max(5000).default(''),
    poster: z.url().or(z.literal('')).default(''),
    backdrop: z.url().or(z.literal('')).default(''),
  }).parse(request.body);
  const title = await MediaTitle.create({ ...input, releaseDate: input.releaseDate ? new Date(input.releaseDate) : undefined, categories: [...new Set(input.categories.map((category) => category.toLowerCase()))], metadataSource: 'manual' });
  response.status(201).json({ item: title });
}));

catalogRouter.get('/:id', authenticateOptional, route(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new HttpError(404, 'Title not found.');
  const title = await hydrateProviderTitle(String(request.params.id)) ?? await MediaTitle.findById(request.params.id);
  if (!title) throw new HttpError(404, 'Title not found.');
  let myCommunityRating: number | null = null;
  if (request.auth?.userId) {
    const rating = await CommunityRating.findOne({ userId: request.auth.userId, titleId: title._id }).select('rating').lean();
    myCommunityRating = rating?.rating ?? null;
  }
  const libraryEntry = request.auth ? await UserLibraryEntry.findOne({ userId: request.auth.userId, titleId: title._id }).select('status episodesWatched seasonsWatched personalRating notes startedAt completedAt rewatchCount createdAt updatedAt').lean() : null;
  response.json({ item: title, myCommunityRating, libraryEntry });
}));

const ratingSchema = z.object({ rating: z.number().min(1).max(10).refine((value) => Number.isInteger(value * 2), 'Use whole or half-point ratings.') });

export const ratingRouter = Router();
ratingRouter.put('/:titleId/rating', authenticate, route(async (request, response) => {
  const rating = ratingSchema.parse(request.body).rating;
  const titleIdParam = String(request.params.titleId);
  if (!mongoose.isValidObjectId(titleIdParam)) throw new HttpError(404, 'Title not found.');
  const titleId = new mongoose.Types.ObjectId(titleIdParam);
  if (!(await MediaTitle.exists({ _id: titleId }))) throw new HttpError(404, 'Title not found.');
  await CommunityRating.findOneAndUpdate({ userId: request.auth!.userId, titleId }, { $set: { rating } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const aggregate = await CommunityRating.aggregate<{ average: number; count: number }>([{ $match: { titleId } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  const current = aggregate[0] ?? { average: 0, count: 0 };
  await MediaTitle.updateOne({ _id: titleId }, { $set: { communityRating: Math.round(current.average * 100) / 100, communityRatingCount: current.count } });
  response.json({ rating, communityRating: Math.round(current.average * 100) / 100, ratingCount: current.count });
}));

ratingRouter.delete('/:titleId/rating', authenticate, route(async (request, response) => {
  const titleIdParam = String(request.params.titleId);
  if (!mongoose.isValidObjectId(titleIdParam)) throw new HttpError(404, 'Title not found.');
  const titleId = new mongoose.Types.ObjectId(titleIdParam);
  await CommunityRating.deleteOne({ userId: request.auth!.userId, titleId });
  const aggregate = await CommunityRating.aggregate<{ average: number; count: number }>([{ $match: { titleId } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  const current = aggregate[0] ?? { average: 0, count: 0 };
  await MediaTitle.updateOne({ _id: titleId }, { $set: { communityRating: current.count ? Math.round(current.average * 100) / 100 : 0, communityRatingCount: current.count } });
  response.status(204).end();
}));
