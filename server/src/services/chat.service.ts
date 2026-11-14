import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { ChatMessage, ChatReport } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import type { ChatMessagePayload } from '../realtime/chat.types.js';

const normalizedMessageText = z.string().transform((value) => value
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()).pipe(z.string().min(1, 'Write a message first.').max(1000, 'Messages are limited to 1,000 characters.'));

export const chatSendSchema = z.object({
  clientMessageId: z.string().uuid(),
  text: normalizedMessageText,
});

export const chatReportSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'hate-speech', 'other']),
  details: z.string().trim().max(500).optional().default(''),
});

type ChatMessageRecord = {
  _id: Types.ObjectId | string;
  authorId: Types.ObjectId | string;
  clientMessageId: string;
  username: string;
  avatar?: string;
  text: string;
  createdAt: Date;
  deletedAt?: Date | null;
};

export function toChatMessagePayload(message: ChatMessageRecord): ChatMessagePayload {
  return {
    id: String(message._id),
    clientMessageId: message.clientMessageId,
    authorId: String(message.authorId),
    username: message.username,
    avatar: message.avatar ?? '',
    text: message.text,
    createdAt: new Date(message.createdAt).toISOString(),
    deletedAt: message.deletedAt ? new Date(message.deletedAt).toISOString() : null,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function findChatMessageByClientId(authorId: string, clientMessageId: string): Promise<ChatMessagePayload | null> {
  const existing = await ChatMessage.findOne({ authorId, clientMessageId }).lean() as ChatMessageRecord | null;
  return existing ? toChatMessagePayload(existing) : null;
}

export async function createChatMessage(input: {
  authorId: string;
  username: string;
  avatar: string;
  clientMessageId: string;
  text: string;
}): Promise<{ message: ChatMessagePayload; duplicate: boolean }> {
  try {
    const message = await ChatMessage.create({ ...input, authorId: new Types.ObjectId(input.authorId) }) as unknown as ChatMessageRecord;
    return { message: toChatMessagePayload(message), duplicate: false };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await findChatMessageByClientId(input.authorId, input.clientMessageId);
    if (!existing) throw error;
    return { message: existing, duplicate: true };
  }
}

export async function getChatMessages(options: { before?: string; after?: string; limit?: number } = {}) {
  if (options.before && options.after) throw new HttpError(400, 'Use either the before or after cursor.');
  const cursorId = options.before || options.after;
  if (cursorId && !mongoose.isValidObjectId(cursorId)) throw new HttpError(400, 'The message cursor is invalid.');
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const ascending = Boolean(options.after);
  let filter: Record<string, unknown> = {};
  if (cursorId) {
    const cursor = await ChatMessage.findById(cursorId).select('_id createdAt').lean() as { _id: Types.ObjectId; createdAt: Date } | null;
    if (cursor) {
      const comparison = ascending ? '$gt' : '$lt';
      filter = { $or: [
        { createdAt: { [comparison]: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { [comparison]: cursor._id } },
      ] };
    } else {
      return { items: [] as ChatMessagePayload[], nextCursor: null as string | null, hasMore: false };
    }
  }
  const rows = await ChatMessage.find(filter).sort({ createdAt: ascending ? 1 : -1, _id: ascending ? 1 : -1 }).limit(limit + 1).lean() as ChatMessageRecord[];
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  if (!ascending) selected.reverse();
  const items = selected.map(toChatMessagePayload);
  const cursorRow = ascending ? selected.at(-1) : selected[0];
  return { items, nextCursor: hasMore && cursorRow ? String(cursorRow._id) : null, hasMore };
}

export async function deleteChatMessage(messageId: string, authorId: string): Promise<ChatMessagePayload | null> {
  if (!mongoose.isValidObjectId(messageId)) return null;
  const message = await ChatMessage.findOneAndUpdate(
    { _id: messageId, authorId, deletedAt: null },
    { $set: { text: '', deletedAt: new Date() } },
    { new: true },
  ).lean() as ChatMessageRecord | null;
  return message ? toChatMessagePayload(message) : null;
}

export async function reportChatMessage(input: { messageId: string; reporterId: string; reason: 'spam' | 'harassment' | 'hate-speech' | 'other'; details: string }) {
  if (!mongoose.isValidObjectId(input.messageId)) throw new HttpError(404, 'Message not found.');
  const message = await ChatMessage.findOne({ _id: input.messageId, deletedAt: null }).select('authorId').lean() as { authorId: Types.ObjectId | string } | null;
  if (!message) throw new HttpError(404, 'Message not found.');
  if (String(message.authorId) === input.reporterId) throw new HttpError(400, 'You cannot report your own message.');
  try {
    await ChatReport.create({
      messageId: new Types.ObjectId(input.messageId),
      reporterId: new Types.ObjectId(input.reporterId),
      reason: input.reason,
      details: input.details,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new HttpError(409, 'You already reported this message.');
    throw error;
  }
}

const messageWindows = new Map<string, number[]>();
let lastQuotaCleanupAt = 0;
const quotaCleanupIntervalMs = 60_000;
const maxTrackedChatUsers = 20_000;
export function consumeChatMessageQuota(userId: string, now = Date.now()): boolean {
  if (now - lastQuotaCleanupAt >= quotaCleanupIntervalMs) {
    for (const [key, timestamps] of messageWindows) {
      const active = timestamps.filter((timestamp) => now - timestamp < 60_000);
      if (active.length) messageWindows.set(key, active);
      else messageWindows.delete(key);
    }
    lastQuotaCleanupAt = now;
  }
  const recent = (messageWindows.get(userId) ?? []).filter((timestamp) => now - timestamp < 60_000);
  const lastTenSeconds = recent.filter((timestamp) => now - timestamp < 10_000);
  if (lastTenSeconds.length >= 5 || recent.length >= 20) {
    messageWindows.set(userId, recent);
    return false;
  }
  if (!messageWindows.has(userId) && messageWindows.size >= maxTrackedChatUsers) return false;
  recent.push(now);
  messageWindows.set(userId, recent);
  return true;
}

export function clearChatMessageQuotasForTests() { messageWindows.clear(); lastQuotaCleanupAt = 0; }
