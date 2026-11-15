import type { Server } from 'socket.io';

let io: Server | null = null;
export function bindSocialSocket(server: Server) { io = server; }
export function emitSocialNotification(userId: string, notification: unknown) {
  io?.to(`user:${userId}`).emit('social:notification', notification);
}
export function emitDirectMessage(conversationId: string, participantIds: string[], message: unknown) {
  io?.to([`dm:${conversationId}`, ...participantIds.map((userId) => `user:${userId}`)])
    .emit('dm:message', { conversationId, message });
}
