import { Schema, model } from 'mongoose';

const titleReviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  titleId: { type: Schema.Types.ObjectId, ref: 'MediaTitle', required: true },
  body: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
}, { timestamps: true, versionKey: false });

titleReviewSchema.index({ titleId: 1, createdAt: -1 });
titleReviewSchema.index({ userId: 1, createdAt: -1 });
export const TitleReview = model('TitleReview', titleReviewSchema);
