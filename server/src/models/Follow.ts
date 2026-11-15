import { Schema, model } from 'mongoose';

const schema = new Schema({
  follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  following: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ follower: 1, following: 1 }, { unique: true });
schema.index({ following: 1, createdAt: -1 });
schema.index({ follower: 1, createdAt: -1 });
export const Follow = model('Follow', schema);
