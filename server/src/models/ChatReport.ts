import { Schema, model } from 'mongoose';

const chatReportSchema = new Schema({
  messageId: { type: Schema.Types.ObjectId, ref: 'ChatMessage', required: true },
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['spam', 'harassment', 'hate-speech', 'other'], required: true },
  details: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
}, { timestamps: true, versionKey: false });

chatReportSchema.index({ messageId: 1, reporterId: 1 }, { unique: true });
chatReportSchema.index({ status: 1, createdAt: -1 });

export const ChatReport = model('ChatReport', chatReportSchema);
