export type ChatMessage = {
  id: string;
  clientMessageId: string;
  authorId: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ChatAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; code: string; message: string };

export type ChatPage = {
  items: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type ChatTypingEvent = { username: string; typing: boolean };
export type ChatPresenceEvent = { onlineCount: number };

export type ChatClientToServerEvents = {
  'chat:send': (payload: { clientMessageId: string; text: string }, ack: (result: ChatAck) => void) => void;
  'chat:delete': (payload: { messageId: string }, ack: (result: { ok: boolean; code?: string; message?: string }) => void) => void;
  'chat:typing': (payload: { typing: boolean }) => void;
};

export type ChatServerToClientEvents = {
  'chat:message': (message: ChatMessage) => void;
  'chat:presence': (payload: ChatPresenceEvent) => void;
  'chat:typing': (payload: ChatTypingEvent) => void;
  'chat:auth-expired': () => void;
};
