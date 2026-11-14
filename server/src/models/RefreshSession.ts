import { Schema, model } from 'mongoose';

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true },
  jti: { type: String, required: true, unique: true },
  sessionFamilyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  replacedBy: { type: String },
  userAgent: { type: String, maxlength: 320 },
  ipAddress: { type: String, maxlength: 64 },
  lastUsedAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSession = model('RefreshSession', refreshSessionSchema);
