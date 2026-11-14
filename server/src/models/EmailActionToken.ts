import { Schema, model } from 'mongoose';

const emailActionTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  action: { type: String, enum: ['verify-email', 'password-reset'], required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

emailActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailActionTokenSchema.index({ userId: 1, action: 1, consumedAt: 1 });
export const EmailActionToken = model('EmailActionToken', emailActionTokenSchema);
