import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env.js';
import { csrfProtection, issueCsrfToken, setCsrfCookie } from '../middleware/csrf.js';
import { authenticate } from '../middleware/authenticate.js';
import { EmailActionToken, RegistrationChallenge, RefreshSession, User, UserList } from '../models/index.js';
import { clearRefreshCookie, hashPassword, issueSession, rotateSession, safeUser, verifyPassword } from '../services/auth.service.js';
import { emailActionHash, isEmailDeliveryConfigured, registrationCodeHash, sendAccountActionEmail, sendRegistrationCode } from '../services/email.service.js';
import { HttpError, route } from '../utils/http.js';

export const authRouter = Router();
const recoveryLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Please wait before requesting another account link.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Try again shortly.' } });
const registrationLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Please wait before requesting another registration code.' } });
const registrationVerifyLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many verification attempts. Try again shortly.' } });

function frontendOrigin(request: import('express').Request) {
  if (env.NODE_ENV !== 'development') return env.FRONTEND_URL;
  const host = request.get('x-forwarded-host');
  if (!host) return env.FRONTEND_URL;
  const protocol = request.get('x-forwarded-proto') || 'http';
  try { return new URL(`${protocol}://${host}`).origin; } catch { return env.FRONTEND_URL; }
}

function isLoopback(host: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(host.toLowerCase());
}

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/, 'Use letters, numbers, or underscores.'),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) });

function googleClient(): OAuth2Client | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
}

function googleCallbackUsesFrontendProxy(): boolean {
  try {
    const callback = new URL(env.GOOGLE_CALLBACK_URL);
    const frontend = new URL(env.FRONTEND_URL);
    return callback.origin === frontend.origin && callback.pathname === '/api/auth/google/callback';
  } catch { return false; }
}

authRouter.get('/csrf', (_request, response) => {
  const token = issueCsrfToken();
  setCsrfCookie(token, response);
  response.json({ csrfToken: token });
});

authRouter.get('/config', (_request, response) => {
  response.json({ googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), googleCallbackProxyConfigured: googleCallbackUsesFrontendProxy(), emailEnabled: isEmailDeliveryConfigured() });
});

authRouter.post('/register', registrationLimiter, csrfProtection, route(async (request, response) => {
  const input = registerSchema.parse(request.body);
  if (!isEmailDeliveryConfigured()) throw new HttpError(503, 'Email verification is not configured on the server.');
  if (await User.exists({ $or: [{ username: input.username }, { email: input.email }] })) throw new HttpError(409, 'That username or email is already in use.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const challenge = await RegistrationChallenge.findOneAndUpdate({ email: input.email }, { $set: {
    username: input.username,
    passwordHash: await hashPassword(input.password),
    codeHash: registrationCodeHash(input.email, code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    attempts: 0,
    consumedAt: null,
  } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  try { await sendRegistrationCode(input.email, input.username, code); }
  catch {
    await challenge.deleteOne();
    throw new HttpError(503, 'The verification email could not be sent. Check the server email settings and try again.');
  }
  response.status(202).json({ message: 'A six-digit verification code was sent to your email address.' });
}));

authRouter.post('/register/verify', registrationVerifyLimiter, csrfProtection, route(async (request, response) => {
  const input = z.object({ email: z.email().trim().toLowerCase().max(254), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
  const challenge = await RegistrationChallenge.findOne({ email: input.email, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } });
  if (!challenge) throw new HttpError(400, 'That code is invalid or expired. Start registration again to request a new one.');
  const submittedHash = Buffer.from(registrationCodeHash(input.email, input.code), 'hex');
  const storedHash = Buffer.from(challenge.codeHash, 'hex');
  if (submittedHash.length !== storedHash.length || !timingSafeEqual(submittedHash, storedHash)) {
    challenge.attempts += 1;
    if (challenge.attempts >= 5) challenge.consumedAt = new Date();
    await challenge.save();
    throw new HttpError(400, 'That code is incorrect.');
  }
  const consumed = await RegistrationChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!consumed) throw new HttpError(400, 'That code is invalid or expired. Start registration again to request a new one.');
  if (await User.exists({ $or: [{ username: challenge.username }, { email: challenge.email }] })) throw new HttpError(409, 'That username or email is already in use.');
  const user = await User.create({ username: challenge.username, email: challenge.email, passwordHash: challenge.passwordHash, emailVerified: true });
  await UserList.create({ userId: user._id, name: 'My Watchlist', slug: 'my-watchlist', listType: 'watchlist', visibility: 'private' });
  response.status(201).json(await issueSession(user, request, response));
}));

authRouter.post('/login', loginLimiter, csrfProtection, route(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ $or: [{ email: input.identifier.toLowerCase() }, { username: input.identifier.toLowerCase() }] }).select('+passwordHash');
  if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, input.password)) || user.accountStatus !== 'active') {
    throw new HttpError(401, 'The email or password did not match.');
  }
  response.json(await issueSession(user, request, response));
}));

authRouter.post('/refresh', csrfProtection, route(async (request, response) => {
  response.json(await rotateSession(request.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined, request, response));
}));

authRouter.post('/logout', csrfProtection, route(async (request, response) => {
  const token = request.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (token && env.JWT_REFRESH_SECRET) {
    try {
      const claims = jwt.decode(token);
      if (typeof claims === 'object' && claims?.jti) {
        const session = await RefreshSession.findOne({ jti: claims.jti });
        if (session) await RefreshSession.updateMany({ sessionFamilyId: session.sessionFamilyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      }
    } catch { /* The cookie is cleared even when the token is malformed. */ }
  }
  clearRefreshCookie(response);
  response.status(204).end();
}));

authRouter.get('/me', authenticate, route(async (request, response) => {
  const user = await User.findById(request.auth!.userId);
  if (!user) throw new HttpError(404, 'Account not found.');
  response.json({ user: safeUser(user) });
}));

authRouter.patch('/password', authenticate, route(async (request, response) => {
  const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }).parse(request.body);
  const user = await User.findById(request.auth!.userId).select('+passwordHash');
  if (!user || !user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) throw new HttpError(400, 'Current password did not match.');
  user.passwordHash = await hashPassword(input.newPassword);
  await user.save();
  await RefreshSession.updateMany({ userId: user._id, jti: { $ne: request.auth!.sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  response.json({ message: 'Password updated. Other active sessions were signed out.' });
}));

authRouter.post('/password/forgot', recoveryLimiter, route(async (request, response) => {
  const input = z.object({ email: z.email().trim().toLowerCase().max(254) }).parse(request.body);
  const user = await User.findOne({ email: input.email, accountStatus: 'active' });
  if (user) {
    try { await sendAccountActionEmail(user, 'password-reset'); } catch { /* Keep responses neutral so account existence is not disclosed. */ }
  }
  response.status(202).json({ message: 'If an active account uses that email, a recovery link will arrive shortly.' });
}));

authRouter.post('/password/reset', route(async (request, response) => {
  const input = z.object({ token: z.string().min(32).max(128), password: z.string().min(8).max(128) }).parse(request.body);
  const token = await EmailActionToken.findOneAndUpdate({ tokenHash: emailActionHash(input.token), action: 'password-reset', consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!token) throw new HttpError(400, 'This recovery link has expired or was already used. Request another link.');
  const user = await User.findById(token.userId).select('+passwordHash');
  if (!user || user.accountStatus !== 'active') throw new HttpError(400, 'This recovery link is no longer available.');
  user.passwordHash = await hashPassword(input.password);
  await user.save();
  await RefreshSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await EmailActionToken.updateMany({ userId: user._id, action: 'password-reset', consumedAt: null }, { $set: { consumedAt: new Date() } });
  clearRefreshCookie(response);
  response.json({ message: 'Password reset. Sign in with your new password.' });
}));

authRouter.post('/verify-email', route(async (request, response) => {
  const input = z.object({ token: z.string().min(32).max(128) }).parse(request.body);
  const token = await EmailActionToken.findOneAndUpdate({ tokenHash: emailActionHash(input.token), action: 'verify-email', consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!token) throw new HttpError(400, 'This verification link has expired or was already used. Request another link.');
  const user = await User.findOneAndUpdate({ _id: token.userId, accountStatus: 'active' }, { $set: { emailVerified: true } });
  if (!user) throw new HttpError(400, 'This verification link is no longer available.');
  response.json({ verified: true });
}));

authRouter.post('/verify/resend', recoveryLimiter, authenticate, route(async (request, response) => {
  const user = await User.findById(request.auth!.userId);
  if (user && !user.emailVerified) {
    try { await sendAccountActionEmail(user, 'verify-email'); } catch { /* The neutral response allows safe retries. */ }
  }
  response.status(202).json({ message: 'If your email still needs verification, a new link will arrive shortly.' });
}));

authRouter.get('/sessions', authenticate, route(async (request, response) => {
  const sessions = await RefreshSession.find({ userId: request.auth!.userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('_id jti userAgent createdAt lastUsedAt')
    .sort({ lastUsedAt: -1 }).lean();
  response.json({ items: sessions.map((session) => ({ id: String(session._id), current: session.jti === request.auth!.sessionId, userAgent: session.userAgent ?? '', createdAt: session.createdAt, lastUsedAt: session.lastUsedAt })) });
}));

authRouter.delete('/sessions/:id', authenticate, route(async (request, response) => {
  const result = await RefreshSession.updateOne({ _id: request.params.id, userId: request.auth!.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!result.matchedCount) throw new HttpError(404, 'Session not found.');
  response.status(204).end();
}));

authRouter.get('/google', route(async (request, response) => {
  const client = googleClient();
  if (!client) throw new HttpError(503, 'Google sign-in is not configured.');
  if (!googleCallbackUsesFrontendProxy()) throw new HttpError(503, 'Set GOOGLE_CALLBACK_URL to FRONTEND_URL/api/auth/google/callback and register that exact URL in Google Cloud.');
  const browserOrigin = new URL(frontendOrigin(request));
  const callbackOrigin = new URL(env.GOOGLE_CALLBACK_URL);
  if (env.NODE_ENV === 'development' && !isLoopback(browserOrigin.hostname) && isLoopback(callbackOrigin.hostname)) {
    throw new HttpError(503, 'Google sign-in from another device needs a public HTTPS callback URL. Configure GOOGLE_CALLBACK_URL and register it in the Google OAuth client.');
  }
  const state = randomBytes(24).toString('hex');
  response.cookie('sg_google_state', state, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: 5 * 60_000, path: '/api/auth/google' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', env.GOOGLE_CALLBACK_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  response.redirect(url.toString());
}));

authRouter.get('/google/callback', route(async (request, response) => {
  const client = googleClient();
  const stateCookie = request.cookies?.sg_google_state as string | undefined;
  response.clearCookie('sg_google_state', { path: '/api/auth/google', secure: env.COOKIE_SECURE, sameSite: 'lax' });
  if (!client || !stateCookie || request.query.state !== stateCookie || typeof request.query.code !== 'string') {
    throw new HttpError(400, 'Google sign-in could not be verified. Please try again.');
  }
  const { tokens } = await client.getToken({ code: request.query.code, redirect_uri: env.GOOGLE_CALLBACK_URL });
  if (!tokens.id_token) throw new HttpError(401, 'Google did not return a verified identity.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const identity = ticket.getPayload();
  if (!identity?.sub || !identity.email || !identity.email_verified) throw new HttpError(401, 'Google did not return a verified email address.');

  let user = await User.findOne({ $or: [{ googleSub: identity.sub }, { email: identity.email.toLowerCase() }] });
  if (!user) {
    const username = `viewer_${randomBytes(6).toString('hex')}`;
    user = await User.create({ username, usernameSetupRequired: true, email: identity.email.toLowerCase(), googleSub: identity.sub, avatar: identity.picture || '', emailVerified: true });
    await UserList.create({ userId: user._id, name: 'My Watchlist', slug: 'my-watchlist', listType: 'watchlist', visibility: 'private' });
  } else if (!user.googleSub) {
    user.googleSub = identity.sub;
    user.emailVerified = true;
    if (identity.picture && !user.avatar) user.avatar = identity.picture;
    await user.save();
  }
  if (user.accountStatus !== 'active') throw new HttpError(403, 'This account is unavailable.');
  await issueSession(user, request, response);
  response.redirect(new URL('/app?google=connected', frontendOrigin(request)).toString());
}));
