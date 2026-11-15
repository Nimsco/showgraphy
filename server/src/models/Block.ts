import { Schema, model } from 'mongoose';

const schema = new Schema({
  blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  blockedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ blocker: 1, blockedUser: 1 }, { unique: true });
schema.index({ blockedUser: 1, blocker: 1 });
export const Block = model('Block', schema);
