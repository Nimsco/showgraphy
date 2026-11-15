import { Schema, model } from 'mongoose';

const schema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['follow', 'message_request', 'request_accepted', 'post_like', 'post_comment', 'comment_reply', 'mention', 'poll_vote'], required: true },
  resourceId: { type: Schema.Types.ObjectId, default: null },
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ recipient: 1, createdAt: -1 });
schema.index({ recipient: 1, readAt: 1 });
schema.index({ recipient: 1, actor: 1, type: 1, resourceId: 1 }, { unique: true });
export const Notification = model('Notification', schema);
