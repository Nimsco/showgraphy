import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reservations: [] as Array<{ _id: string; owner: string; publicId: string }>,
  find: vi.fn(),
  postExists: vi.fn(),
  deleteOne: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('../models/index.js', () => ({
  CommunityPost: { exists: mocks.postExists },
  CommunityUploadReservation: { find: mocks.find, deleteOne: mocks.deleteOne },
}));
vi.mock('./community-media.service.js', () => ({
  destroyCommunityImage: mocks.destroy,
  isCommunityMediaConfigured: () => true,
}));

import { cleanupExpiredCommunityUploads } from './community-upload-cleanup.service.js';

describe('community upload cleanup', () => {
  beforeEach(() => {
    mocks.reservations = [];
    mocks.find.mockReset().mockImplementation(() => ({ sort: () => ({ limit: () => ({ lean: async () => mocks.reservations }) }) }));
    mocks.postExists.mockReset();
    mocks.deleteOne.mockReset().mockResolvedValue({ deletedCount: 1 });
    mocks.destroy.mockReset().mockResolvedValue(undefined);
  });

  it('deletes expired uploads only when they are not attached to a post', async () => {
    mocks.reservations = [
      { _id: 'attached', owner: 'user-1', publicId: 'showgraphy/community/user-1/attached' },
      { _id: 'orphan', owner: 'user-2', publicId: 'showgraphy/community/user-2/orphan' },
    ];
    mocks.postExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await cleanupExpiredCommunityUploads(new Date('2026-11-15T00:00:00.000Z'));

    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledWith('showgraphy/community/user-2/orphan');
    expect(mocks.deleteOne).toHaveBeenCalledTimes(2);
  });

  it('keeps a reservation when storage deletion fails so it can retry', async () => {
    mocks.reservations = [{ _id: 'orphan', owner: 'user-2', publicId: 'showgraphy/community/user-2/orphan' }];
    mocks.postExists.mockResolvedValue(false);
    mocks.destroy.mockRejectedValue(new Error('temporary storage error'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await cleanupExpiredCommunityUploads(new Date('2026-11-15T00:00:00.000Z'));

    expect(mocks.deleteOne).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
