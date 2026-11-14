import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) throw new Error('MongoDB is required. Set MONGODB_URI in server/.env.');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.info('Showgraphy connected to MongoDB');
}
