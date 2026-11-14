import { Schema, model } from 'mongoose';

const communityRatingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  titleId: { type: Schema.Types.ObjectId, ref: 'MediaTitle', required: true },
  rating: { type: Number, required: true, min: 1, max: 10 },
}, { timestamps: true, versionKey: false });

communityRatingSchema.index({ userId: 1, titleId: 1 }, { unique: true });
communityRatingSchema.index({ titleId: 1 });
export const CommunityRating = model('CommunityRating', communityRatingSchema);
