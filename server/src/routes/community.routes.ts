import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { applyCommunityCategoryFilter, categoriesForCommunityPost, communityCategoriesSchema, communityCategorySchema } from '../constants/community-categories.js';
import { Block, CommunityComment, CommunityPollVote, CommunityPost, CommunityPostBookmark, CommunityPostLike, CommunityUploadReservation, Follow, MediaTitle, Notification, SocialReport, User } from '../models/index.js';
import { emitSocialNotification } from '../realtime/social-events.js';
import { createCommunityUploadSignature, destroyCommunityImage, isCommunityMediaConfigured, verifyCommunityImage } from '../services/community-media.service.js';
import { HttpError, pageParams, route } from '../utils/http.js';

export const communityRouter = Router();
communityRouter.use(authenticate);
const validId = (value: string) => mongoose.isValidObjectId(value);
const postIdSchema = z.string().refine(validId, 'Invalid post id.');
const safeUserFields = 'username avatar';
async function blockedIds(userId: string) {
  const edges = await Block.find({ $or: [{ blocker: userId }, { blockedUser: userId }] }).select('blocker blockedUser').lean();
  return edges.map((edge) => String(edge.blocker) === userId ? String(edge.blockedUser) : String(edge.blocker));
}
async function isBlockedEitherWay(a: string, b: string) {
  return Boolean(await Block.exists({ $or: [{ blocker: a, blockedUser: b }, { blocker: b, blockedUser: a }] }));
}
async function findAccessiblePost(postId: string, viewerId: string) {
  if (!validId(postId)) throw new HttpError(404, 'Discussion not found.');
  const post = await CommunityPost.findOne({ _id: postId, deletedAt: null }).populate({ path: 'author', select: `${safeUserFields} accountStatus profileVisibility`, match: { accountStatus: 'active', profileVisibility: 'public' } });
  const author = post?.author as unknown as { _id: mongoose.Types.ObjectId } | null;
  if (!post || !author || await isBlockedEitherWay(viewerId, String(author._id))) throw new HttpError(404, 'Discussion not found.');
  return post;
}
async function notify(recipient: string, actor: string, type: 'post_like' | 'post_comment' | 'comment_reply' | 'mention' | 'poll_vote', resourceId: mongoose.Types.ObjectId) {
  if (recipient === actor) return;
  const item = await Notification.findOneAndUpdate(
    { recipient, actor, type, resourceId }, { $setOnInsert: { recipient, actor, type, resourceId, readAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true },
  ).populate('actor', safeUserFields).lean();
  if (item) emitSocialNotification(recipient, item);
}
async function hydratePosts(posts: Array<Record<string, unknown>>, viewerId: string) {
  const ids = posts.map((post) => post._id as mongoose.Types.ObjectId);
  const mentionIds = [...new Set(posts.flatMap((post) => (post.mentions as mongoose.Types.ObjectId[] | undefined) ?? []).map(String))];
  const [likes, bookmarks, voteRows, viewerVotes, mentionUsers] = await Promise.all([
    CommunityPostLike.find({ post: { $in: ids }, user: viewerId }).select('post').lean(),
    CommunityPostBookmark.find({ post: { $in: ids }, user: viewerId }).select('post').lean(),
    CommunityPollVote.aggregate<{ _id: { post: mongoose.Types.ObjectId; optionIndex: number }; count: number }>([
      { $match: { post: { $in: ids } } }, { $group: { _id: { post: '$post', optionIndex: '$optionIndex' }, count: { $sum: 1 } } },
    ]),
    CommunityPollVote.find({ post: { $in: ids }, user: viewerId }).select('post optionIndex').lean(),
    mentionIds.length ? User.find({ _id: { $in: mentionIds }, accountStatus: 'active', profileVisibility: 'public' }).select('username avatar').lean() : [],
  ]);
  const liked = new Set(likes.map((item) => String(item.post)));
  const saved = new Set(bookmarks.map((item) => String(item.post)));
  const counts = new Map<string, number[]>();
  for (const row of voteRows) {
    const key = String(row._id.post);
    const values = counts.get(key) ?? [];
    values[row._id.optionIndex] = row.count;
    counts.set(key, values);
  }
  const ownVotes = new Map(viewerVotes.map((vote) => [String(vote.post), vote.optionIndex]));
  const usersById = new Map(mentionUsers.map((user) => [String(user._id), { id: String(user._id), username: user.username, avatar: user.avatar ?? '' }]));
  return posts.map((post) => {
    const categories = categoriesForCommunityPost(post.categories);
    const mentionedUsers = ((post.mentions as mongoose.Types.ObjectId[] | undefined) ?? []).map((id) => usersById.get(String(id))).filter(Boolean);
    const poll = post.poll as { options?: string[]; expiresAt?: Date | string } | undefined;
    if (!poll) return { ...post, categories, mentions: mentionedUsers, isLiked: liked.has(String(post._id)), isBookmarked: saved.has(String(post._id)) };
    const optionCounts = poll.options?.map((_, index) => counts.get(String(post._id))?.[index] ?? 0) ?? [];
    return { ...post, categories, mentions: mentionedUsers, poll: { ...poll, counts: optionCounts, totalVotes: optionCounts.reduce((sum, count) => sum + count, 0), myVote: ownVotes.get(String(post._id)) ?? null, closed: Boolean(poll.expiresAt && new Date(poll.expiresAt) <= new Date()) }, isLiked: liked.has(String(post._id)), isBookmarked: saved.has(String(post._id)) };
  });
}

const pollDefinitionSchema = z.object({
  question: z.string().trim().min(1).max(180),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6).refine((items) => new Set(items.map((item) => item.toLowerCase())).size === items.length, 'Poll options must be unique.'),
  expiresAt: z.string().datetime().optional(),
});
const pollSchema = pollDefinitionSchema.optional();
const createSchema = z.object({
  title: z.string().trim().min(1, 'Add a post title.').max(180),
  content: z.string().trim().max(4000).default(''),
  categories: communityCategoriesSchema.default(['general']),
  titleIds: z.array(z.string().refine(validId)).max(8).default([]),
  images: z.array(z.object({ publicId: z.string().trim().min(1).max(220), version: z.number().int().positive() })).max(4).refine((images) => new Set(images.map((image) => image.publicId)).size === images.length, 'An image can only be attached once.').default([]),
  mentionIds: z.array(z.string().refine(validId)).max(20).default([]),
  containsSpoilers: z.boolean().default(false),
  spoilerDescription: z.string().trim().max(120).default(''),
  poll: pollSchema,
});
const imageInputSchema = z.array(z.object({ publicId: z.string().trim().min(1).max(220), version: z.number().int().positive() })).max(4).refine((images) => new Set(images.map((image) => image.publicId)).size === images.length, 'An image can only be attached once.');
const editSchema = z.object({ title: z.string().trim().min(1, 'Add a post title.').max(180), content: z.string().trim().max(4000), categories: communityCategoriesSchema.optional(), titleIds: z.array(z.string().refine(validId)).max(8).optional(), images: imageInputSchema.optional(), poll: pollDefinitionSchema.nullable().optional(), containsSpoilers: z.boolean().optional(), spoilerDescription: z.string().trim().max(120).optional(), mentionIds: z.array(z.string().refine(validId)).max(20).optional() });
const commentSchema = z.object({ content: z.string().trim().min(1).max(2000), parentCommentId: z.string().refine(validId).optional(), mentionIds: z.array(z.string().refine(validId)).max(20).default([]) });

communityRouter.post('/uploads/signature', route(async (request, response) => {
  const signature = createCommunityUploadSignature(String(request.auth!.userId));
  await CommunityUploadReservation.create({ owner: request.auth!.userId, publicId: signature.public_id, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) });
  response.json(signature);
}));

communityRouter.post('/uploads/delete', route(async (request, response) => {
  if (!isCommunityMediaConfigured()) throw new HttpError(503, 'Community image uploads are not configured.');
  const publicId = z.string().trim().min(1).max(220).parse((request.body as { publicId?: unknown }).publicId);
  if (!publicId.startsWith(`showgraphy/community/${String(request.auth!.userId)}/`)) throw new HttpError(404, 'Image upload not found.');
  if (await CommunityPost.exists({ deletedAt: null, 'images.publicId': publicId })) throw new HttpError(409, 'This image is already attached to a discussion.');
  await destroyCommunityImage(publicId);
  await CommunityUploadReservation.deleteOne({ owner: request.auth!.userId, publicId });
  response.status(204).end();
}));

communityRouter.get('/posts', route(async (request, response) => {
  const { page, limit } = pageParams(request.query as Record<string, unknown>);
  const viewerId = String(request.auth!.userId);
  const filter: Record<string, unknown> = { deletedAt: null, author: { $nin: await blockedIds(viewerId) } };
  const feed = z.enum(['discover', 'following', 'trending']).default('discover').parse(request.query.feed ?? 'discover');
  const titleSort = z.enum(['recent', 'popular']).default('recent').parse(request.query.sort ?? 'recent');
  if (request.query.category !== undefined) applyCommunityCategoryFilter(filter, communityCategorySchema.parse(request.query.category));
  if (feed === 'following') {
    const followed = await Follow.find({ follower: viewerId }).select('following').lean();
    filter.author = { $in: [...followed.map((item) => item.following), new mongoose.Types.ObjectId(viewerId)], $nin: await blockedIds(viewerId) };
  }
  if (request.query.titleId !== undefined) {
    const titleId = String(request.query.titleId);
    if (!validId(titleId)) throw new HttpError(400, 'Invalid title id.');
    filter['mediaReferences.titleId'] = new mongoose.Types.ObjectId(titleId);
  }
  if (request.query.author !== undefined) {
    const author = await User.findOne({ username: String(request.query.author).toLowerCase(), accountStatus: 'active', profileVisibility: 'public' }).select('_id').lean();
    if (!author) return response.json({ items: [], page, hasMore: false });
    filter.author = author._id;
  }
  let posts: Array<Record<string, unknown>>;
  if (feed === 'trending' || titleSort === 'popular') {
    const now = new Date();
    posts = await CommunityPost.aggregate([
      { $match: filter },
      { $addFields: { trendScore: feed === 'trending' ? { $divide: [{ $add: [{ $multiply: ['$likeCount', 1.2] }, { $multiply: ['$commentCount', 2] }, 1] }, { $pow: [{ $add: [{ $divide: [{ $subtract: [now, '$createdAt'] }, 3_600_000] }, 2] }, 0.8] }] } : { $add: [{ $multiply: ['$likeCount', 1.2] }, { $multiply: ['$commentCount', 2] }, 1] } } },
      { $sort: { trendScore: -1, createdAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
      { $lookup: { from: User.collection.name, localField: 'author', foreignField: '_id', as: 'author' } }, { $unwind: '$author' }, { $match: { 'author.accountStatus': 'active', 'author.profileVisibility': 'public' } },
      { $project: { 'author.passwordHash': 0, 'author.email': 0, 'author.__v': 0 } },
    ]).then((items) => items.map((item) => ({ ...item, author: { _id: item.author._id, username: item.author.username, avatar: item.author.avatar } })));
  } else {
    posts = await CommunityPost.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean() as unknown as Array<Record<string, unknown>>;
    posts = posts.filter((post) => post.author);
  }
  response.json({ items: await hydratePosts(posts as unknown as Array<Record<string, unknown>>, viewerId), page, hasMore: posts.length === limit });
}));

communityRouter.get('/posts/saved', route(async (request, response) => {
  const { page, limit } = pageParams(request.query as Record<string, unknown>);
  const viewerId = String(request.auth!.userId);
  const bookmarks = await CommunityPostBookmark.find({ user: viewerId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1).select('post').lean();
  const ids = bookmarks.slice(0, limit).map((item) => item.post);
  const posts = await CommunityPost.find({ _id: { $in: ids }, deletedAt: null, author: { $nin: await blockedIds(viewerId) } }).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean();
  const byId = new Map(posts.map((post) => [String(post._id), post]));
  const items = await hydratePosts(ids.map((id) => byId.get(String(id))).filter((post) => Boolean(post?.author)) as unknown as Array<Record<string, unknown>>, viewerId);
  response.json({ items, page, hasMore: bookmarks.length > limit });
}));

communityRouter.get('/posts/:postId', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  const [item] = await hydratePosts([post.toObject() as unknown as Record<string, unknown>], String(request.auth!.userId));
  response.json({ item });
}));

communityRouter.post('/posts', route(async (request, response) => {
  const input = createSchema.parse(request.body);
  const titleIds = [...new Set(input.titleIds)];
  const mentionIds = [...new Set(input.mentionIds)].filter((id) => id !== String(request.auth!.userId));
  if (input.poll?.expiresAt && (new Date(input.poll.expiresAt) <= new Date() || new Date(input.poll.expiresAt).getTime() > Date.now() + 30 * 86_400_000)) throw new HttpError(400, 'Poll expiration must be within the next 30 days.');
  const [titles, mentions, images] = await Promise.all([
    titleIds.length ? MediaTitle.find({ _id: { $in: titleIds } }).select('_id title poster mediaType releaseDate').lean() : [],
    mentionIds.length ? User.find({ _id: { $in: mentionIds, $nin: await blockedIds(String(request.auth!.userId)) }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username') : [],
    Promise.all(input.images.map((image) => verifyCommunityImage(String(request.auth!.userId), image))),
  ]);
  if (titles.length !== titleIds.length) throw new HttpError(400, 'One or more referenced titles could not be found.');
  if (mentions.length !== mentionIds.length) throw new HttpError(400, 'One or more mentioned accounts are unavailable.');
  if (mentions.some((person) => !input.content.toLowerCase().includes(`@${person.username.toLowerCase()}`))) throw new HttpError(400, 'Each selected mention must appear in your post.');
  if (input.images.length) {
    const reservations = await CommunityUploadReservation.find({ owner: request.auth!.userId, publicId: { $in: input.images.map((image) => image.publicId) }, expiresAt: { $gt: new Date() } }).select('publicId').lean();
    if (reservations.length !== input.images.length) throw new HttpError(400, 'One or more image uploads expired. Please add them again.');
  }
  if (input.images.length && await CommunityPost.exists({ 'images.publicId': { $in: input.images.map((image) => image.publicId) } })) throw new HttpError(409, 'An uploaded image has already been attached to another discussion.');
  const item = await CommunityPost.create({
    author: request.auth!.userId, title: input.title, content: input.content, categories: input.categories,
    mediaReferences: titles.map((title) => ({ titleId: title._id, title: title.title, poster: title.poster, mediaType: title.mediaType, releaseDate: title.releaseDate })), images,
    mentions: mentionIds, containsSpoilers: input.containsSpoilers, spoilerDescription: input.spoilerDescription,
    poll: input.poll ? { ...input.poll, expiresAt: input.poll.expiresAt ? new Date(input.poll.expiresAt) : undefined } : undefined,
  });
  if (input.images.length) await CommunityUploadReservation.deleteMany({ owner: request.auth!.userId, publicId: { $in: input.images.map((image) => image.publicId) } });
  const populated = await item.populate('author', safeUserFields);
  for (const id of mentionIds) await notify(id, String(request.auth!.userId), 'mention', item._id);
  const [hydrated] = await hydratePosts([populated.toObject() as unknown as Record<string, unknown>], String(request.auth!.userId));
  response.status(201).json({ item: hydrated });
}));

communityRouter.patch('/posts/:postId', route(async (request, response) => {
  const input = editSchema.parse(request.body);
  const postId = postIdSchema.parse(request.params.postId);
  const ownerId = String(request.auth!.userId);
  const current = await CommunityPost.findOne({ _id: postId, author: ownerId, deletedAt: null });
  if (!current) throw new HttpError(404, 'Your discussion could not be found.');
  const { mentionIds, titleIds, images, poll, ...fields } = input;
  let mentionRefs: string[] | undefined;
  let titleSnapshots: Array<{ titleId: mongoose.Types.ObjectId; title: string; poster: string; mediaType: 'movie' | 'series'; releaseDate?: Date | null }> | undefined;
  let imageSnapshots: typeof current.images | undefined;
  if (titleIds !== undefined) {
    const uniqueTitleIds = [...new Set(titleIds)];
    const titles = uniqueTitleIds.length ? await MediaTitle.find({ _id: { $in: uniqueTitleIds } }).select('_id title poster mediaType releaseDate').lean() : [];
    if (titles.length !== uniqueTitleIds.length) throw new HttpError(400, 'One or more referenced titles could not be found.');
    titleSnapshots = titles.map((title) => ({ titleId: title._id, title: title.title, poster: title.poster, mediaType: title.mediaType, releaseDate: title.releaseDate }));
  }
  if (mentionIds !== undefined) {
    mentionRefs = [...new Set(mentionIds)].filter((id) => id !== ownerId);
    const people = mentionRefs.length ? await User.find({ _id: { $in: mentionRefs, $nin: await blockedIds(ownerId) }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username') : [];
    if (people.length !== mentionRefs.length || people.some((person) => !fields.content.toLowerCase().includes(`@${person.username.toLowerCase()}`))) throw new HttpError(400, 'One or more selected mentions are unavailable or missing from your post.');
  }
  const addedImages: Array<{ publicId: string; version: number }> = [];
  if (images !== undefined) {
    const existingById = new Map(current.images.map((image) => [image.publicId, image]));
    const additions = images.filter((image) => !existingById.has(image.publicId));
    if (additions.length && await CommunityPost.exists({ _id: { $ne: current._id }, 'images.publicId': { $in: additions.map((image) => image.publicId) } })) throw new HttpError(409, 'An uploaded image has already been attached to another discussion.');
    if (additions.length) {
      const reservations = await CommunityUploadReservation.find({ owner: ownerId, publicId: { $in: additions.map((image) => image.publicId) }, expiresAt: { $gt: new Date() } }).select('publicId').lean();
      if (reservations.length !== additions.length) throw new HttpError(400, 'One or more image uploads expired. Please add them again.');
    }
    const verifiedAdditions = await Promise.all(additions.map((image) => verifyCommunityImage(ownerId, image)));
    const verifiedById = new Map(verifiedAdditions.map((image) => [image.publicId, image]));
    imageSnapshots = images.map((image) => existingById.get(image.publicId) ?? verifiedById.get(image.publicId)!) as typeof current.images;
    addedImages.push(...additions);
  }
  const voteCount = poll !== undefined ? await CommunityPollVote.countDocuments({ post: current._id }) : 0;
  if (poll !== undefined && voteCount > 0) {
    const oldPoll = current.poll;
    if (!oldPoll || !poll) throw new HttpError(409, 'A poll with votes cannot be removed or replaced.');
    if (poll.question !== oldPoll.question || poll.options.length !== oldPoll.options.length || poll.options.some((option, index) => option !== oldPoll.options[index])) throw new HttpError(409, 'This poll already has votes. Its question and options can no longer be changed.');
    const oldExpiry = oldPoll.expiresAt?.getTime();
    const nextExpiry = poll.expiresAt ? new Date(poll.expiresAt).getTime() : undefined;
    if ((oldExpiry === undefined) !== (nextExpiry === undefined) || (oldExpiry !== undefined && nextExpiry !== undefined && nextExpiry < oldExpiry)) throw new HttpError(409, 'A poll with votes can only keep or extend its existing end time.');
  }
  const set: Record<string, unknown> = {
    ...fields,
    ...(titleSnapshots !== undefined ? { mediaReferences: titleSnapshots } : {}),
    ...(mentionRefs !== undefined ? { mentions: mentionRefs } : {}),
    ...(imageSnapshots !== undefined ? { images: imageSnapshots } : {}),
    ...(poll && poll !== null ? { poll: { ...poll, expiresAt: poll.expiresAt ? new Date(poll.expiresAt) : undefined } } : {}),
    isEdited: true,
    editedAt: new Date(),
  };
  const update: Record<string, unknown> = { $set: set };
  if (poll === null) update.$unset = { poll: 1 };
  const item = await CommunityPost.findOneAndUpdate({ _id: current._id, author: ownerId, deletedAt: null }, update, { new: true, runValidators: true }).populate('author', safeUserFields);
  if (!item) throw new HttpError(404, 'Your discussion could not be found.');
  if (addedImages.length) await CommunityUploadReservation.deleteMany({ owner: ownerId, publicId: { $in: addedImages.map((image) => image.publicId) } });
  if (imageSnapshots !== undefined) {
    const retained = new Set(imageSnapshots.map((image) => image.publicId));
    const removed = current.images.filter((image) => !retained.has(image.publicId));
    await Promise.allSettled(removed.map(async (image) => {
      if (!(await CommunityPost.exists({ 'images.publicId': image.publicId }))) await destroyCommunityImage(image.publicId);
    }));
  }
  response.json({ item: { ...item.toObject(), isLiked: false, isBookmarked: false } });
}));

communityRouter.delete('/posts/:postId', route(async (request, response) => {
  const item = await CommunityPost.findOneAndUpdate({ _id: postIdSchema.parse(request.params.postId), author: request.auth!.userId, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!item) throw new HttpError(404, 'Your discussion could not be found.');
  if (item.images.length) await Promise.allSettled(item.images.map((image) => destroyCommunityImage(image.publicId)));
  response.status(204).end();
}));

communityRouter.post('/posts/:postId/like', route(async (request, response) => {
  const viewerId = String(request.auth!.userId);
  const post = await findAccessiblePost(String(request.params.postId), viewerId);
  try {
    await CommunityPostLike.create({ post: post._id, user: viewerId });
    await CommunityPost.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
    await notify(String(post.author._id), viewerId, 'post_like', post._id);
  } catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error; }
  const item = await CommunityPost.findById(post._id).select('likeCount').lean();
  response.json({ liked: true, likeCount: item?.likeCount ?? 0 });
}));

communityRouter.delete('/posts/:postId/like', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  const removed = await CommunityPostLike.findOneAndDelete({ post: post._id, user: request.auth!.userId });
  if (removed) {
    await CommunityPost.updateOne({ _id: post._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
    await Notification.deleteOne({ recipient: post.author._id, actor: request.auth!.userId, type: 'post_like', resourceId: post._id, readAt: null });
  }
  const item = await CommunityPost.findById(post._id).select('likeCount').lean();
  response.json({ liked: false, likeCount: item?.likeCount ?? 0 });
}));

communityRouter.post('/posts/:postId/bookmark', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  try { await CommunityPostBookmark.create({ post: post._id, user: request.auth!.userId }); await CommunityPost.updateOne({ _id: post._id }, { $inc: { bookmarkCount: 1 } }); }
  catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error; }
  response.json({ bookmarked: true });
}));

communityRouter.delete('/posts/:postId/bookmark', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  const removed = await CommunityPostBookmark.findOneAndDelete({ post: post._id, user: request.auth!.userId });
  if (removed) await CommunityPost.updateOne({ _id: post._id, bookmarkCount: { $gt: 0 } }, { $inc: { bookmarkCount: -1 } });
  response.json({ bookmarked: false });
}));

communityRouter.post('/posts/:postId/poll-vote', route(async (request, response) => {
  const viewerId = String(request.auth!.userId);
  const post = await findAccessiblePost(String(request.params.postId), viewerId);
  const optionIndex = z.number().int().min(0).max(5).parse((request.body as { optionIndex?: unknown }).optionIndex);
  if (!post.poll || optionIndex >= post.poll.options.length) throw new HttpError(400, 'That poll option is unavailable.');
  if (post.poll.expiresAt && post.poll.expiresAt <= new Date()) throw new HttpError(409, 'This poll has closed.');
  try { await CommunityPollVote.create({ post: post._id, user: viewerId, optionIndex }); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new HttpError(409, 'You have already voted in this poll.');
    throw error;
  }
  await notify(String(post.author._id), viewerId, 'poll_vote', post._id);
  const [item] = await hydratePosts([post.toObject() as unknown as Record<string, unknown>], viewerId);
  response.json({ poll: (item as { poll?: unknown } | undefined)?.poll });
}));

communityRouter.get('/posts/:postId/comments', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  const { page, limit } = pageParams(request.query as Record<string, unknown>);
  const excluded = await blockedIds(String(request.auth!.userId));
  const comments = await CommunityComment.find({ post: post._id, parentComment: null, author: { $nin: excluded } }).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit + 1).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).populate({ path: 'mentions', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean();
  const pageComments = comments.slice(0, limit);
  const present = (comment: Record<string, unknown>) => ({ ...comment, author: comment.author ?? { username: 'deleted_user', avatar: '' }, mentions: Array.isArray(comment.mentions) ? comment.mentions.filter(Boolean) : [] });
  const items = await Promise.all(pageComments.map(async (comment) => {
    const replyFilter = { post: post._id, parentComment: comment._id, author: { $nin: excluded } };
    const [replyCount, replies] = await Promise.all([
      CommunityComment.countDocuments(replyFilter),
      CommunityComment.find(replyFilter).sort({ createdAt: 1, _id: 1 }).limit(2).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).populate({ path: 'mentions', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean(),
    ]);
    return { ...present(comment as unknown as Record<string, unknown>), replyCount, replies: replies.map((reply) => present(reply as unknown as Record<string, unknown>)) };
  }));
  response.json({ items, page, hasMore: comments.length > limit });
}));

communityRouter.get('/posts/:postId/comments/:commentId/replies', route(async (request, response) => {
  const viewerId = String(request.auth!.userId);
  const post = await findAccessiblePost(String(request.params.postId), viewerId);
  const commentId = postIdSchema.parse(request.params.commentId);
  const parent = await CommunityComment.findOne({ _id: commentId, post: post._id, parentComment: null });
  if (!parent || await isBlockedEitherWay(viewerId, String(parent.author))) throw new HttpError(404, 'Comment not found.');
  const { page, limit } = pageParams(request.query as Record<string, unknown>);
  const filter = { post: post._id, parentComment: parent._id, author: { $nin: await blockedIds(viewerId) } };
  const [items, total] = await Promise.all([
    CommunityComment.find(filter).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).populate({ path: 'mentions', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean(),
    CommunityComment.countDocuments(filter),
  ]);
  const present = (comment: Record<string, unknown>) => ({ ...comment, author: comment.author ?? { username: 'deleted_user', avatar: '' }, mentions: Array.isArray(comment.mentions) ? comment.mentions.filter(Boolean) : [] });
  response.json({ items: items.map((item) => present(item as unknown as Record<string, unknown>)), page, hasMore: page * limit < total });
}));

communityRouter.post('/posts/:postId/comments', route(async (request, response) => {
  const viewerId = String(request.auth!.userId);
  const post = await findAccessiblePost(String(request.params.postId), viewerId);
  const input = commentSchema.parse(request.body);
  const mentions = [...new Set(input.mentionIds)].filter((id) => id !== viewerId);
  const mentionedUsers = mentions.length ? await User.find({ _id: { $in: mentions, $nin: await blockedIds(viewerId) }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username') : [];
  if (mentionedUsers.length !== mentions.length || mentionedUsers.some((person) => !input.content.toLowerCase().includes(`@${person.username.toLowerCase()}`))) throw new HttpError(400, 'One or more selected mentions are unavailable or missing from your comment.');
  let parent: InstanceType<typeof CommunityComment> | null = null;
  if (input.parentCommentId) {
    parent = await CommunityComment.findOne({ _id: input.parentCommentId, post: post._id, parentComment: null, deletedAt: null });
    if (!parent) throw new HttpError(400, 'Replies must belong to an available top-level comment.');
    if (await isBlockedEitherWay(viewerId, String(parent.author))) throw new HttpError(404, 'Comment not found.');
  }
  const item = await CommunityComment.create({ post: post._id, author: viewerId, parentComment: parent?._id ?? null, content: input.content, mentions });
  await CommunityPost.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  await notify(parent ? String(parent.author) : String(post.author._id), viewerId, parent ? 'comment_reply' : 'post_comment', post._id);
  for (const id of mentions) await notify(id, viewerId, 'mention', post._id);
  response.status(201).json({ item: await item.populate('author', safeUserFields).then((comment) => comment.populate('mentions', safeUserFields)) });
}));

communityRouter.patch('/comments/:commentId', route(async (request, response) => {
  const input = z.object({ content: z.string().trim().min(1).max(2000), mentionIds: z.array(z.string().refine(validId)).max(20).optional() }).parse(request.body);
  const update: Record<string, unknown> = { content: input.content, editedAt: new Date() };
  if (input.mentionIds !== undefined) {
    const mentionIds = [...new Set(input.mentionIds)].filter((id) => id !== String(request.auth!.userId));
    const people = mentionIds.length ? await User.find({ _id: { $in: mentionIds, $nin: await blockedIds(String(request.auth!.userId)) }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username') : [];
    if (people.length !== mentionIds.length || people.some((person) => !input.content.toLowerCase().includes(`@${person.username.toLowerCase()}`))) throw new HttpError(400, 'One or more selected mentions are unavailable or missing from your comment.');
    update.mentions = mentionIds;
  }
  const item = await CommunityComment.findOneAndUpdate({ _id: postIdSchema.parse(request.params.commentId), author: request.auth!.userId, deletedAt: null }, { $set: update }, { new: true, runValidators: true }).populate('author', safeUserFields);
  if (!item) throw new HttpError(404, 'Your comment could not be found.');
  response.json({ item });
}));

communityRouter.delete('/comments/:commentId', route(async (request, response) => {
  const item = await CommunityComment.findOneAndUpdate({ _id: postIdSchema.parse(request.params.commentId), author: request.auth!.userId, deletedAt: null }, { $set: { content: 'This comment was removed.', deletedAt: new Date() } });
  if (!item) throw new HttpError(404, 'Your comment could not be found.');
  await CommunityPost.updateOne({ _id: item.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  response.status(204).end();
}));

communityRouter.post('/posts/:postId/report', route(async (request, response) => {
  const post = await findAccessiblePost(String(request.params.postId), String(request.auth!.userId));
  const input = z.object({ reason: z.enum(['spam', 'harassment', 'inappropriate-content', 'unmarked-spoiler', 'other']), details: z.string().trim().max(500).default('') }).parse(request.body);
  if (String(post.author._id) === String(request.auth!.userId)) throw new HttpError(400, 'You cannot report your own discussion.');
  try { await SocialReport.create({ reporter: request.auth!.userId, reportedUser: post.author._id, postId: post._id, reason: input.reason, details: input.details }); }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new HttpError(409, 'You already reported this discussion.'); throw error; }
  response.status(201).json({ message: 'Report received.' });
}));

communityRouter.post('/comments/:commentId/report', route(async (request, response) => {
  const comment = await CommunityComment.findOne({ _id: postIdSchema.parse(request.params.commentId), deletedAt: null }).populate('author', safeUserFields);
  if (!comment) throw new HttpError(404, 'Comment not found.');
  const post = await findAccessiblePost(String(comment.post), String(request.auth!.userId));
  const input = z.object({ reason: z.enum(['spam', 'harassment', 'inappropriate-content', 'unmarked-spoiler', 'other']), details: z.string().trim().max(500).default('') }).parse(request.body);
  const commentAuthor = comment.author as unknown as { _id: mongoose.Types.ObjectId };
  if (String(commentAuthor._id) === String(request.auth!.userId)) throw new HttpError(400, 'You cannot report your own comment.');
  try { await SocialReport.create({ reporter: request.auth!.userId, reportedUser: commentAuthor._id, postId: post._id, commentId: comment._id, reason: input.reason, details: input.details }); }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new HttpError(409, 'You already reported this comment.'); throw error; }
  response.status(201).json({ message: 'Report received.' });
}));

communityRouter.get('/search', route(async (request, response) => {
  const term = z.string().trim().min(2).max(80).parse(request.query.q ?? '');
  const { page, limit } = pageParams(request.query as Record<string, unknown>);
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter: Record<string, unknown> = { deletedAt: null, author: { $nin: await blockedIds(String(request.auth!.userId)) }, $or: [{ title: { $regex: escapedTerm, $options: 'i' } }, { content: { $regex: escapedTerm, $options: 'i' } }] };
  if (request.query.category !== undefined) applyCommunityCategoryFilter(filter, communityCategorySchema.parse(request.query.category));
  const posts = await CommunityPost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate({ path: 'author', select: safeUserFields, match: { accountStatus: 'active', profileVisibility: 'public' } }).lean();
  const visiblePosts = posts.filter((post) => post.author);
  response.json({ items: await hydratePosts(visiblePosts as unknown as Array<Record<string, unknown>>, String(request.auth!.userId)), page, hasMore: visiblePosts.length === limit });
}));
