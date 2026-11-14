import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RefreshSession, User } from '../models/index.js';
import { HttpError } from '../utils/http.js';

type AccessClaims = JwtPayload & { tokenUse?: string; sid?: string };

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const value = request.header('authorization');
    const token = value?.startsWith('Bearer ') ? value.slice(7) : '';
    if (!token || !env.JWT_ACCESS_SECRET) throw new HttpError(401, 'Sign in to continue.');
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as AccessClaims;
    if (decoded.tokenUse !== 'access' || !decoded.sub || !decoded.sid) throw new HttpError(401, 'Your session has expired.');
    const [session, user] = await Promise.all([
      RefreshSession.findOne({ jti: decoded.sid, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id sessionFamilyId'),
      User.findById(decoded.sub).select('_id accountStatus'),
    ]);
    if (!session || !user || user.accountStatus !== 'active') throw new HttpError(401, 'Your session has expired.');
    request.auth = { userId: user._id, sessionId: decoded.sid, familyId: session.sessionFamilyId };
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    return next(new HttpError(401, 'Your session has expired.'));
  }
};

export const authenticateOptional: RequestHandler = async (request, _response, next) => {
  const value = request.header('authorization');
  const token = value?.startsWith('Bearer ') ? value.slice(7) : '';
  if (!token || !env.JWT_ACCESS_SECRET) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as AccessClaims;
    if (decoded.tokenUse !== 'access' || !decoded.sub || !decoded.sid) return next();
    const [session, user] = await Promise.all([
      RefreshSession.findOne({ jti: decoded.sid, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id sessionFamilyId'),
      User.findById(decoded.sub).select('_id accountStatus'),
    ]);
    if (session && user?.accountStatus === 'active') request.auth = { userId: user._id, sessionId: decoded.sid, familyId: session.sessionFamilyId };
  } catch { /* Public catalog reads remain available if an optional token has expired. */ }
  next();
};
