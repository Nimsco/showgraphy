import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { CommunityPost } from '../models/CommunityPost.js';
import { applyCommunityCategoryFilter, categoriesForCommunityPost, COMMUNITY_CATEGORIES, communityCategoriesSchema } from './community-categories.js';

describe('community categories', () => {
  it('keeps categories predefined and allows exactly one selected category', () => {
    expect(COMMUNITY_CATEGORIES).toEqual(['general', 'anime', 'k-drama', 'c-drama', 'j-drama', 'movies', 'tv-series', 'western-series', 'animation', 'documentaries', 'other']);
    expect(communityCategoriesSchema.safeParse(['anime']).success).toBe(true);
    expect(communityCategoriesSchema.safeParse(['anime', 'tv-series']).success).toBe(false);
    expect(communityCategoriesSchema.safeParse(['anime', 'anime']).success).toBe(false);
    expect(communityCategoriesSchema.safeParse(['general', 'anime']).success).toBe(false);
    expect(communityCategoriesSchema.safeParse(['unlisted']).success).toBe(false);
  });

  it('defaults new posts and legacy posts to General', async () => {
    const post = new CommunityPost({ author: new mongoose.Types.ObjectId(), title: 'A discussion' });
    expect(post.categories).toEqual(['general']);
    await expect(post.validate()).resolves.toBeUndefined();
    expect(categoriesForCommunityPost(undefined)).toEqual(['general']);
    expect(categoriesForCommunityPost([])).toEqual(['general']);
  });

  it('adds indexed category filters without dropping existing query conditions', () => {
    const animeFilter: Record<string, unknown> = { deletedAt: null };
    applyCommunityCategoryFilter(animeFilter, 'anime');
    expect(animeFilter.categories).toBe('anime');

    const generalFilter: Record<string, unknown> = { $or: [{ title: /show/i }, { content: /show/i }] };
    applyCommunityCategoryFilter(generalFilter, 'general');
    expect(generalFilter.$and).toEqual([{ $or: [{ categories: 'general' }, { categories: { $exists: false } }] }]);
    expect(generalFilter.$or).toEqual([{ title: /show/i }, { content: /show/i }]);
  });

  it('indexes categories with creation time for filtered feeds', () => {
    expect(CommunityPost.schema.indexes().some(([keys]) => keys.categories === 1 && keys.createdAt === -1)).toBe(true);
  });
});
