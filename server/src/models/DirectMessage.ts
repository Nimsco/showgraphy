import { Schema, model } from 'mongoose';

const imageSchema = new Schema({
  publicId: { type: String, required: true, maxlength: 220 },
  secureUrl: { type: String, required: true, maxlength: 2048 },
  version: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  format: { type: String, required: true },
  bytes: { type: Number, required: true },
}, { _id: false });

const schema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '', trim: true, maxlength: 2000 },
  image: { type: imageSchema, default: null },
  clientMessageId: { type: String, required: true, maxlength: 64 },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
schema.pre('validate', function validateMessageContent() {
  if (!this.content?.trim() && !this.image) this.invalidate('content', 'A message needs text or an image.');
});
schema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
schema.index({ conversationId: 1, createdAt: -1, _id: -1 });
export const DirectMessage = model('DirectMessage', schema);
