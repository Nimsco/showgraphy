export type ChatMessagePayload = {
  id: string;
  clientMessageId: string;
  authorId: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ChatFailureCode = 'INVALID_MESSAGE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'AUTH_REQUIRED' | 'SERVER_ERROR';

export type ChatAck =
  | { ok: true; message: ChatMessagePayload }
  | { ok: false; code: ChatFailureCode; message: string };
