import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { RefreshSession, User } from '../models/index.js';
import { HttpError } from '../utils/http.js';

type SafeUser = {
  id: string;
  username: string;
  usernameSetupRequired: boolean;
  email: string;
  emailVerified: boolean;
  avatar: string;
  bio: string;
  profileVisibility: 'public' | 'private';
  privacySettings: { showStats: boolean; showLists: boolean; showRatings: boolean; showActivity: boolean; showFavorites: boolean };
  themePreference: 'dark' | 'light' | 'ocean' | 'forest' | 'rose' | 'sunset' | 'ocean-light' | 'sage-light' | 'rose-light' | 'sunset-light' | 'system';
  favoriteTitleIds?: unknown[];
  createdAt: Date;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function durationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return amount * units[match[2] as keyof typeof units];
}

export function safeUser(user: { _id: unknown; username: string; usernameSetupRequired?: boolean; email: string; emailVerified?: boolean; avatar?: string; bio?: string; profileVisibility?: 'public' | 'private'; privacySettings?: SafeUser['privacySettings']; themePreference?: SafeUser['themePreference']; favoriteTitleIds?: unknown[]; createdAt: Date }): SafeUser {
  return {
    id: String(user._id),
    username: user.username,
    usernameSetupRequired: user.usernameSetupRequired ?? false,
    email: user.email,
    emailVerified: user.emailVerified ?? false,
    avatar: user.avatar ?? '',
    bio: user.bio ?? '',
    profileVisibility: user.profileVisibility ?? 'public',
    privacySettings: user.privacySettings ?? { showStats: true, showLists: true, showRatings: true, showActivity: true, showFavorites: true },
    themePreference: user.themePreference ?? 'dark',
    favoriteTitleIds: (user.favoriteTitleIds ?? []).map(String),
    createdAt: user.createdAt,
  };
}

function signAccess(userId: string, sessionId: string): string {
  return jwt.sign({ tokenUse: 'access', sid: sessionId }, env.JWT_ACCESS_SECRET!, {
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/auth',
    maxAge: durationMs(env.JWT_REFRESH_EXPIRES_IN),
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  } as const;
}

export async function issueSession(user: Parameters<typeof safeUser>[0], request: Request, response: Response, familyId: string = randomUUID()) {
  const jti = randomUUID();
  const refreshToken = jwt.sign({ tokenUse: 'refresh', sid: familyId }, env.JWT_REFRESH_SECRET!, {
    subject: String(user._id),
    jwtid: jti,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
  await RefreshSession.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    jti,
    sessionFamilyId: familyId,
    expiresAt: new Date(Date.now() + durationMs(env.JWT_REFRESH_EXPIRES_IN)),
    userAgent: request.get('user-agent')?.slice(0, 320),
    ipAddress: request.ip?.slice(0, 64),
    lastUsedAt: new Date(),
  });
  response.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return { accessToken: signAccess(String(user._id), jti), user: safeUser(user), sessionId: jti };
}

export async function rotateSession(refreshToken: string | undefined, request: Request, response: Response) {
  if (!refreshToken) { clearRefreshCookie(response); throw new HttpError(401, 'Sign in to continue.'); }
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as jwt.JwtPayload;
  } catch {
    clearRefreshCookie(response);
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
  if (claims.tokenUse !== 'refresh' || !claims.sub || !claims.jti || !claims.sid) throw new HttpError(401, 'Your session has expired. Sign in again.');
  const session = await RefreshSession.findOne({ jti: claims.jti, userId: claims.sub });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== hashToken(refreshToken)) {
    await RefreshSession.updateMany({ sessionFamilyId: String(claims.sid), revokedAt: null }, { $set: { revokedAt: new Date() } });
    clearRefreshCookie(response);
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
  const user = await User.findById(claims.sub);
  if (!user || user.accountStatus !== 'active') throw new HttpError(401, 'This account is unavailable.');
  const replacement = randomUUID();
  session.revokedAt = new Date();
  session.replacedBy = replacement;
  session.lastUsedAt = new Date();
  await session.save();
  return issueSession(user, request, response, session.sessionFamilyId);
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function passwordHash(token: string): string {
  return hashToken(token);
}
