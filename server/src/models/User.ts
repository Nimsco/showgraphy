import { Schema, model, type InferSchemaType } from 'mongoose';

const privacySchema = new Schema({
  showStats: { type: Boolean, default: true },
  showLists: { type: Boolean, default: true },
  showRatings: { type: Boolean, default: true },
  showActivity: { type: Boolean, default: true },
  showFavorites: { type: Boolean, default: true },
  allowMessageRequests: { type: Boolean, default: true },
}, { _id: false });

const userSchema = new Schema({
  username: { type: String, required: true, lowercase: true, trim: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/ },
  usernameSetupRequired: { type: Boolean, default: false },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, select: false },
  googleSub: { type: String, sparse: true, unique: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 280 },
  emailVerified: { type: Boolean, default: false },
  accountStatus: { type: String, enum: ['active', 'disabled'], default: 'active' },
  profileVisibility: { type: String, enum: ['public', 'private'], default: 'public' },
  privacySettings: { type: privacySchema, default: () => ({}) },
  themePreference: { type: String, enum: ['dark', 'light', 'ocean', 'forest', 'rose', 'sunset', 'ocean-light', 'sage-light', 'rose-light', 'sunset-light', 'system'], default: 'dark' },
  textSizePreference: { type: String, enum: ['small', 'default', 'large'], default: 'default' },
  favoriteTitleIds: [{ type: Schema.Types.ObjectId, ref: 'MediaTitle' }],
}, { timestamps: true, versionKey: false });

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.passwordHash; delete ret.googleSub; return ret; } });

export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
