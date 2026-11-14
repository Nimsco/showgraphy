import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

const { refreshCreate, refreshFindOne, refreshUpdateMany, userFindById } = vi.hoisted(() => ({
  refreshCreate: vi.fn(),
  refreshFindOne: vi.fn(),
  refreshUpdateMany: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock('../models/index.js', () => ({
  RefreshSession: { create: refreshCreate, findOne: refreshFindOne, updateMany: refreshUpdateMany },
  User: { findById: userFindById },
}));

vi.mock('../config/env.js', () => ({ env: {
  JWT_ACCESS_SECRET: 'access-test-secret-long-enough-for-unit-tests',
  JWT_REFRESH_SECRET: 'refresh-test-secret-long-enough-for-unit-tests',
  JWT_ACCESS_EXPIRES_IN: '10m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_ISSUER: 'showgraphy-test',
  JWT_AUDIENCE: 'showgraphy-client-test',
  REFRESH_COOKIE_NAME: 'refreshToken',
  COOKIE_SECURE: true,
  COOKIE_SAME_SITE: 'lax',
} }));

const user = { _id: '507f1f77bcf86cd799439011', username: 'viewer', email: 'viewer@example.com', accountStatus: 'active', createdAt: new Date() };

function request() {
  return { get: () => 'vitest', ip: '127.0.0.1' } as unknown as Request;
}

function response() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
}

function signRefresh(jti = 'old-session', expiresIn: jwt.SignOptions['expiresIn'] = '1h') {
  return jwt.sign({ tokenUse: 'refresh', sid: 'session-family' }, 'refresh-test-secret-long-enough-for-unit-tests', {
    subject: user._id,
    jwtid: jti,
    issuer: 'showgraphy-test',
    audience: 'showgraphy-client-test',
    expiresIn,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('refresh session rotation', () => {
  it('rotates a valid refresh cookie after an expired access token', async () => {
    const { issueSession, passwordHash, rotateSession } = await import('./auth.service.js');
    const refreshToken = signRefresh();
    const priorSession = {
      userId: user._id,
      jti: 'old-session',
      sessionFamilyId: 'session-family',
      tokenHash: passwordHash(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as Date | null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    refreshFindOne.mockResolvedValue(priorSession);
    userFindById.mockResolvedValue(user);
    refreshCreate.mockResolvedValue({});
    const res = response();

    const result = await rotateSession(refreshToken, request(), res);
    expect(priorSession.revokedAt).toBeInstanceOf(Date);
    expect(priorSession.save).toHaveBeenCalledOnce();
    expect(refreshCreate).toHaveBeenCalledOnce();
    expect(res.cookie).toHaveBeenCalledOnce();
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000 }));
    expect(res.cookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
    expect(jwt.decode(result.accessToken)).toMatchObject({ tokenUse: 'access', sub: user._id });
    expect(result.user.id).toBe(user._id);
    expect(issueSession).toBeTypeOf('function');
  });

  it('rejects a missing refresh cookie and clears it', async () => {
    const { rotateSession } = await import('./auth.service.js');
    const res = response();

    await expect(rotateSession(undefined, request(), res)).rejects.toMatchObject({ status: 401 });
    expect(res.clearCookie).toHaveBeenCalledOnce();
    expect(refreshFindOne).not.toHaveBeenCalled();
  });

  it('rejects an expired refresh token and clears its cookie', async () => {
    const { rotateSession } = await import('./auth.service.js');
    const res = response();

    await expect(rotateSession(signRefresh('expired-session', -1), request(), res)).rejects.toMatchObject({ status: 401 });
    expect(res.clearCookie).toHaveBeenCalledOnce();
    expect(refreshFindOne).not.toHaveBeenCalled();
  });
});
