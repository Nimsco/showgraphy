import { DirectMessage, SocialUploadReservation, User } from '../models/index.js';
import { destroySocialImage, isSocialMediaConfigured, type SocialUploadKind } from './social-media.service.js';

const cleanupIntervalMs = 15 * 60 * 1000;
let cleanupRunning = false;

export async function cleanupExpiredSocialUploads(now = new Date()) {
  if (cleanupRunning || !isSocialMediaConfigured()) return;
  cleanupRunning = true;
  try {
    const reservations = await SocialUploadReservation.find({ expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(100).lean();
    for (const reservation of reservations) {
      const ownerId = String(reservation.owner);
      const kind = reservation.kind as SocialUploadKind;
      const prefix = kind === 'message' ? `showgraphy/messages/${ownerId}/` : kind === 'avatar' ? `showgraphy/avatars/${ownerId}/` : '';
      if (!prefix || !reservation.publicId.startsWith(prefix)) {
        await SocialUploadReservation.deleteOne({ _id: reservation._id });
        continue;
      }
      try {
        const attached = kind === 'message'
          ? await DirectMessage.exists({ 'image.publicId': reservation.publicId, deletedAt: null })
          : await User.exists({ avatarPublicId: reservation.publicId });
        if (!attached) await destroySocialImage(reservation.publicId);
        await SocialUploadReservation.deleteOne({ _id: reservation._id });
      } catch (error) {
        console.warn('Could not clean up an abandoned image upload; it will be retried.', error instanceof Error ? error.message : 'Unknown storage error');
      }
    }
  } finally {
    cleanupRunning = false;
  }
}

export function scheduleSocialUploadCleanup() {
  const runCleanup = () => {
    void cleanupExpiredSocialUploads().catch((error: unknown) => {
      console.warn('Image upload cleanup could not query expired reservations.', error instanceof Error ? error.message : 'Unknown database error');
    });
  };
  const timer = setInterval(runCleanup, cleanupIntervalMs);
  timer.unref();
  runCleanup();
  return timer;
}
