import type { Server as HttpServer } from 'node:http';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { isOriginAllowed } from '../config/origins.js';
import { RefreshSession, User } from '../models/index.js';
import {
  chatSendSchema,
  consumeChatMessageQuota,
  createChatMessage,
  deleteChatMessage,
  findChatMessageByClientId,
} from '../services/chat.service.js';
import type { ChatAck, ChatMessagePayload } from './chat.types.js';

type ChatUser = {
  userId: string;
  sessionId: string;
  username: string;
  avatar: string;
  expiresAt: number;
};

type ChatSocketData = { user: ChatUser; lastTypingEventAt?: number };
type ActionAck = { ok: true } | { ok: false; code: 'AUTH_REQUIRED' | 'NOT_FOUND' | 'SERVER_ERROR'; message: string };
type ClientToServerEvents = {
  'chat:send': (payload: unknown, ack: (result: ChatAck) => void) => void;
  'chat:delete': (payload: unknown, ack: (result: ActionAck) => void) => void;
  'chat:typing': (payload: { typing: boolean }) => void;
};
type ServerToClientEvents = {
  'chat:message': (message: ChatMessagePayload) => void;
  'chat:presence': (payload: { onlineCount: number }) => void;
  'chat:typing': (payload: { username: string; typing: boolean }) => void;
  'chat:auth-expired': () => void;
};
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, ChatSocketData>;
type JwtAccessClaims = JwtPayload & { tokenUse?: string; sid?: string };

export class ChatAuthenticationError extends Error {
  constructor(public code: string, message = 'Authentication required.') {
    super(message);
    this.name = 'ChatAuthenticationError';
  }
}

export async function authenticateChatToken(token: unknown): Promise<ChatUser> {
  if (typeof token !== 'string' || !token || !env.JWT_ACCESS_SECRET) throw new ChatAuthenticationError('AUTH_REQUIRED');
  let claims: JwtAccessClaims;
  try {
    claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as JwtAccessClaims;
  } catch (error) {
    const code = error instanceof jwt.TokenExpiredError ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED';
    throw new ChatAuthenticationError(code);
  }
  if (claims.tokenUse !== 'access' || !claims.sub || !claims.sid || !claims.exp || !mongoose.isValidObjectId(claims.sub)) {
    throw new ChatAuthenticationError('AUTH_REQUIRED');
  }
  const [session, user] = await Promise.all([
    RefreshSession.findOne({ jti: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
    User.findById(claims.sub).select('_id username avatar accountStatus usernameSetupRequired').lean(),
  ]);
  if (!session || !user || user.accountStatus !== 'active' || user.usernameSetupRequired) {
    throw new ChatAuthenticationError('AUTH_REVOKED', 'This session is no longer active.');
  }
  return {
    userId: String(user._id),
    sessionId: claims.sid,
    username: user.username,
    avatar: user.avatar ?? '',
    expiresAt: claims.exp * 1000,
  };
}

function socketError(code: string, message: string): Error & { data: { code: string } } {
  const error = new Error(message) as Error & { data: { code: string } };
  error.data = { code };
  return error;
}

function presencePayload(presence: Map<string, { username: string; avatar: string; socketIds: Set<string> }>) {
  return { onlineCount: presence.size };
}

export function createChatSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, ChatSocketData>(httpServer, {
    path: '/socket.io',
    transports: ['websocket'],
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    cors: {
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
      },
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(isOriginAllowed(origin) ? null : 'Origin is not allowed.', isOriginAllowed(origin));
    },
  });

  const presence = new Map<string, { username: string; avatar: string; socketIds: Set<string> }>();
  const typingSockets = new Map<string, Set<string>>();
  const tokenExpiryTimers = new Map<string, NodeJS.Timeout>();
  const maxTabsPerUser = 5;

  io.use((socket, next) => {
    authenticateChatToken(socket.handshake.auth?.token).then((user) => {
      if ((presence.get(user.userId)?.socketIds.size ?? 0) >= maxTabsPerUser) {
        next(socketError('CONNECTION_LIMIT', 'Too many active chat tabs.'));
        return;
      }
      socket.data.user = user;
      next();
    }).catch((error: unknown) => {
      const failure = error instanceof ChatAuthenticationError ? error : new ChatAuthenticationError('AUTH_REQUIRED');
      console.warn('[Chat connection rejected]', { code: failure.code, reason: failure.name });
      next(socketError(failure.code, failure.message));
    });
  });

  function publishPresence() {
    io.emit('chat:presence', presencePayload(presence));
  }

  function updateTyping(socket: ChatSocket, isTyping: boolean) {
    const { userId, username } = socket.data.user;
    let sockets = typingSockets.get(userId);
    if (isTyping) {
      if (!sockets) { sockets = new Set(); typingSockets.set(userId, sockets); }
      const wasTyping = sockets.size > 0;
      sockets.add(socket.id);
      if (!wasTyping) io.emit('chat:typing', { username, typing: true });
    } else if (sockets?.delete(socket.id) && sockets.size === 0) {
      typingSockets.delete(userId);
      io.emit('chat:typing', { username, typing: false });
    }
  }

  async function isSocketSessionActive(socket: ChatSocket): Promise<boolean> {
    const { userId, sessionId, expiresAt } = socket.data.user;
    if (expiresAt <= Date.now()) return false;
    const [session, user] = await Promise.all([
      RefreshSession.findOne({ jti: sessionId, userId, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
      User.findById(userId).select('_id accountStatus').lean(),
    ]);
    return Boolean(session && user?.accountStatus === 'active');
  }

  function expireSocket(socket: ChatSocket) {
    socket.emit('chat:auth-expired');
    socket.disconnect(true);
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    let active = presence.get(user.userId);
    if (!active) {
      active = { username: user.username, avatar: user.avatar, socketIds: new Set() };
      presence.set(user.userId, active);
    }
    active.socketIds.add(socket.id);
    socket.join('global');
    publishPresence();

    const expiryDelay = Math.max(0, user.expiresAt - Date.now());
    const expiryTimer = setTimeout(() => expireSocket(socket), expiryDelay);
    tokenExpiryTimers.set(socket.id, expiryTimer);

    socket.on('chat:send', async (payload, ack) => {
      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) {
        ack({ ok: false, code: 'INVALID_MESSAGE', message: parsed.error.issues[0]?.message ?? 'That message is invalid.' });
        return;
      }
      try {
        if (!await isSocketSessionActive(socket)) {
          ack({ ok: false, code: 'AUTH_REQUIRED', message: 'Your chat session expired. Reconnecting…' });
          expireSocket(socket);
          return;
        }
        const existing = await findChatMessageByClientId(user.userId, parsed.data.clientMessageId);
        if (existing) { ack({ ok: true, message: existing }); return; }
        if (!consumeChatMessageQuota(user.userId)) {
          ack({ ok: false, code: 'RATE_LIMITED', message: 'You’re sending messages too quickly. Wait a few seconds and try again.' });
          return;
        }
        const result = await createChatMessage({ ...parsed.data, authorId: user.userId, username: user.username, avatar: user.avatar });
        if (!result.duplicate) {
          updateTyping(socket, false);
          io.to('global').emit('chat:message', result.message);
        }
        ack({ ok: true, message: result.message });
      } catch (error) {
        console.error('[Chat send failed]', { reason: error instanceof Error ? error.name : 'unknown' });
        ack({ ok: false, code: 'SERVER_ERROR', message: 'The message could not be saved. Keep it here and try again.' });
      }
    });

    socket.on('chat:delete', async (payload, ack) => {
      const messageId = typeof payload === 'object' && payload !== null && 'messageId' in payload ? payload.messageId : null;
      if (typeof messageId !== 'string') {
        ack({ ok: false, code: 'NOT_FOUND', message: 'Message not found.' });
        return;
      }
      try {
        if (!await isSocketSessionActive(socket)) {
          ack({ ok: false, code: 'AUTH_REQUIRED', message: 'Your chat session expired. Reconnecting…' });
          expireSocket(socket);
          return;
        }
        const deleted = await deleteChatMessage(messageId, user.userId);
        if (!deleted) { ack({ ok: false, code: 'NOT_FOUND', message: 'Message not found or you do not own it.' }); return; }
        io.to('global').emit('chat:message', deleted);
        ack({ ok: true });
      } catch (error) {
        console.error('[Chat deletion failed]', { reason: error instanceof Error ? error.name : 'unknown' });
        ack({ ok: false, code: 'SERVER_ERROR', message: 'The message could not be removed.' });
      }
    });

    socket.on('chat:typing', async (payload) => {
      if (typeof payload?.typing !== 'boolean') return;
      const now = Date.now();
      if (payload.typing && now - (socket.data.lastTypingEventAt ?? 0) < 500) return;
      if (payload.typing) socket.data.lastTypingEventAt = now;
      try {
        if (!await isSocketSessionActive(socket)) { expireSocket(socket); return; }
        updateTyping(socket, payload.typing);
      } catch (error) {
        console.warn('[Chat typing check failed]', { reason: error instanceof Error ? error.name : 'unknown' });
      }
    });

    socket.on('disconnect', () => {
      const timer = tokenExpiryTimers.get(socket.id);
      if (timer) clearTimeout(timer);
      tokenExpiryTimers.delete(socket.id);
      updateTyping(socket, false);
      const current = presence.get(user.userId);
      current?.socketIds.delete(socket.id);
      if (current && current.socketIds.size === 0) presence.delete(user.userId);
      publishPresence();
    });
  });

  return io;
}
