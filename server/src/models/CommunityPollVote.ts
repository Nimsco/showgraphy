import { Schema, model } from 'mongoose';

const schema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  optionIndex: { type: Number, min: 0, max: 5, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

schema.index({ post: 1, user: 1 }, { unique: true });
schema.index({ post: 1, optionIndex: 1 });
export const CommunityPollVote = model('CommunityPollVote', schema);
