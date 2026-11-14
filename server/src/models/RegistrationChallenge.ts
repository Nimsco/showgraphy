import { Schema, model } from 'mongoose';

const registrationChallengeSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

registrationChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RegistrationChallenge = model('RegistrationChallenge', registrationChallengeSchema);
