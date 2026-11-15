import { Schema, model } from 'mongoose';

const schema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'DirectMessage', default: null },
  postId: { type: Schema.Types.ObjectId, ref: 'CommunityPost', default: null },
  commentId: { type: Schema.Types.ObjectId, ref: 'CommunityComment', default: null },
  reason: { type: String, enum: ['spam', 'harassment', 'hate-speech', 'inappropriate-content', 'unmarked-spoiler', 'other'], required: true },
  details: { type: String, maxlength: 500, default: '' },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
}, { timestamps: { createdAt: true, updatedAt: true }, versionKey: false });
schema.index({ reporter: 1, createdAt: -1 });
schema.index({ reporter: 1, postId: 1 }, { unique: true, partialFilterExpression: { postId: { $type: 'objectId' } } });
schema.index({ reporter: 1, commentId: 1 }, { unique: true, partialFilterExpression: { commentId: { $type: 'objectId' } } });
export const SocialReport = model('SocialReport', schema);
