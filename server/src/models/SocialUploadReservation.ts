import { Schema, model } from 'mongoose';

const schema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['message', 'avatar'], required: true },
  publicId: { type: String, required: true, maxlength: 220 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

schema.index({ publicId: 1 }, { unique: true });
schema.index({ expiresAt: 1 });

export const SocialUploadReservation = model('SocialUploadReservation', schema);
