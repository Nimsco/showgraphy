import { Schema, model } from 'mongoose';

const listShareSchema = new Schema({
  listId: { type: Schema.Types.ObjectId, ref: 'UserList', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date },
  revokedAt: { type: Date },
}, { timestamps: true, versionKey: false });

export const ListShare = model('ListShare', listShareSchema);
