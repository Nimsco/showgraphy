import { Schema, model } from 'mongoose';

const reservationSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  publicId: { type: String, required: true, maxlength: 220 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

reservationSchema.index({ publicId: 1 }, { unique: true });
reservationSchema.index({ expiresAt: 1 });

export const CommunityUploadReservation = model('CommunityUploadReservation', reservationSchema);
