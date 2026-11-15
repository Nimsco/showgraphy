import { createServer, type Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'chat-test-secret-that-is-long-enough-for-this-test';
process.env.CORS_ORIGINS = 'http://localhost:5173';

const mocks = vi.hoisted(() => ({
  sessionFindOne: vi.fn(),
  userFindById: vi.fn(),
  createChatMessage: vi.fn(),
  findChatMessageByClientId: vi.fn(),
  deleteChatMessage: vi.fn(),
  consumeChatMessageQuota: vi.fn(),
  conversationFindOne: vi.fn(),
  blockExists: vi.fn(),
  directMessageFindOne: vi.fn(),
  directMessageCreate: vi.fn(),
}));

vi.mock('../models/index.js', () => ({
  RefreshSession: { findOne: mocks.sessionFindOne },
  User: { findById: mocks.userFindById },
  Conversation: { findOne: mocks.conversationFindOne },
  Block: { exists: mocks.blockExists },
  DirectMessage: { findOne: mocks.directMessageFindOne, create: mocks.directMessageCreate },
}));

vi.mock('../services/chat.service.js', () => ({
  chatSendSchema: {
    safeParse(value: unknown) {
      const input = value as { clientMessageId?: unknown; text?: unknown } | null;
      if (!input || typeof input.clientMessageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.clientMessageId)) {
        return { success: false, error: { issues: [{ message: 'That message is invalid.' }] } };
      }
      if (typeof input.text !== 'string' || !input.text.trim()) {
        return { success: false, error: { issues: [{ message: 'Write a message first.' }] } };
      }
      if (input.text.length > 1000) {
        return { success: false, error: { issues: [{ message: 'Messages are limited to 1,000 characters.' }] } };
      }
      return { success: true, data: { clientMessageId: input.clientMessageId, text: input.text.trim() } };
    },
  },
  consumeChatMessageQuota: mocks.consumeChatMessageQuota,
  createChatMessage: mocks.createChatMessage,
  deleteChatMessage: mocks.deleteChatMessage,
  findChatMessageByClientId: mocks.findChatMessageByClientId,
}));

const secret = process.env.JWT_ACCESS_SECRET!;
const firstUserId = '507f1f77bcf86cd799439011';
const secondUserId = '507f1f77bcf86cd799439012';
const thirdUserId = '507f1f77bcf86cd799439015';
const conversationId = '507f1f77bcf86cd799439014';
const origin = 'http://localhost:5173';
let httpServer: HttpServer;
let socketServer: import('socket.io').Server;
let serverUrl = '';
const clients = new Set<ClientSocket>();

function selected(value: unknown) {
  return { select: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(value) })) };
}

function accessToken(userId = firstUserId, sessionId = `session-${userId}`, expiresIn: number | string = 60) {
  return jwt.sign({ tokenUse: 'access', sid: sessionId }, secret, {
    subject: userId,
    issuer: 'showgraphy',
    audience: 'showgraphy-client',
    expiresIn,
  });
}

function makeClient(token?: string) {
  const client = connectSocket(serverUrl, {
    autoConnect: false,
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 3000,
    reconnection: false,
    auth: token ? { token } : {},
    extraHeaders: { Origin: origin },
  });
  clients.add(client);
  client.on('disconnect', () => clients.delete(client));
  return client;
}

function connect(client: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { client.off('connect', onConnect); reject(error); };
    const onConnect = () => { client.off('connect_error', onError); resolve(); };
    client.once('connect_error', onError);
    client.once('connect', onConnect);
    client.connect();
  });
}

function waitFor<T>(client: ClientSocket, event: string) {
  return new Promise<T>((resolve) => client.once(event, resolve));
}

function waitForValue<T>(client: ClientSocket, event: string, matches: (value: T) => boolean) {
  return new Promise<T>((resolve) => {
    const listener = (value: T) => {
      if (!matches(value)) return;
      client.off(event, listener);
      resolve(value);
    };
    client.on(event, listener);
  });
}

function send(client: ClientSocket, payload: unknown) {
  return new Promise<{ ok: boolean; code?: string; message?: string }>((resolve, reject) => {
    client.timeout(2000).emit('chat:send', payload, (error: Error | null, result: { ok: boolean; code?: string; message?: string }) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function sendDirect(client: ClientSocket, payload: unknown) {
  return new Promise<{ ok: boolean; code?: string; message?: string }>((resolve, reject) => {
    client.timeout(2000).emit('dm:send', payload, (error: Error | null, result: { ok: boolean; code?: string; message?: string }) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

describe('global chat Socket.IO transport', () => {
  beforeAll(async () => {
    const { createChatSocketServer } = await import('./chat.socket.js');
    httpServer = createServer();
    socketServer = createChatSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindOne.mockImplementation((filter: { jti: string }) => selected(filter.jti.startsWith('session-') ? { _id: 'session' } : null));
    mocks.userFindById.mockImplementation((id: string) => selected({
      _id: id,
      username: id === secondUserId ? 'second_viewer' : 'first_viewer',
      avatar: '',
      accountStatus: id === '507f1f77bcf86cd799439013' ? 'disabled' : 'active',
      usernameSetupRequired: false,
    }));
    mocks.createChatMessage.mockImplementation(async (input: { authorId: string; username: string; avatar: string; clientMessageId: string; text: string }) => ({
      duplicate: false,
      message: { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), deletedAt: null },
    }));
    mocks.findChatMessageByClientId.mockResolvedValue(null);
    mocks.deleteChatMessage.mockResolvedValue(null);
    mocks.consumeChatMessageQuota.mockReturnValue(true);
    const conversation = { _id: conversationId, participants: [firstUserId, secondUserId], status: 'accepted', requestedBy: null, lastMessage: null, lastMessageAt: null, save: vi.fn().mockResolvedValue(undefined) };
    mocks.conversationFindOne.mockImplementation((filter: { _id?: string; participants?: string }) => {
      const matches = filter._id === conversationId && [firstUserId, secondUserId].includes(filter.participants ?? '');
      const query = { select: vi.fn(() => query), lean: vi.fn().mockResolvedValue(matches ? conversation : null), then: (resolve: (value: typeof conversation | null) => void, reject: (reason: unknown) => void) => Promise.resolve(matches ? conversation : null).then(resolve, reject) };
      return query;
    });
    mocks.blockExists.mockResolvedValue(null);
    mocks.directMessageFindOne.mockResolvedValue(null);
    mocks.directMessageCreate.mockImplementation(async (input: { conversationId: string; senderId: string; content: string; clientMessageId: string }) => ({ _id: crypto.randomUUID(), ...input, createdAt: new Date() }));
  });

  afterEach(async () => {
    await Promise.all([...clients].map((client) => new Promise<void>((resolve) => {
      if (!client.connected) { client.disconnect(); resolve(); return; }
      client.once('disconnect', () => resolve());
      client.disconnect();
    })));
    await new Promise((resolve) => setTimeout(resolve, 50));
    clients.clear();
  });

  it('rejects unauthenticated, expired, and disabled accounts before joining the room', async () => {
    const missing = makeClient();
    await expect(connect(missing)).rejects.toMatchObject({ data: { code: 'AUTH_REQUIRED' } });
    missing.disconnect();

    const expired = makeClient(accessToken(firstUserId, `session-${firstUserId}`, -1));
    await expect(connect(expired)).rejects.toMatchObject({ data: { code: 'AUTH_EXPIRED' } });
    expired.disconnect();

    const disabled = makeClient(accessToken('507f1f77bcf86cd799439013', 'session-disabled'));
    await expect(connect(disabled)).rejects.toMatchObject({ data: { code: 'AUTH_REVOKED' } });
    disabled.disconnect();
  });

  it('authenticates users, validates sends, persists once, and broadcasts to connected users', async () => {
    const sender = makeClient(accessToken());
    const receiver = makeClient(accessToken(secondUserId));
    const senderPresence = waitFor<{ onlineCount: number }>(sender, 'chat:presence');
    await connect(sender);
    expect(await senderPresence).toEqual({ onlineCount: 1 });
    await connect(receiver);

    const invalid = await send(sender, { clientMessageId: crypto.randomUUID(), text: '   ' });
    expect(invalid).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
    const oversized = await send(sender, { clientMessageId: crypto.randomUUID(), text: 'x'.repeat(1001) });
    expect(oversized).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
    expect(mocks.createChatMessage).not.toHaveBeenCalled();

    const incoming = waitFor<{ text: string; authorId: string }>(receiver, 'chat:message');
    const result = await send(sender, { clientMessageId: crypto.randomUUID(), text: 'Hello, community.' });
    expect(result).toMatchObject({ ok: true, message: { text: 'Hello, community.', authorId: firstUserId } });
    expect(await incoming).toMatchObject({ text: 'Hello, community.', authorId: firstUserId });
    expect(mocks.createChatMessage).toHaveBeenCalledOnce();
  });

  it('keeps private messages inside an authorized conversation room', async () => {
    const sender = makeClient(accessToken());
    const receiver = makeClient(accessToken(secondUserId));
    const outsider = makeClient(accessToken(thirdUserId, `session-${thirdUserId}`));
    await Promise.all([connect(sender), connect(receiver), connect(outsider)]);
    const join = (client: ClientSocket) => new Promise<{ ok: boolean; message?: string }>((resolve) => client.emit('dm:join', { conversationId }, resolve));
    expect(await join(sender)).toMatchObject({ ok: true });
    expect(await join(receiver)).toMatchObject({ ok: true });
    expect(await join(outsider)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const incoming = waitFor<{ conversationId: string; message: { content: string; senderId: string } }>(receiver, 'dm:message');
    const result = await sendDirect(sender, { conversationId, clientMessageId: crypto.randomUUID(), content: 'A quiet message.' });
    expect(result).toMatchObject({ ok: true });
    expect(await incoming).toMatchObject({ conversationId, message: { content: 'A quiet message.', senderId: firstUserId } });
    expect(mocks.directMessageCreate).toHaveBeenCalledOnce();
  });

  it('counts one user once across multiple tabs and updates on the last disconnect', async () => {
    const firstTab = makeClient(accessToken());
    const initialPresence = waitFor<{ onlineCount: number }>(firstTab, 'chat:presence');
    await connect(firstTab);
    expect(await initialPresence).toEqual({ onlineCount: 1 });

    const sameUserPresence = waitFor<{ onlineCount: number }>(firstTab, 'chat:presence');
    const secondTab = makeClient(accessToken());
    await connect(secondTab);
    expect(await sameUserPresence).toEqual({ onlineCount: 1 });

    const anotherUserPresence = waitFor<{ onlineCount: number }>(firstTab, 'chat:presence');
    const otherUser = makeClient(accessToken(secondUserId));
    await connect(otherUser);
    expect(await anotherUserPresence).toEqual({ onlineCount: 2 });

    const stillOnline = waitFor<{ onlineCount: number }>(secondTab, 'chat:presence');
    firstTab.disconnect();
    expect(await stillOnline).toEqual({ onlineCount: 2 });
    const oneUserLeft = waitForValue<{ onlineCount: number }>(otherUser, 'chat:presence', (presence) => presence.onlineCount === 1);
    secondTab.disconnect();
    expect(await oneUserLeft).toEqual({ onlineCount: 1 });
  });

  it('caps active tabs and returns a clear rate-limit acknowledgement', async () => {
    const tabs: ClientSocket[] = [];
    for (let index = 0; index < 5; index += 1) {
      const tab = makeClient(accessToken());
      await connect(tab);
      tabs.push(tab);
    }
    const overflow = makeClient(accessToken());
    await expect(connect(overflow)).rejects.toMatchObject({ data: { code: 'CONNECTION_LIMIT' } });
    overflow.disconnect();

    mocks.consumeChatMessageQuota.mockReturnValue(false);
    const limited = await send(tabs[0]!, { clientMessageId: crypto.randomUUID(), text: 'Slow down' });
    expect(limited).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(mocks.createChatMessage).not.toHaveBeenCalled();
  });

  it('removes a live socket after its refresh session is revoked', async () => {
    const client = makeClient(accessToken());
    await connect(client);
    const expired = waitFor<void>(client, 'chat:auth-expired');
    mocks.sessionFindOne.mockImplementationOnce(() => selected(null));
    const result = await send(client, { clientMessageId: crypto.randomUUID(), text: 'Check my session' });
    expect(result).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' });
    await expect(expired).resolves.toBeUndefined();
    expect(client.connected).toBe(false);
  });

  it('disconnects an expired access token and accepts a refreshed token on reconnect', async () => {
    const client = makeClient(accessToken(firstUserId, `session-${firstUserId}`, 1));
    const expired = waitFor<void>(client, 'chat:auth-expired');
    await connect(client);
    await expect(expired).resolves.toBeUndefined();
    client.auth = { token: accessToken() };
    await expect(connect(client)).resolves.toBeUndefined();
    expect(client.connected).toBe(true);
  });
});
