import { Schema, model } from 'mongoose';

const schema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  clientMessageId: { type: String, required: true, maxlength: 64 },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
schema.index({ conversationId: 1, createdAt: -1, _id: -1 });
export const DirectMessage = model('DirectMessage', schema);
