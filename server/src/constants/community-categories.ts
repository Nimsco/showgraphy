import { z } from 'zod';

export const COMMUNITY_CATEGORIES = ['general', 'anime', 'k-drama', 'c-drama', 'j-drama', 'movies', 'tv-series', 'western-series', 'animation', 'documentaries', 'other'] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

export const communityCategorySchema = z.enum(COMMUNITY_CATEGORIES);
export const communityCategoriesSchema = z.array(communityCategorySchema)
  .min(1)
  .max(1)
  .refine((items) => new Set(items).size === items.length, 'Categories must be unique.')
  .refine((items) => !items.includes('general') || items.length === 1, 'General cannot be combined with other categories.');

export function categoriesForCommunityPost(categories: unknown): CommunityCategory[] {
  return Array.isArray(categories) && categories.length ? categories as CommunityCategory[] : ['general'];
}

export function applyCommunityCategoryFilter(filter: Record<string, unknown>, category: CommunityCategory) {
  if (category === 'general') {
    filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), { $or: [{ categories: 'general' }, { categories: { $exists: false } }] }];
  } else {
    filter.categories = category;
  }
}
