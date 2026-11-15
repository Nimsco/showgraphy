import { Schema, model } from 'mongoose';

const schema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parentComment: { type: Schema.Types.ObjectId, ref: 'CommunityComment', default: null },
  content: { type: String, trim: true, required: true, maxlength: 2000 },
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  editedAt: { type: Date },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ post: 1, parentComment: 1, createdAt: 1, _id: 1 });
schema.index({ author: 1, createdAt: -1 });
export const CommunityComment = model('CommunityComment', schema);
