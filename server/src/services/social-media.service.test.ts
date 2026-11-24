import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { createSocialUploadSignature, isSocialMediaConfigured, verifySocialImage } from './social-media.service.js';

describe('social image uploads', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it.each(['message', 'avatar'] as const)('issues a %s signature scoped to its account folder', (kind) => {
    if (!isSocialMediaConfigured()) {
      expect(() => createSocialUploadSignature('user-123', kind)).toThrow('not configured');
      return;
    }
    const result = createSocialUploadSignature('user-123', kind);
    const expectedFolder = kind === 'message' ? 'showgraphy/messages/user-123' : 'showgraphy/avatars/user-123';
    expect(result.folder).toBe(expectedFolder);
    expect(result.public_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(`${result.folder}/${result.public_id}`).toBe(`${expectedFolder}/${result.public_id}`);
    const params = { allowed_formats: result.allowed_formats, folder: result.folder, overwrite: result.overwrite, public_id: result.public_id, timestamp: result.timestamp };
    const canonical = Object.entries(params).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('&');
    expect(result.signature).toBe(createHash('sha1').update(`${canonical}${env.CLOUDINARY_API_SECRET}`).digest('hex'));
    expect(result).not.toHaveProperty('apiSecret');
  });

  it('rejects an image upload assigned to a different account', async () => {
    await expect(verifySocialImage('user-123', 'avatar', { publicId: 'showgraphy/avatars/someone-else/file', version: 1 })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies the stored image belongs to the account and meets image limits', async () => {
    const image = { publicId: 'showgraphy/messages/user-123/photo', version: 12 };
    if (!isSocialMediaConfigured()) {
      await expect(verifySocialImage('user-123', 'message', image)).rejects.toMatchObject({ status: 503 });
      return;
    }
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ public_id: image.publicId, secure_url: 'https://res.cloudinary.com/demo/image/upload/v12/photo.webp', version: 12, resource_type: 'image', width: 1200, height: 900, format: 'webp', bytes: 4096 }) });
    await expect(verifySocialImage('user-123', 'message', image)).resolves.toMatchObject({ publicId: image.publicId, secureUrl: expect.stringMatching(/^https:\/\//), bytes: 4096 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
