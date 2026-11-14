import { Schema, model } from 'mongoose';

const mediaTitleSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  originalTitle: { type: String, trim: true, maxlength: 180 },
  alternativeTitles: [{ type: String, maxlength: 180 }],
  mediaType: { type: String, enum: ['movie', 'series'], required: true, index: true },
  formats: [{ type: String, trim: true, maxlength: 40 }],
  categories: [{ type: String, trim: true, lowercase: true, maxlength: 40, index: true }],
  countries: [{ type: String, maxlength: 80 }],
  languages: [{ type: String, maxlength: 80 }],
  genres: [{ type: String, maxlength: 50 }],
  synopsis: { type: String, maxlength: 5000, default: '' },
  poster: { type: String, default: '' },
  backdrop: { type: String, default: '' },
  releaseDate: { type: Date },
  runtime: { type: Number, min: 0 },
  seasons: { type: Number, min: 0 },
  totalEpisodes: { type: Number, min: 0 },
  providerIds: { tmdb: String, anilist: String },
  tmdbRating: { type: Number, min: 0, max: 10 },
  tmdbVoteCount: { type: Number, min: 0 },
  anilistAverageScore: { type: Number, min: 0, max: 100 },
  anilistMeanScore: { type: Number, min: 0, max: 100 },
  anilistPopularity: { type: Number, min: 0 },
  ratingsCheckedAt: { type: Date },
  communityRating: { type: Number, min: 0, max: 10, default: 0 },
  communityRatingCount: { type: Number, min: 0, default: 0 },
  metadataSource: { type: String, enum: ['manual', 'tmdb', 'anilist', 'combined'], default: 'manual' },
  metadataCheckedAt: { type: Date },
}, { timestamps: true, versionKey: false });

mediaTitleSchema.index({ title: 'text', originalTitle: 'text', alternativeTitles: 'text' }, { weights: { title: 5, originalTitle: 4, alternativeTitles: 2 } });
mediaTitleSchema.index({ 'providerIds.tmdb': 1 }, { unique: true, sparse: true });
mediaTitleSchema.index({ 'providerIds.anilist': 1 }, { unique: true, sparse: true });
export const MediaTitle = model('MediaTitle', mediaTitleSchema);
