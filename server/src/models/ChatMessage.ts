import { Schema, model } from 'mongoose';

const chatMessageSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientMessageId: { type: String, required: true, maxlength: 36 },
  username: { type: String, required: true, maxlength: 24 },
  avatar: { type: String, default: '', maxlength: 500 },
  text: { type: String, required: true, maxlength: 1000 },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

chatMessageSchema.index({ authorId: 1, clientMessageId: 1 }, { unique: true });
chatMessageSchema.index({ createdAt: -1, _id: -1 });

export const ChatMessage = model('ChatMessage', chatMessageSchema);
