import type { Server } from 'socket.io';
import { describe, expect, it, vi } from 'vitest';
import { bindSocialSocket, emitDirectMessage } from './social-events.js';

describe('direct-message event fan-out', () => {
  it('targets the private room and both participant user rooms', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    bindSocialSocket({ to } as unknown as Server);
    const message = { _id: 'message-id', content: 'Hello' };

    emitDirectMessage('conversation-id', ['sender-id', 'recipient-id'], message);

    expect(to).toHaveBeenCalledWith(['dm:conversation-id', 'user:sender-id', 'user:recipient-id']);
    expect(emit).toHaveBeenCalledWith('dm:message', { conversationId: 'conversation-id', message });
  });
});
