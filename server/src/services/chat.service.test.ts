import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  reportCreate: vi.fn(),
}));

vi.mock('../models/index.js', () => ({
  ChatMessage: {
    create: mocks.create,
    findOne: mocks.findOne,
    findById: mocks.findById,
    find: mocks.find,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
  ChatReport: { create: mocks.reportCreate },
}));

type StoredMessage = {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  clientMessageId: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: Date;
  deletedAt: Date | null;
};

const authorId = new Types.ObjectId('507f1f77bcf86cd799439011');
let stored: StoredMessage[];

function query(value: unknown) {
  return {
    select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(value) })),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function sortedQuery(filter: Record<string, unknown>) {
  let direction = -1;
  let limit = 51;
  type QueryChain = {
    sort: (sort: { createdAt: 1 | -1; _id: 1 | -1 }) => QueryChain;
    limit: (value: number) => QueryChain;
    lean: () => Promise<StoredMessage[]>;
  };
  const chain = {} as QueryChain;
  chain.sort = vi.fn((sort) => { direction = sort.createdAt; return chain; });
  chain.limit = vi.fn((value) => { limit = value; return chain; });
  chain.lean = vi.fn(async () => {
      const alternatives = filter.$or as Array<Record<string, unknown>> | undefined;
      const first = alternatives?.[0];
      const second = alternatives?.[1];
      const timeComparison = first?.createdAt as { $lt?: Date; $gt?: Date } | undefined;
      const cursorDate = timeComparison?.$lt ?? timeComparison?.$gt ?? second?.createdAt as Date | undefined;
      const idComparison = second?._id as { $lt?: Types.ObjectId; $gt?: Types.ObjectId } | undefined;
      let rows = [...stored];
      if (cursorDate) {
        rows = rows.filter((row) => {
          if (timeComparison?.$lt && row.createdAt < timeComparison.$lt) return true;
          if (timeComparison?.$gt && row.createdAt > timeComparison.$gt) return true;
          if (idComparison?.$lt && row.createdAt.getTime() === cursorDate.getTime()) return String(row._id) < String(idComparison.$lt);
          if (idComparison?.$gt && row.createdAt.getTime() === cursorDate.getTime()) return String(row._id) > String(idComparison.$gt);
          return false;
        });
      }
      rows.sort((left, right) => direction * (left.createdAt.getTime() - right.createdAt.getTime() || String(left._id).localeCompare(String(right._id))));
      return rows.slice(0, limit);
    });
  return chain;
}

beforeEach(() => {
  stored = [];
  vi.clearAllMocks();
  mocks.findOne.mockImplementation((filter: { authorId: string | Types.ObjectId; clientMessageId?: string; _id?: string; deletedAt?: null }) => {
    const item = stored.find((row) => (!filter.authorId || String(row.authorId) === String(filter.authorId))
      && (!filter.clientMessageId || row.clientMessageId === filter.clientMessageId)
      && (!filter._id || String(row._id) === String(filter._id))
      && (filter.deletedAt !== null || !row.deletedAt));
    return query(item ?? null);
  });
  mocks.findById.mockImplementation((id: string) => query(stored.find((row) => String(row._id) === String(id)) ?? null));
  mocks.find.mockImplementation((filter: Record<string, unknown>) => sortedQuery(filter));
  mocks.create.mockImplementation(async (input: Omit<StoredMessage, '_id' | 'createdAt' | 'deletedAt'>) => {
    if (stored.some((row) => String(row.authorId) === String(input.authorId) && row.clientMessageId === input.clientMessageId)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const item: StoredMessage = { ...input, authorId: new Types.ObjectId(String(input.authorId)), _id: new Types.ObjectId(), createdAt: new Date(Date.now() + stored.length * 1000), deletedAt: null };
    stored.push(item);
    return item;
  });
  mocks.findOneAndUpdate.mockImplementation((filter: { _id: string; authorId: string; deletedAt: null }, update: { $set: { text: string; deletedAt: Date } }) => {
    const item = stored.find((row) => String(row._id) === filter._id && String(row.authorId) === filter.authorId && !row.deletedAt);
    if (item) {
      item.text = update.$set.text;
      item.deletedAt = update.$set.deletedAt;
    }
    return query(item ?? null);
  });
  mocks.reportCreate.mockResolvedValue({});
});

describe('global chat service', () => {
  it('normalizes plain text, trims it, and rejects empty or oversized messages', async () => {
    const { chatSendSchema } = await import('./chat.service.js');
    expect(chatSendSchema.parse({ clientMessageId: crypto.randomUUID(), text: '  hello\r\nworld\u0000 ' }).text).toBe('hello\nworld');
    expect(chatSendSchema.safeParse({ clientMessageId: crypto.randomUUID(), text: '   ' }).success).toBe(false);
    expect(chatSendSchema.safeParse({ clientMessageId: crypto.randomUUID(), text: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('persists messages and returns an existing message for a duplicate client id', async () => {
    const { createChatMessage } = await import('./chat.service.js');
    const input = { authorId: String(authorId), username: 'viewer', avatar: '', clientMessageId: crypto.randomUUID(), text: 'A message' };
    const first = await createChatMessage(input);
    const duplicate = await createChatMessage(input);
    expect(stored).toHaveLength(1);
    expect(first.message.id).toBe(duplicate.message.id);
    expect(duplicate.duplicate).toBe(true);
  });

  it('returns history chronologically and provides an older-page cursor', async () => {
    const { createChatMessage, getChatMessages } = await import('./chat.service.js');
    for (const text of ['older', 'middle', 'newer']) {
      await createChatMessage({ authorId: String(authorId), username: 'viewer', avatar: '', clientMessageId: crypto.randomUUID(), text });
    }
    const latest = await getChatMessages({ limit: 2 });
    expect(latest.items.map((item) => item.text)).toEqual(['middle', 'newer']);
    expect(latest.hasMore).toBe(true);
    const older = await getChatMessages({ before: latest.nextCursor!, limit: 2 });
    expect(older.items.map((item) => item.text)).toEqual(['older']);
    expect(older.hasMore).toBe(false);
  });

  it('supports forward pagination to synchronize missed messages after reconnect', async () => {
    const { createChatMessage, getChatMessages } = await import('./chat.service.js');
    for (const text of ['first', 'second', 'third']) {
      await createChatMessage({ authorId: String(authorId), username: 'viewer', avatar: '', clientMessageId: crypto.randomUUID(), text });
    }
    const after = await getChatMessages({ after: String(stored[0]!._id), limit: 1 });
    expect(after.items.map((item) => item.text)).toEqual(['second']);
    expect(after.hasMore).toBe(true);
  });

  it('limits message bursts per user across the process', async () => {
    const { clearChatMessageQuotasForTests, consumeChatMessageQuota } = await import('./chat.service.js');
    clearChatMessageQuotasForTests();
    for (let i = 0; i < 5; i += 1) expect(consumeChatMessageQuota('viewer', 1000 + i)).toBe(true);
    expect(consumeChatMessageQuota('viewer', 1005)).toBe(false);
    expect(consumeChatMessageQuota('viewer', 11_001)).toBe(true);
  });

  it('soft-deletes only the message owner’s message', async () => {
    const { createChatMessage, deleteChatMessage } = await import('./chat.service.js');
    const { message } = await createChatMessage({ authorId: String(authorId), username: 'viewer', avatar: '', clientMessageId: crypto.randomUUID(), text: 'delete me' });
    expect(await deleteChatMessage(message.id, '507f1f77bcf86cd799439012')).toBeNull();
    expect(stored[0]?.text).toBe('delete me');
    const deleted = await deleteChatMessage(message.id, String(authorId));
    expect(deleted).toMatchObject({ id: message.id, text: '', deletedAt: expect.any(String) });
  });

  it('stores a report for another user’s active message and prevents self-reports', async () => {
    const { createChatMessage, reportChatMessage } = await import('./chat.service.js');
    const { HttpError } = await import('../utils/http.js');
    const { message } = await createChatMessage({ authorId: String(authorId), username: 'viewer', avatar: '', clientMessageId: crypto.randomUUID(), text: 'flag me' });
    await expect(reportChatMessage({ messageId: message.id, reporterId: String(authorId), reason: 'spam', details: '' })).rejects.toBeInstanceOf(HttpError);
    await reportChatMessage({ messageId: message.id, reporterId: '507f1f77bcf86cd799439012', reason: 'spam', details: 'Repeated promotion' });
    expect(mocks.reportCreate).toHaveBeenCalledOnce();
    mocks.reportCreate.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    await expect(reportChatMessage({ messageId: message.id, reporterId: '507f1f77bcf86cd799439012', reason: 'spam', details: '' })).rejects.toMatchObject({ status: 409 });
  });
});
