import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { chatReportSchema, getChatMessages, reportChatMessage } from '../services/chat.service.js';
import { HttpError, route } from '../utils/http.js';

export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.get('/messages', route(async (request, response) => {
  const query = z.object({
    before: z.string().optional(),
    after: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(request.query);
  const result = await getChatMessages(query);
  response.json(result);
}));

chatRouter.post('/messages/:id/report', route(async (request, response) => {
  const parsed = chatReportSchema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((issue) => issue.message).join(' '));
  await reportChatMessage({ messageId: String(request.params.id), reporterId: String(request.auth!.userId), ...parsed.data });
  response.status(201).json({ message: 'Report received. Thank you for helping keep the chat safe.' });
}));
