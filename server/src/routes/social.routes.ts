import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { Block, CommunityRating, Conversation, DirectMessage, Follow, MediaTitle, Notification, SocialReport, TitleReview, User, UserLibraryEntry } from '../models/index.js';
import { HttpError, pageParams, route } from '../utils/http.js';
import { emitDirectMessage, emitSocialNotification } from '../realtime/social-events.js';
import { consumeChatMessageQuota } from '../services/chat.service.js';

export const socialRouter = Router();
socialRouter.use(authenticate);
const id = (value: unknown) => typeof value === 'string' && mongoose.isValidObjectId(value);
const pairKey = (a: string, b: string) => [a, b].sort().join(':');
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function feedActivityLookup(kind: 'watched' | 'review' | 'rating', from: string, perAuthorLimit: number): mongoose.PipelineStage {
  const privacyField = kind === 'rating' ? 'showRatings' : 'showActivity';
  const match: unknown[] = [
    { $eq: ['$userId', '$$author._id'] },
    { $ne: [`$$author.privacySettings.${privacyField}`, false] },
  ];
  if (kind === 'watched') match.push({ $eq: ['$status', 'completed'] });
  const sort: Record<string, 1 | -1> = kind === 'watched' ? { completedAt: -1, updatedAt: -1, _id: -1 } : { createdAt: -1, _id: -1 };
  const at = kind === 'watched' ? { $ifNull: ['$completedAt', '$updatedAt'] } : '$createdAt';
  const details = kind === 'review' ? { text: '$body' } : kind === 'rating' ? { rating: '$rating' } : {};
  const as = kind === 'watched' ? 'watched' : kind === 'review' ? 'reviews' : 'ratings';
  return { $lookup: {
    from, let: { author: '$person' }, as,
    pipeline: [
      { $match: { $expr: { $and: match } } },
      { $sort: sort },
      { $limit: perAuthorLimit },
      { $lookup: { from: MediaTitle.collection.name, localField: 'titleId', foreignField: '_id', as: 'title' } },
      { $unwind: '$title' },
      { $project: {
        _id: 0, id: { $toString: '$_id' }, type: { $literal: kind }, at,
        user: { id: { $toString: '$$author._id' }, username: '$$author.username', avatar: { $ifNull: ['$$author.avatar', ''] } },
        title: '$title', ...details,
      } },
    ],
  } };
}

async function blockedEither(a: string, b: string) {
  return Boolean(await Block.exists({ $or: [{ blocker: a, blockedUser: b }, { blocker: b, blockedUser: a }] }));
}
async function activeUser(username: string) {
  const user = await User.findOne({ username: username.toLowerCase(), accountStatus: 'active' }).select('_id username avatar bio profileVisibility privacySettings createdAt').lean();
  if (!user) throw new HttpError(404, 'Member not found.');
  return user;
}
async function conversationFor(idValue: string, userId: string) {
  if (!id(idValue)) throw new HttpError(404, 'Conversation not found.');
  const conversation = await Conversation.findById(idValue);
  if (!conversation || !conversation.participants.some((participant) => String(participant) === userId)) throw new HttpError(404, 'Conversation not found.');
  return conversation;
}
async function publicUserRows(users: Array<{ _id: unknown; username: string; avatar?: string; bio?: string }>, viewerId: string) {
  const ids = users.map((user) => String(user._id));
  const [follows, blocked, mutualRows] = await Promise.all([
    Follow.find({ follower: viewerId, following: { $in: ids } }).select('following').lean(),
    Block.find({ $or: [{ blocker: viewerId, blockedUser: { $in: ids } }, { blockedUser: viewerId, blocker: { $in: ids } }] }).select('blocker blockedUser').lean(),
    Follow.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { following: { $in: users.map((user) => new mongoose.Types.ObjectId(String(user._id))) } } },
      { $lookup: { from: Follow.collection.name, let: { candidateFollower: '$follower' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$follower', '$$candidateFollower'] }, { $eq: ['$following', new mongoose.Types.ObjectId(viewerId)] }] } } }, { $limit: 1 }], as: 'viewerFollows' } },
      { $match: { 'viewerFollows.0': { $exists: true } } },
      { $group: { _id: '$following', count: { $sum: 1 } } },
    ]),
  ]);
  const followed = new Set(follows.map((item) => String(item.following)));
  const excluded = new Set(blocked.flatMap((item) => [String(item.blocker), String(item.blockedUser)]));
  const mutualCounts = new Map(mutualRows.map((item) => [String(item._id), item.count]));
  return users.filter((item) => !excluded.has(String(item._id))).map((item) => ({ id: String(item._id), username: item.username, avatar: item.avatar ?? '', bio: item.bio ?? '', isFollowing: followed.has(String(item._id)), mutualFollowers: mutualCounts.get(String(item._id)) ?? 0 }));
}

socialRouter.get('/people', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const query = z.string().trim().max(50).parse(request.query.q ?? '');
  const random = request.query.random === 'true' && !query;
  const viewerId = String(request.auth!.userId);
  const blocked = await Block.find({ $or: [{ blocker: viewerId }, { blockedUser: viewerId }] }).select('blocker blockedUser').lean();
  const followed = random ? await Follow.find({ follower: viewerId }).select('following').lean() : [];
  const excluded = [
    ...blocked.map((edge) => String(edge.blocker) === viewerId ? String(edge.blockedUser) : String(edge.blocker)),
    ...followed.map((edge) => String(edge.following)),
  ];
  const filter: Record<string, unknown> = { _id: { $ne: viewerId, $nin: excluded }, accountStatus: 'active', profileVisibility: 'public' };
  if (query) filter.username = { $regex: `^${escaped(query)}` };
  const users = random
    ? await User.aggregate<{ _id: mongoose.Types.ObjectId; username: string; avatar?: string; bio?: string }>([
      { $match: filter }, { $sample: { size: limit } }, { $project: { _id: 1, username: 1, avatar: 1, bio: 1 } },
    ])
    : await User.find(filter).select('_id username avatar bio').sort(query ? { username: 1 } : { createdAt: -1 }).skip(skip).limit(limit).lean();
  const items = await publicUserRows(users, viewerId);
  response.json({ items, page, hasMore: !random && users.length === limit });
}));

socialRouter.get('/users/:username/mutual', route(async (request, response) => {
  const profile = await activeUser(String(request.params.username));
  if (profile.profileVisibility === 'private' && String(profile._id) !== String(request.auth!.userId)) throw new HttpError(404, 'Profile not found.');
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const viewer = new mongoose.Types.ObjectId(String(request.auth!.userId));
  const target = new mongoose.Types.ObjectId(String(profile._id));
  const rows = await Follow.aggregate<{ follower: mongoose.Types.ObjectId; username: string; avatar: string; bio: string }>([
    { $match: { following: target } },
    { $lookup: { from: Follow.collection.name, let: { candidateFollower: '$follower' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$follower', '$$candidateFollower'] }, { $eq: ['$following', viewer] }] } } }, { $limit: 1 }], as: 'viewerFollows' } },
    { $match: { 'viewerFollows.0': { $exists: true } } },
    { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit + 1 },
    { $lookup: { from: User.collection.name, localField: 'follower', foreignField: '_id', as: 'person' } },
    { $unwind: '$person' },
    { $match: { 'person.accountStatus': 'active', 'person.profileVisibility': 'public' } },
    { $project: { follower: '$person._id', username: '$person.username', avatar: '$person.avatar', bio: '$person.bio' } },
  ]);
  const blocked = await Block.find({ $or: [{ blocker: viewer }, { blockedUser: viewer }, { blocker: target }, { blockedUser: target }] }).select('blocker blockedUser').lean();
  const excluded = new Set(blocked.flatMap((edge) => [String(edge.blocker), String(edge.blockedUser)]));
  const visibleRows = rows.filter((row) => !excluded.has(String(row.follower)));
  response.json({ items: visibleRows.slice(0, limit).map((row) => ({ id: String(row.follower), username: row.username, avatar: row.avatar ?? '', bio: row.bio ?? '' })), page, hasMore: rows.length > limit });
}));

socialRouter.get('/users/:username/followers', route(async (request, response) => {
  const profile = await activeUser(String(request.params.username));
  if (profile.profileVisibility === 'private' && String(profile._id) !== String(request.auth!.userId)) throw new HttpError(404, 'Profile not found.');
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const edges = await Follow.find({ following: profile._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('follower').lean();
  const ids = edges.map((edge) => edge.follower);
  const users = await User.find({ _id: { $in: ids }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username avatar bio').lean();
  const ordered = ids.map((userId) => users.find((user) => String(user._id) === String(userId))).filter((user): user is NonNullable<typeof user> => Boolean(user));
  response.json({ items: await publicUserRows(ordered, String(request.auth!.userId)), page, hasMore: edges.length === limit });
}));
socialRouter.get('/users/:username/following', route(async (request, response) => {
  const profile = await activeUser(String(request.params.username));
  if (profile.profileVisibility === 'private' && String(profile._id) !== String(request.auth!.userId)) throw new HttpError(404, 'Profile not found.');
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const edges = await Follow.find({ follower: profile._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('following').lean();
  const ids = edges.map((edge) => edge.following);
  const users = await User.find({ _id: { $in: ids }, accountStatus: 'active', profileVisibility: 'public' }).select('_id username avatar bio').lean();
  const ordered = ids.map((userId) => users.find((user) => String(user._id) === String(userId))).filter((user): user is NonNullable<typeof user> => Boolean(user));
  response.json({ items: await publicUserRows(ordered, String(request.auth!.userId)), page, hasMore: edges.length === limit });
}));

socialRouter.post('/users/:username/follow', route(async (request, response) => {
  const viewer = String(request.auth!.userId);
  const target = await activeUser(String(request.params.username));
  const targetId = String(target._id);
  if (viewer === targetId) throw new HttpError(400, 'You cannot follow yourself.');
  if (target.profileVisibility === 'private') throw new HttpError(403, 'This profile is private.');
  if (await blockedEither(viewer, targetId)) throw new HttpError(403, 'This member is unavailable.');
  await Follow.updateOne({ follower: viewer, following: targetId }, { $setOnInsert: { follower: viewer, following: targetId } }, { upsert: true });
  const followNotice = await Notification.updateOne({ recipient: targetId, actor: viewer, type: 'follow', resourceId: request.auth!.userId }, { $setOnInsert: { recipient: targetId, actor: viewer, type: 'follow', resourceId: request.auth!.userId } }, { upsert: true });
  if (followNotice.upsertedCount) emitSocialNotification(targetId, { type: 'follow' });
  response.json({ following: true });
}));
socialRouter.delete('/users/:username/follow', route(async (request, response) => {
  const target = await activeUser(String(request.params.username));
  await Follow.deleteOne({ follower: request.auth!.userId, following: target._id });
  response.json({ following: false });
}));

socialRouter.get('/users/:username/status', route(async (request, response) => {
  const viewer = String(request.auth!.userId);
  const target = await activeUser(String(request.params.username));
  const targetId = String(target._id);
  const [following, followerCount, followingCount, blocked, mutual] = await Promise.all([
    Follow.exists({ follower: viewer, following: targetId }),
    Follow.countDocuments({ following: targetId }), Follow.countDocuments({ follower: targetId }),
    blockedEither(viewer, targetId),
    Follow.exists({ follower: targetId, following: viewer }),
  ]);
  response.json({ following: Boolean(following), followsYou: Boolean(mutual), followerCount, followingCount, blocked });
}));

socialRouter.post('/users/:username/block', route(async (request, response) => {
  const target = await activeUser(String(request.params.username));
  if (String(target._id) === String(request.auth!.userId)) throw new HttpError(400, 'You cannot block yourself.');
  await Block.updateOne({ blocker: request.auth!.userId, blockedUser: target._id }, { $setOnInsert: { blocker: request.auth!.userId, blockedUser: target._id } }, { upsert: true });
  await Promise.all([
    Follow.deleteMany({ $or: [{ follower: request.auth!.userId, following: target._id }, { follower: target._id, following: request.auth!.userId }] }),
    Conversation.updateMany({ participants: { $all: [request.auth!.userId, target._id] } }, { $set: { status: 'declined' } }),
  ]);
  response.json({ blocked: true });
}));
socialRouter.delete('/users/:username/block', route(async (request, response) => {
  const target = await activeUser(String(request.params.username));
  await Block.deleteOne({ blocker: request.auth!.userId, blockedUser: target._id });
  response.json({ blocked: false });
}));
socialRouter.get('/blocks', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const edges = await Block.find({ blocker: request.auth!.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('blockedUser', 'username avatar bio').lean();
  response.json({ items: edges.map((edge) => edge.blockedUser).filter(Boolean), page, hasMore: edges.length === limit });
}));

socialRouter.get('/feed', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const viewer = new mongoose.Types.ObjectId(String(request.auth!.userId));
  const perAuthorLimit = skip + limit + 1;
  const items = await Follow.aggregate<Record<string, unknown>>([
    { $match: { follower: viewer } },
    { $lookup: {
      from: Block.collection.name, let: { target: '$following' }, as: 'blocks',
      pipeline: [
        { $match: { $expr: { $or: [
          { $and: [{ $eq: ['$blocker', viewer] }, { $eq: ['$blockedUser', '$$target'] }] },
          { $and: [{ $eq: ['$blockedUser', viewer] }, { $eq: ['$blocker', '$$target'] }] },
        ] } } },
        { $limit: 1 },
      ],
    } },
    { $match: { 'blocks.0': { $exists: false } } },
    { $lookup: { from: User.collection.name, localField: 'following', foreignField: '_id', as: 'person' } },
    { $unwind: '$person' },
    { $match: { 'person.accountStatus': 'active', 'person.profileVisibility': 'public' } },
    feedActivityLookup('watched', UserLibraryEntry.collection.name, perAuthorLimit),
    feedActivityLookup('review', TitleReview.collection.name, perAuthorLimit),
    feedActivityLookup('rating', CommunityRating.collection.name, perAuthorLimit),
    { $project: { activities: { $concatArrays: ['$watched', '$reviews', '$ratings'] } } },
    { $unwind: '$activities' },
    { $replaceRoot: { newRoot: '$activities' } },
    { $sort: { at: -1, id: -1 } },
    { $skip: skip },
    { $limit: limit + 1 },
  ]).exec();
  response.json({ items: items.slice(0, limit), page, hasMore: items.length > limit });
}));

socialRouter.get('/notifications', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const unreadOnly = request.query.unread === 'true';
  const filter = { recipient: request.auth!.userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'username avatar').lean(),
    Notification.countDocuments({ recipient: request.auth!.userId, readAt: null }),
  ]);
  const visibleItems = items.filter((item) => item.actor?._id);
  const actorIds = visibleItems.filter((item) => item.type === 'follow').map((item) => item.actor?._id).filter(Boolean);
  const following = await Follow.find({ follower: request.auth!.userId, following: { $in: actorIds } }).select('following').lean();
  const followingIds = new Set(following.map((edge) => String(edge.following)));
  response.json({ items: visibleItems.map((item) => ({ ...item, isFollowing: followingIds.has(String(item.actor._id)) })), unreadCount, page, hasMore: items.length === limit });
}));
socialRouter.patch('/notifications/read-all', route(async (request, response) => {
  await Notification.updateMany({ recipient: request.auth!.userId, readAt: null }, { $set: { readAt: new Date() } });
  response.status(204).end();
}));
socialRouter.patch('/notifications/:id/read', route(async (request, response) => {
  if (!id(request.params.id)) throw new HttpError(404, 'Notification not found.');
  await Notification.updateOne({ _id: request.params.id, recipient: request.auth!.userId }, { $set: { readAt: new Date() } });
  response.status(204).end();
}));

socialRouter.get('/conversations', route(async (request, response) => {
  const { page, limit, skip } = pageParams(request.query as Record<string, unknown>);
  const filter: Record<string, unknown> = { participants: request.auth!.userId };
  if (request.query.requests === 'true') { filter.status = 'pending'; filter.requestedBy = { $ne: request.auth!.userId }; }
  else filter.status = { $in: ['accepted', 'pending'] };
  const conversations = await Conversation.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).skip(skip).limit(limit).populate('participants', 'username avatar bio').populate('lastMessage').lean();
  const items = conversations.map((item) => {
    const other = (item.participants as unknown as Array<{ _id: unknown; username: string; avatar: string; bio: string }>).find((person) => String(person._id) !== String(request.auth!.userId));
    const state = item.participantState.find((participant) => String(participant.userId) === String(request.auth!.userId));
    const message = item.lastMessage as { content?: string; senderId?: unknown } | null;
    return { id: String(item._id), status: item.status, requestedBy: item.requestedBy, participant: other, lastMessage: message ? { content: message.content, senderId: message.senderId } : null, lastMessageAt: item.lastMessageAt, unread: Boolean(message && message.senderId && String(message.senderId) !== String(request.auth!.userId) && (!state?.lastReadAt || new Date(item.lastMessageAt ?? 0) > new Date(state.lastReadAt))) };
  });
  response.json({ items, page, hasMore: conversations.length === limit });
}));

socialRouter.get('/conversations/:conversationId', route(async (request, response) => {
  const conversation = await conversationFor(String(request.params.conversationId), String(request.auth!.userId));
  const otherId = String(conversation.participants.find((participant) => String(participant) !== String(request.auth!.userId)));
  if (await blockedEither(String(request.auth!.userId), otherId)) throw new HttpError(404, 'Conversation not found.');
  const item = await Conversation.findById(conversation._id).populate('participants', 'username avatar bio').populate('lastMessage').lean();
  if (!item) throw new HttpError(404, 'Conversation not found.');
  const people = item.participants as unknown as Array<{ _id: unknown; username: string; avatar: string; bio: string }>;
  const participant = people.find((person) => String(person._id) !== String(request.auth!.userId));
  const state = item.participantState.find((entry) => String(entry.userId) === String(request.auth!.userId));
  const message = item.lastMessage as { content?: string; senderId?: unknown } | null;
  response.json({
    id: String(item._id), status: item.status, requestedBy: item.requestedBy ? String(item.requestedBy) : null,
    participant: participant ? { id: String(participant._id), username: participant.username, avatar: participant.avatar, bio: participant.bio } : null,
    lastMessage: message ? { content: message.content ?? '', senderId: message.senderId ? String(message.senderId) : '' } : null,
    lastMessageAt: item.lastMessageAt,
    unread: Boolean(message && message.senderId && String(message.senderId) !== String(request.auth!.userId) && (!state?.lastReadAt || new Date(item.lastMessageAt ?? 0) > new Date(state.lastReadAt))),
  });
}));

socialRouter.post('/conversations/:username', route(async (request, response) => {
  const viewer = String(request.auth!.userId);
  const target = await activeUser(String(request.params.username));
  const targetId = String(target._id);
  if (viewer === targetId) throw new HttpError(400, 'You cannot message yourself.');
  if (target.profileVisibility === 'private' || await blockedEither(viewer, targetId)) throw new HttpError(403, 'This member is unavailable.');
  const [forward, backward, existing] = await Promise.all([
    Follow.exists({ follower: viewer, following: targetId }), Follow.exists({ follower: targetId, following: viewer }),
    Conversation.findOne({ pairKey: pairKey(viewer, targetId) }),
  ]);
  if (existing) {
    if (existing.status === 'declined') throw new HttpError(403, 'This conversation is unavailable.');
    return response.json({ conversation: existing, created: false });
  }
  const mutual = Boolean(forward && backward);
  if (!mutual && target.privacySettings?.allowMessageRequests === false) throw new HttpError(403, 'This member is not accepting message requests.');
  let conversation;
  try {
    conversation = await Conversation.create({ participants: [viewer, targetId], pairKey: pairKey(viewer, targetId), status: mutual ? 'accepted' : 'pending', requestedBy: mutual ? null : viewer, participantState: [{ userId: viewer, lastReadAt: new Date() }, { userId: targetId, lastReadAt: null }] });
  } catch (cause) {
    if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 11000)) throw cause;
    conversation = await Conversation.findOne({ pairKey: pairKey(viewer, targetId) });
    if (!conversation) throw cause;
    if (conversation.status === 'declined') throw new HttpError(403, 'This conversation is unavailable.');
    return response.json({ conversation, created: false });
  }
  if (!mutual) {
    const requestNotice = await Notification.updateOne({ recipient: targetId, actor: viewer, type: 'message_request', resourceId: conversation._id }, { $setOnInsert: { recipient: targetId, actor: viewer, type: 'message_request', resourceId: conversation._id } }, { upsert: true });
    if (requestNotice.upsertedCount) emitSocialNotification(targetId, { type: 'message_request', resourceId: String(conversation._id) });
  }
  response.status(201).json({ conversation, created: true });
}));

socialRouter.get('/conversations/:conversationId/messages', route(async (request, response) => {
  const conversation = await conversationFor(String(request.params.conversationId), String(request.auth!.userId));
  if (conversation.status === 'declined') throw new HttpError(403, 'This conversation is unavailable.');
  const { limit } = pageParams(request.query as Record<string, unknown>);
  const before = request.query.before;
  const filter: Record<string, unknown> = { conversationId: conversation._id };
  if (id(before)) {
    const cursor = await DirectMessage.findOne({ _id: before, conversationId: conversation._id }).select('_id createdAt').lean();
    if (!cursor) throw new HttpError(400, 'Message cursor is not part of this conversation.');
    filter.$or = [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }];
  }
  const items = await DirectMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).populate('senderId', 'username avatar').lean();
  response.json({ items: items.reverse(), hasMore: items.length === limit });
}));
socialRouter.post('/conversations/:conversationId/messages', route(async (request, response) => {
  const conversation = await conversationFor(String(request.params.conversationId), String(request.auth!.userId));
  if (conversation.status === 'declined') throw new HttpError(403, 'This conversation is unavailable.');
  const content = z.string().trim().min(1).max(2000).parse(request.body?.content);
  const clientMessageId = z.string().uuid().parse(request.body?.clientMessageId);
  const existing = await DirectMessage.findOne({ senderId: request.auth!.userId, clientMessageId });
  if (existing) {
    if (String(existing.conversationId) !== String(conversation._id)) throw new HttpError(409, 'Message identifier already used.');
    return response.json({ message: existing });
  }
  const canStartRequest = conversation.status === 'pending' && String(conversation.requestedBy) === String(request.auth!.userId) && !conversation.lastMessage;
  if (conversation.status !== 'accepted' && !canStartRequest) throw new HttpError(403, 'This message request has not been accepted.');
  const targetId = String(conversation.participants.find((person) => String(person) !== String(request.auth!.userId)));
  if (await blockedEither(String(request.auth!.userId), targetId)) throw new HttpError(403, 'This conversation is unavailable.');
  if (!consumeChatMessageQuota(String(request.auth!.userId))) throw new HttpError(429, 'You are sending messages too quickly. Wait a few seconds and try again.');
  let message;
  try { message = await DirectMessage.create({ conversationId: conversation._id, senderId: request.auth!.userId, content, clientMessageId }); }
  catch (cause) {
    if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 11000)) throw cause;
    const duplicate = await DirectMessage.findOne({ senderId: request.auth!.userId, clientMessageId });
    if (!duplicate || String(duplicate.conversationId) !== String(conversation._id)) throw cause;
    return response.json({ message: duplicate });
  }
  conversation.lastMessage = message._id;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();
  emitDirectMessage(String(conversation._id), conversation.participants.map(String), {
    _id: String(message._id), conversationId: String(conversation._id), senderId: String(request.auth!.userId),
    content, clientMessageId, createdAt: message.createdAt.toISOString(),
  });
  response.status(201).json({ message });
}));
for (const action of ['accept', 'decline'] as const) socialRouter.patch(`/conversations/:conversationId/${action}`, route(async (request, response) => {
  const conversation = await conversationFor(String(request.params.conversationId), String(request.auth!.userId));
  if (conversation.status !== 'pending' || String(conversation.requestedBy) === String(request.auth!.userId)) throw new HttpError(409, 'This request can no longer be changed.');
  conversation.status = action === 'accept' ? 'accepted' : 'declined';
  await Notification.updateOne({ recipient: request.auth!.userId, resourceId: conversation._id, type: 'message_request' }, { $set: { readAt: new Date() } });
  if (action === 'accept') {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { 'participantState.$[state].lastReadAt': new Date() } }, { arrayFilters: [{ 'state.userId': request.auth!.userId }] });
  }
  await conversation.save();
  if (action === 'accept') {
    const acceptedNotice = await Notification.updateOne({ recipient: conversation.requestedBy, actor: request.auth!.userId, type: 'request_accepted', resourceId: conversation._id }, { $setOnInsert: { recipient: conversation.requestedBy, actor: request.auth!.userId, type: 'request_accepted', resourceId: conversation._id } }, { upsert: true });
    if (acceptedNotice.upsertedCount) emitSocialNotification(String(conversation.requestedBy), { type: 'request_accepted', resourceId: String(conversation._id) });
  }
  response.json({ status: conversation.status });
}));
socialRouter.patch('/conversations/:conversationId/read', route(async (request, response) => {
  const conversation = await conversationFor(String(request.params.conversationId), String(request.auth!.userId));
  if (conversation.status !== 'accepted') throw new HttpError(403, 'This request is not accepted.');
  await Conversation.updateOne({ _id: conversation._id }, { $set: { 'participantState.$[state].lastReadAt': new Date() } }, { arrayFilters: [{ 'state.userId': request.auth!.userId }] });
  response.status(204).end();
}));

socialRouter.post('/reports', route(async (request, response) => {
  const input = z.object({ username: z.string().min(3).max(24), messageId: z.string().refine(mongoose.isValidObjectId).optional(), reason: z.enum(['spam', 'harassment', 'hate-speech', 'other']), details: z.string().trim().max(500).default('') }).parse(request.body);
  const target = await activeUser(input.username);
  if (String(target._id) === String(request.auth!.userId)) throw new HttpError(400, 'You cannot report yourself.');
  if (input.messageId) {
    const message = await DirectMessage.findById(input.messageId).select('senderId conversationId').lean();
    if (!message || String(message.senderId) !== String(target._id)) throw new HttpError(404, 'Message not found.');
    await conversationFor(String(message.conversationId), String(request.auth!.userId));
  }
  await SocialReport.create({ reporter: request.auth!.userId, reportedUser: target._id, messageId: input.messageId, reason: input.reason, details: input.details });
  response.status(201).json({ message: 'Report received.' });
}));
