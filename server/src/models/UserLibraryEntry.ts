import { Schema, model } from 'mongoose';

const libraryEntrySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  titleId: { type: Schema.Types.ObjectId, ref: 'MediaTitle', required: true },
  status: { type: String, enum: ['completed', 'watching', 'planned', 'on-hold', 'dropped'], required: true, default: 'planned' },
  episodesWatched: { type: Number, min: 0, default: 0 },
  seasonsWatched: { type: Number, min: 0, default: 0 },
  personalRating: { type: Number, min: 0, max: 10, validate: { validator: (value: number) => value === 0 || Number.isInteger(value * 2), message: 'Choose a rating in half-point steps.' } },
  notes: { type: String, maxlength: 2000, default: '' },
  startedAt: { type: Date },
  completedAt: { type: Date },
  rewatchCount: { type: Number, min: 0, default: 0 },
}, { timestamps: true, versionKey: false });

libraryEntrySchema.index({ userId: 1, titleId: 1 }, { unique: true });
libraryEntrySchema.index({ userId: 1, status: 1, updatedAt: -1 });
libraryEntrySchema.index({ userId: 1, status: 1, completedAt: -1, updatedAt: -1 });
export const UserLibraryEntry = model('UserLibraryEntry', libraryEntrySchema);
