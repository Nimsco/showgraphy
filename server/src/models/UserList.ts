import { Schema, model } from 'mongoose';

const listItemSchema = new Schema({
  titleId: { type: Schema.Types.ObjectId, ref: 'MediaTitle', required: true },
  addedAt: { type: Date, default: Date.now },
  position: { type: Number, default: 0 },
}, { _id: false });

const userListSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 70 },
  description: { type: String, maxlength: 280, default: '' },
  coverImage: { type: String, default: '' },
  visibility: { type: String, enum: ['public', 'private'], default: 'private' },
  listType: { type: String, enum: ['watchlist', 'custom', 'favorites'], default: 'custom' },
  orderedItems: { type: [listItemSchema], default: [] },
}, { timestamps: true, versionKey: false });

userListSchema.index({ userId: 1, slug: 1 }, { unique: true });
export const UserList = model('UserList', userListSchema);
