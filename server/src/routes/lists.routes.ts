import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { ListShare, MediaTitle, User, UserLibraryEntry, UserList } from '../models/index.js';
import { HttpError, route } from '../utils/http.js';

export const listsRouter = Router();
listsRouter.use(authenticate);

function slugify(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'collection';
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }

listsRouter.get('/', route(async (request, response) => {
  const items = await UserList.find({ userId: request.auth!.userId }).sort({ listType: 1, updatedAt: -1 }).populate('orderedItems.titleId').lean();
  response.json({ items });
}));

listsRouter.post('/', route(async (request, response) => {
  const input = z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(280).default(''), visibility: z.enum(['public', 'private']).default('private') }).parse(request.body);
  const base = slugify(input.name);
  let slug = base;
  for (let suffix = 2; await UserList.exists({ userId: request.auth!.userId, slug }); suffix += 1) slug = `${base.slice(0, 60)}-${suffix}`;
  const item = await UserList.create({ ...input, slug, userId: request.auth!.userId, listType: 'custom' });
  response.status(201).json({ item });
}));

listsRouter.patch('/:id', route(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new HttpError(404, 'Collection not found.');
  const input = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(280).optional(),
    visibility: z.enum(['public', 'private']).optional(),
    titleIds: z.array(z.string().refine(mongoose.isValidObjectId)).max(500).optional(),
  }).parse(request.body);
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  if (list.listType === 'watchlist' && input.name && input.name !== 'My Watchlist') throw new HttpError(400, 'The default watchlist keeps its name.');
  if (input.name) { list.name = input.name; if (list.listType !== 'watchlist') list.slug = slugify(input.name); }
  if (input.description !== undefined) list.description = input.description;
  if (input.visibility) list.visibility = input.visibility;
  if (input.titleIds) {
    const ids = input.titleIds.map((id) => new mongoose.Types.ObjectId(id));
    const count = await MediaTitle.countDocuments({ _id: { $in: ids } });
    if (count !== new Set(ids.map(String)).size) throw new HttpError(404, 'One or more titles were not found.');
    list.orderedItems.splice(0, list.orderedItems.length);
    ids.forEach((titleId, position) => list.orderedItems.push({ titleId, position, addedAt: new Date() }));
  }
  await list.save();
  response.json({ item: list });
}));

listsRouter.delete('/:id', route(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new HttpError(404, 'Collection not found.');
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  if (list.listType === 'watchlist') throw new HttpError(400, 'The default watchlist cannot be deleted.');
  await Promise.all([ListShare.deleteMany({ listId: list._id }), list.deleteOne()]);
  response.status(204).end();
}));

listsRouter.post('/:id/items', route(async (request, response) => {
  const input = z.object({ titleId: z.string().refine(mongoose.isValidObjectId) }).parse(request.body);
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  const titleId = new mongoose.Types.ObjectId(input.titleId);
  if (!(await MediaTitle.exists({ _id: titleId }))) throw new HttpError(404, 'Title not found.');
  if (list.listType === 'watchlist') await UserLibraryEntry.findOneAndUpdate({ userId: request.auth!.userId, titleId }, { $set: { status: 'planned' }, $setOnInsert: { titleId, userId: request.auth!.userId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (!list.orderedItems.some((item) => String(item.titleId) === String(titleId))) list.orderedItems.push({ titleId, position: list.orderedItems.length, addedAt: new Date() });
  await list.save();
  await list.populate('orderedItems.titleId');
  response.json({ item: list });
}));

listsRouter.delete('/:id/items/:titleId', route(async (request, response) => {
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  for (let index = list.orderedItems.length - 1; index >= 0; index -= 1) {
    if (String(list.orderedItems[index]?.titleId) === String(request.params.titleId)) list.orderedItems.splice(index, 1);
  }
  list.orderedItems.forEach((item, position) => { item.position = position; });
  await list.save();
  if (list.listType === 'watchlist') await UserLibraryEntry.deleteOne({ userId: request.auth!.userId, titleId: request.params.titleId, status: 'planned' });
  response.status(204).end();
}));

listsRouter.post('/:id/share', route(async (request, response) => {
  const input = z.object({ expiresInDays: z.number().int().min(1).max(365).default(30) }).parse(request.body ?? {});
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  await ListShare.updateMany({ listId: list._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  await ListShare.create({ listId: list._id, ownerId: request.auth!.userId, tokenHash: digest(token), expiresAt });
  response.status(201).json({ url: new URL(`/s/${token}`, env.FRONTEND_URL).toString(), expiresAt });
}));

listsRouter.delete('/:id/share', route(async (request, response) => {
  const list = await UserList.findOne({ _id: request.params.id, userId: request.auth!.userId });
  if (!list) throw new HttpError(404, 'Collection not found.');
  await ListShare.updateMany({ listId: list._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  response.status(204).end();
}));

export const sharesRouter = Router();
sharesRouter.get('/:token', route(async (request, response) => {
  const share = await ListShare.findOne({ tokenHash: digest(String(request.params.token)), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!share) throw new HttpError(404, 'This share link has expired or was revoked.');
  const [list, owner] = await Promise.all([
    UserList.findOne({ _id: share.listId, userId: share.ownerId }).populate('orderedItems.titleId').lean(),
    User.findById(share.ownerId).select('username avatar').lean(),
  ]);
  if (!list || !owner) throw new HttpError(404, 'This collection is no longer available.');
  response.json({ item: { name: list.name, description: list.description, items: list.orderedItems.map((item) => item.titleId), updatedAt: list.updatedAt }, owner: { username: owner.username, avatar: owner.avatar } });
}));
