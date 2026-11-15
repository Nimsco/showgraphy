import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, authenticateOptional } from '../middleware/authenticate.js';
import { Block, CommunityComment, CommunityPollVote, CommunityPost, CommunityPostBookmark, CommunityPostLike, CommunityRating, CommunityUploadReservation, Conversation, DirectMessage, EmailActionToken, Follow, ListShare, MediaTitle, Notification, RefreshSession, SocialReport, TitleReview, User, UserLibraryEntry, UserList } from '../models/index.js';
import { destroyCommunityImage } from '../services/community-media.service.js';
import { clearRefreshCookie, safeUser } from '../services/auth.service.js';
import { getUserStatistics } from '../services/statistics.service.js';
import { HttpError, route } from '../utils/http.js';

export const usersRouter = Router();

const usernameSchema = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/, 'Use 3-24 letters, numbers, or underscores.');

usersRouter.get('/username-availability', authenticate, route(async (request, response) => {
  const username = usernameSchema.parse(request.query.username);
  const currentUser = await User.findById(request.auth!.userId).select('usernameSetupRequired');
  if (!currentUser) throw new HttpError(404, 'Account not found.');
  const taken = await User.exists({ username, _id: { $ne: request.auth!.userId } });
  response.json({ available: !taken, username });
}));

usersRouter.patch('/me/username', authenticate, route(async (request, response) => {
  const username = usernameSchema.parse(request.body?.username);
  const user = await User.findById(request.auth!.userId);
  if (!user) throw new HttpError(404, 'Account not found.');
  if (!user.usernameSetupRequired) throw new HttpError(409, 'Your username has already been set.');
  if (await User.exists({ username, _id: { $ne: user._id } })) throw new HttpError(409, 'That username is already taken. Try another.');
  user.username = username;
  user.usernameSetupRequired = false;
  try { await user.save(); }
  catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 11000) throw new HttpError(409, 'That username was just claimed. Try another.');
    throw cause;
  }
  response.json({ user: safeUser(user) });
}));

usersRouter.patch('/me', authenticate, route(async (request, response) => {
  const input = z.object({
    bio: z.string().trim().max(280).optional(),
    avatar: z.url().or(z.literal('')).optional(),
    profileVisibility: z.enum(['public', 'private']).optional(),
    themePreference: z.enum(['dark', 'light', 'ocean', 'forest', 'rose', 'sunset', 'ocean-light', 'sage-light', 'rose-light', 'sunset-light', 'system']).optional(),
    privacySettings: z.object({ showStats: z.boolean().optional(), showLists: z.boolean().optional(), showRatings: z.boolean().optional(), showActivity: z.boolean().optional(), showFavorites: z.boolean().optional(), allowMessageRequests: z.boolean().optional() }).optional(),
    favoriteTitleIds: z.array(z.string().refine(mongoose.isValidObjectId)).max(10).optional(),
  }).parse(request.body);
  const user = await User.findById(request.auth!.userId);
  if (!user) throw new HttpError(404, 'Account not found.');
  if (input.bio !== undefined) user.bio = input.bio;
  if (input.avatar !== undefined) user.avatar = input.avatar;
  if (input.profileVisibility) user.profileVisibility = input.profileVisibility;
  if (input.themePreference) user.themePreference = input.themePreference;
  if (input.privacySettings) user.privacySettings = { ...user.privacySettings, ...input.privacySettings };
  if (input.favoriteTitleIds) {
    const ids = input.favoriteTitleIds.map((id) => new mongoose.Types.ObjectId(id));
    if ((await MediaTitle.countDocuments({ _id: { $in: ids } })) !== new Set(ids.map(String)).size) throw new HttpError(404, 'One or more titles were not found.');
    user.favoriteTitleIds = ids;
  }
  await user.save();
  response.json({ user: {
    id: String(user._id), username: user.username, usernameSetupRequired: user.usernameSetupRequired, email: user.email,
    emailVerified: user.emailVerified,
    avatar: user.avatar, bio: user.bio, profileVisibility: user.profileVisibility,
    privacySettings: user.privacySettings, themePreference: user.themePreference, createdAt: user.createdAt,
    favoriteTitleIds: (user.favoriteTitleIds ?? []).map(String),
  } });
}));

usersRouter.get('/profiles/:username', authenticateOptional, route(async (request, response) => {
  const username = String(request.params.username).toLowerCase();
  const user = await User.findOne({ username }).select('username avatar bio profileVisibility privacySettings favoriteTitleIds createdAt').lean();
  if (!user || (user.profileVisibility === 'private' && (!request.auth?.userId || String(request.auth.userId) !== String(user._id)))) throw new HttpError(404, 'Profile not found.');
  if (request.auth?.userId && String(request.auth.userId) !== String(user._id) && await Block.exists({ $or: [{ blocker: request.auth.userId, blockedUser: user._id }, { blocker: user._id, blockedUser: request.auth.userId }] })) throw new HttpError(404, 'Profile not found.');
  const [followerCount, followingCount, followsYou, isFollowing] = await Promise.all([
    Follow.countDocuments({ following: user._id }), Follow.countDocuments({ follower: user._id }),
    request.auth?.userId ? Follow.exists({ follower: user._id, following: request.auth.userId }) : Promise.resolve(false),
    request.auth?.userId ? Follow.exists({ follower: request.auth.userId, following: user._id }) : Promise.resolve(false),
  ]);
  const result: Record<string, unknown> = {
    profile: { username: user.username, avatar: user.avatar, bio: user.bio, createdAt: user.createdAt, followerCount, followingCount, followsYou: Boolean(followsYou), isFollowing: Boolean(isFollowing), isOwn: Boolean(request.auth?.userId && String(request.auth.userId) === String(user._id)) },
  };
  if (user.privacySettings?.showFavorites !== false) {
    const titles = await MediaTitle.find({ _id: { $in: user.favoriteTitleIds ?? [] } }).select('title poster backdrop mediaType releaseDate').lean();
    const orderedTitles = new Map(titles.map((title) => [String(title._id), title]));
    result.favorites = (user.favoriteTitleIds ?? []).map((id) => orderedTitles.get(String(id))).filter(Boolean);
  }
  if (user.privacySettings?.showStats !== false) result.stats = await getUserStatistics(user._id);
  if (user.privacySettings?.showLists !== false) {
    result.lists = await UserList.find({ userId: user._id, visibility: 'public' }).select('name slug description orderedItems updatedAt').populate('orderedItems.titleId', 'title poster mediaType releaseDate').lean();
  }
  if (user.privacySettings?.showActivity !== false) {
    result.recent = await UserLibraryEntry.find({ userId: user._id, status: 'completed' }).sort({ completedAt: -1 }).limit(8).select('status completedAt createdAt').populate('titleId', 'title poster mediaType releaseDate').lean();
  }
  if (user.privacySettings?.showRatings !== false) {
    result.ratings = await CommunityRating.find({ userId: user._id }).sort({ updatedAt: -1 }).limit(12).select('rating updatedAt').populate('titleId', 'title poster mediaType releaseDate').lean();
  }
  if (user.privacySettings?.showActivity !== false) {
    result.reviews = await TitleReview.find({ userId: user._id }).sort({ createdAt: -1 }).limit(8).select('body createdAt').populate('titleId', 'title poster mediaType releaseDate').lean();
  }
  response.json(result);
}));

usersRouter.delete('/me', authenticate, route(async (request, response) => {
  const userId = request.auth!.userId;
  const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
  const conversationIds = conversations.map((conversation) => conversation._id);
  const communityPosts = await CommunityPost.find({ author: userId }).select('_id images').lean();
  const pendingCommunityUploads = await CommunityUploadReservation.find({ owner: userId }).select('publicId').lean();
  const communityPostIds = communityPosts.map((post) => post._id);
  const commentsToRemove = await CommunityComment.find({ post: { $in: communityPostIds } }).select('_id').lean();
  const ownCommentCounts = await CommunityComment.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { author: new mongoose.Types.ObjectId(userId), deletedAt: null, post: { $nin: communityPostIds } } },
    { $group: { _id: '$post', count: { $sum: 1 } } },
  ]);
  const removedCommentIds = [...commentsToRemove.map((comment) => comment._id), ...(await CommunityComment.find({ author: userId }).select('_id').lean()).map((comment) => comment._id)];
  const ratings = await CommunityRating.find({ userId }).select('titleId').lean();
  const affected = [...new Set(ratings.map((rating) => String(rating.titleId)))];
  await Promise.all([
    ListShare.deleteMany({ ownerId: userId }),
    UserList.deleteMany({ userId }),
    UserLibraryEntry.deleteMany({ userId }),
    CommunityRating.deleteMany({ userId }),
    TitleReview.deleteMany({ userId }),
    CommunityPost.deleteMany({ author: userId }),
    CommunityUploadReservation.deleteMany({ owner: userId }),
    CommunityComment.deleteMany({ post: { $in: communityPostIds } }),
    CommunityComment.updateMany({ author: userId, post: { $nin: communityPostIds }, deletedAt: null }, { $set: { content: 'This comment was removed.', mentions: [], deletedAt: new Date() } }),
    CommunityPostLike.deleteMany({ $or: [{ post: { $in: communityPostIds } }, { user: userId }] }),
    CommunityPostBookmark.deleteMany({ $or: [{ post: { $in: communityPostIds } }, { user: userId }] }),
    CommunityPollVote.deleteMany({ $or: [{ post: { $in: communityPostIds } }, { user: userId }] }),
    EmailActionToken.deleteMany({ userId }),
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    Block.deleteMany({ $or: [{ blocker: userId }, { blockedUser: userId }] }),
    Notification.deleteMany({ $or: [{ recipient: userId }, { actor: userId }] }),
    SocialReport.deleteMany({ $or: [{ reporter: userId }, { reportedUser: userId }] }),
    Notification.deleteMany({ resourceId: { $in: [...communityPostIds, ...removedCommentIds] } }),
    Conversation.deleteMany({ participants: userId }),
    DirectMessage.deleteMany({ senderId: userId }),
    DirectMessage.deleteMany({ conversationId: { $in: conversationIds } }),
    RefreshSession.deleteMany({ userId }),
    User.deleteOne({ _id: userId }),
  ]);
  await Promise.all(ownCommentCounts.map((entry) => CommunityPost.updateOne({ _id: entry._id, commentCount: { $gte: entry.count } }, { $inc: { commentCount: -entry.count } })));
  await Promise.allSettled(communityPosts.flatMap((post) => post.images.map((image) => destroyCommunityImage(image.publicId))));
  await Promise.allSettled(pendingCommunityUploads.map((upload) => destroyCommunityImage(upload.publicId)));
  await Promise.all(affected.map(async (id) => {
    const titleId = new mongoose.Types.ObjectId(id);
    const rows = await CommunityRating.aggregate<{ average: number; count: number }>([{ $match: { titleId } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
    const row = rows[0] ?? { average: 0, count: 0 };
    await MediaTitle.updateOne({ _id: titleId }, { $set: { communityRating: row.count ? Math.round(row.average * 100) / 100 : 0, communityRatingCount: row.count } });
  }));
  clearRefreshCookie(response);
  response.status(204).end();
}));
