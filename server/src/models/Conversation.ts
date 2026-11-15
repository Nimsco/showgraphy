import { Schema, model } from 'mongoose';

const participantState = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt: { type: Date, default: null },
}, { _id: false });
const schema = new Schema({
  participants: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true, validate: (ids: unknown[]) => ids.length === 2 && new Set(ids.map(String)).size === 2 },
  pairKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'accepted', required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastMessage: { type: Schema.Types.ObjectId, ref: 'DirectMessage', default: null },
  lastMessageAt: { type: Date, default: null },
  participantState: { type: [participantState], default: [] },
}, { timestamps: true, versionKey: false });
schema.index({ participants: 1, lastMessageAt: -1 });
export const Conversation = model('Conversation', schema);
