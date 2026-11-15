import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Conversation, DirectMessage, Follow } from './index.js';

describe('social data constraints', () => {
  it('requires exactly two conversation participants', async () => {
    const one = new Conversation({ participants: [new mongoose.Types.ObjectId()], pairKey: 'one' });
    await expect(one.validate()).rejects.toThrow(/participants/);
    const two = new Conversation({ participants: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()], pairKey: 'two' });
    await expect(two.validate()).resolves.toBeUndefined();
  });

  it('declares a unique canonical conversation pair and follow edge', () => {
    const conversationIndexes = Conversation.schema.indexes();
    const followIndexes = Follow.schema.indexes();
    expect(conversationIndexes.some(([keys, options]) => keys.pairKey === 1 && options?.unique === true)).toBe(true);
    expect(followIndexes.some(([keys, options]) => keys.follower === 1 && keys.following === 1 && options?.unique === true)).toBe(true);
  });

  it('requires a message idempotency key and bounded non-empty content', async () => {
    const message = new DirectMessage({ conversationId: new mongoose.Types.ObjectId(), senderId: new mongoose.Types.ObjectId(), clientMessageId: 'id', content: '' });
    await expect(message.validate()).rejects.toThrow();
  });
});
