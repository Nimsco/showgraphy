import { CommunityPost, CommunityUploadReservation } from '../models/index.js';
import { destroyCommunityImage, isCommunityMediaConfigured } from './community-media.service.js';

const cleanupIntervalMs = 15 * 60 * 1000;
let cleanupRunning = false;

export async function cleanupExpiredCommunityUploads(now = new Date()) {
  if (cleanupRunning || !isCommunityMediaConfigured()) return;
  cleanupRunning = true;
  try {
    const reservations = await CommunityUploadReservation.find({ expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(100).lean();
    for (const reservation of reservations) {
      const ownerId = String(reservation.owner);
      if (!reservation.publicId.startsWith(`showgraphy/community/${ownerId}/`)) {
        await CommunityUploadReservation.deleteOne({ _id: reservation._id });
        continue;
      }
      try {
        const attached = await CommunityPost.exists({ 'images.publicId': reservation.publicId });
        if (!attached) await destroyCommunityImage(reservation.publicId);
        await CommunityUploadReservation.deleteOne({ _id: reservation._id });
      } catch (error) {
        console.warn('Could not clean up an abandoned Community upload; it will be retried.', error instanceof Error ? error.message : 'Unknown storage error');
      }
    }
  } finally {
    cleanupRunning = false;
  }
}

export function scheduleCommunityUploadCleanup() {
  const runCleanup = () => {
    void cleanupExpiredCommunityUploads().catch((error: unknown) => {
      console.warn('Community upload cleanup could not query expired reservations.', error instanceof Error ? error.message : 'Unknown database error');
    });
  };
  const timer = setInterval(runCleanup, cleanupIntervalMs);
  timer.unref();
  runCleanup();
  return timer;
}
