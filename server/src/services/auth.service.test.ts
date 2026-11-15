import { describe, expect, it } from 'vitest';
import { hashPassword, passwordHash, safeUser, verifyPassword } from './auth.service.js';

describe('account security helpers', () => {
  it('hashes passwords with a one-way Argon2 verifier', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(encoded, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(encoded, 'different password')).resolves.toBe(false);
  });

  it('hashes token values deterministically without exposing the original', () => {
    const digest = passwordHash('one-time-token');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(passwordHash('one-time-token')).toBe(digest);
    expect(passwordHash('another-token')).not.toBe(digest);
  });

  it('returns only the safe account projection with privacy defaults', () => {
    const user = safeUser({
      _id: 'abc123', username: 'viewer', email: 'viewer@example.com', createdAt: new Date('2026-01-01'),
    });
    expect(user).toMatchObject({ id: 'abc123', username: 'viewer', profileVisibility: 'public', themePreference: 'dark' });
    expect(user.privacySettings).toEqual({ showStats: true, showLists: true, showRatings: true, showActivity: true, showFavorites: true, allowMessageRequests: true });
    expect(user).not.toHaveProperty('passwordHash');
  });
});
