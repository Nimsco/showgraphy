import { Schema, model } from 'mongoose';

const schema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'DirectMessage', default: null },
  reason: { type: String, enum: ['spam', 'harassment', 'hate-speech', 'other'], required: true },
  details: { type: String, maxlength: 500, default: '' },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
}, { timestamps: { createdAt: true, updatedAt: true }, versionKey: false });
schema.index({ reporter: 1, createdAt: -1 });
export const SocialReport = model('SocialReport', schema);
