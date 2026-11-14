import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function route(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({ message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    response.status(409).json({ message: 'That value is already in use.' });
    return;
  }
  console.error(error);
  response.status(500).json({ message: 'Something went wrong. Please try again.' });
};

export function pageParams(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 24));
  return { page, limit, skip: (page - 1) * limit };
}
