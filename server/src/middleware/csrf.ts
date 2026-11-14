import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const cookieName = 'sg_csrf';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function signature(nonce: string): string {
  return createHmac('sha256', env.CSRF_SECRET ?? '').update(nonce).digest('hex');
}

export function issueCsrfToken(): string {
  const nonce = randomBytes(24).toString('hex');
  return `${nonce}.${signature(nonce)}`;
}

export function setCsrfCookie(token: string, response: import('express').Response): void {
  response.cookie(cookieName, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export const csrfProtection: RequestHandler = (request, _response, next) => {
  if (safeMethods.has(request.method)) return next();
  const cookie = request.cookies?.[cookieName];
  const header = request.header('x-csrf-token');
  if (!cookie || !header || cookie !== header) return next(new HttpError(403, 'Refresh the page and try again.'));
  const [nonce, supplied] = String(cookie).split('.');
  if (!nonce || !supplied) return next(new HttpError(403, 'Refresh the page and try again.'));
  const expected = signature(nonce);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return next(new HttpError(403, 'Refresh the page and try again.'));
  next();
};
