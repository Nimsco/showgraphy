import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  APP_NAME: z.string().default('Showgraphy'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('10m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('showgraphy'),
  JWT_AUDIENCE: z.string().default('showgraphy-client'),
  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  CSRF_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/auth/google/callback'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().default('false').transform((value) => value === 'true'),
  TMDB_API_KEY: z.string().optional(),
  TMDB_READ_ACCESS_TOKEN: z.string().optional(),
  ANILIST_GRAPHQL_URL: z.string().default('https://graphql.anilist.co'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid server environment: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
}

export const env = parsed.data;

export function assertRuntimeConfig(): void {
  const missing: string[] = [];
  if (!env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) missing.push('JWT_ACCESS_SECRET (at least 32 characters)');
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) missing.push('JWT_REFRESH_SECRET (at least 32 characters)');
  if (!env.CSRF_SECRET || env.CSRF_SECRET.length < 32) missing.push('CSRF_SECRET (at least 32 characters)');
  if (missing.length) {
    throw new Error(`Required server configuration is missing or too short: ${missing.join(', ')}. Copy server/.env.example and fill these values.`);
  }
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production. Serve the app over HTTPS.');
  }
}
