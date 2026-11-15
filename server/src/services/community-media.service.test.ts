import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { createCommunityUploadSignature, isCommunityMediaConfigured, verifyCommunityImage } from './community-media.service.js';

describe('community media uploads', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it('issues signatures scoped to the authenticated user folder', () => {
    if (!isCommunityMediaConfigured()) {
      expect(() => createCommunityUploadSignature('user-123')).toThrow('not configured');
      return;
    }
    const result = createCommunityUploadSignature('user-123');
    expect(result.folder).toBe('showgraphy/community/user-123');
    expect(result.public_id.startsWith(`${result.folder}/`)).toBe(true);
    expect(result.allowed_formats).toBe('jpg,jpeg,png,webp');
    expect(result).not.toHaveProperty('apiSecret');
    const params = { allowed_formats: result.allowed_formats, folder: result.folder, overwrite: result.overwrite, public_id: result.public_id, timestamp: result.timestamp };
    const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
    expect(result.signature).toBe(createHash('sha1').update(`${canonical}${env.CLOUDINARY_API_SECRET}`).digest('hex'));
  });

  it('rejects image references outside the signed-in user folder', async () => {
    await expect(verifyCommunityImage('user-123', { publicId: 'showgraphy/community/someone-else/image', version: 1 })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies uploaded image metadata with Cloudinary before storing it', async () => {
    if (!isCommunityMediaConfigured()) {
      await expect(verifyCommunityImage('user-123', { publicId: 'showgraphy/community/user-123/image', version: 1 })).rejects.toMatchObject({ status: 503 });
      return;
    }
    const image = { publicId: 'showgraphy/community/user-123/image', version: 123 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ public_id: image.publicId, version: image.version, secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/showgraphy/community/user-123/image.webp', resource_type: 'image', width: 900, height: 600, format: 'webp', bytes: 2048 }) });
    await expect(verifyCommunityImage('user-123', image)).resolves.toMatchObject({ publicId: image.publicId, version: 123, width: 900, height: 600, format: 'webp', bytes: 2048 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects uploaded files above the 8 MB limit', async () => {
    if (!isCommunityMediaConfigured()) return;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ public_id: 'showgraphy/community/user-123/image', secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/image.webp', version: 123, resource_type: 'image', width: 900, height: 600, format: 'webp', bytes: 8 * 1024 * 1024 + 1 }) });
    await expect(verifyCommunityImage('user-123', { publicId: 'showgraphy/community/user-123/image', version: 123 })).rejects.toMatchObject({ status: 400 });
  });
});
