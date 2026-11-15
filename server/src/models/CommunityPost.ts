import { Schema, model } from 'mongoose';

const referenceSchema = new Schema({
  titleId: { type: Schema.Types.ObjectId, ref: 'MediaTitle', required: true },
  title: { type: String, required: true, maxlength: 180 },
  poster: { type: String, default: '' },
  mediaType: { type: String, enum: ['movie', 'series'], required: true },
  releaseDate: { type: Date },
}, { _id: false });

const pollSchema = new Schema({
  question: { type: String, trim: true, maxlength: 180, required: true },
  options: [{ type: String, trim: true, maxlength: 80 }],
  expiresAt: { type: Date },
}, { _id: false });

const imageSchema = new Schema({
  publicId: { type: String, required: true, maxlength: 220 },
  secureUrl: { type: String, required: true, maxlength: 700 },
  version: { type: Number, required: true, min: 1 },
  width: { type: Number, required: true, min: 1, max: 12000 },
  height: { type: Number, required: true, min: 1, max: 12000 },
  format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
  bytes: { type: Number, required: true, min: 1, max: 8 * 1024 * 1024 },
}, { _id: false });

const postSchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, required: true, minlength: 1, maxlength: 180 },
  content: { type: String, trim: true, maxlength: 4000, default: '' },
  category: { type: String, enum: ['discussion', 'question', 'recommendation', 'general'], default: 'general' },
  mediaReferences: { type: [referenceSchema], default: [] },
  images: { type: [imageSchema], default: [] },
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  containsSpoilers: { type: Boolean, default: false },
  spoilerDescription: { type: String, trim: true, maxlength: 120, default: '' },
  poll: { type: pollSchema, default: undefined },
  likeCount: { type: Number, min: 0, default: 0 },
  commentCount: { type: Number, min: 0, default: 0 },
  bookmarkCount: { type: Number, min: 0, default: 0 },
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ 'mediaReferences.titleId': 1, createdAt: -1 });
postSchema.index({ 'images.publicId': 1 }, { unique: true, sparse: true });
postSchema.index({ content: 'text' });
export const CommunityPost = model('CommunityPost', postSchema);
