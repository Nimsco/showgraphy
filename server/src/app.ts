import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { csrfProtection } from './middleware/csrf.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter, ratingRouter } from './routes/catalog.routes.js';
import { libraryRouter, statsRouter } from './routes/library.routes.js';
import { listsRouter, sharesRouter } from './routes/lists.routes.js';
import { usersRouter } from './routes/user.routes.js';
import { errorHandler } from './utils/http.js';

export const app = express();
const allowedOrigins = new Set([...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()), env.FRONTEND_URL, env.CLIENT_URL].map((value) => {
  try { return new URL(value).origin; } catch { return value.replace(/\/$/, ''); }
}).filter(Boolean));

function isLocalDevelopmentOrigin(value: string): boolean {
  if (env.NODE_ENV === 'production') return false;
  try {
    const origin = new URL(value);
    if (origin.protocol !== 'http:') return false;
    const host = origin.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (/^[a-z0-9-]+$/.test(host)) return true;
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return first === 10
      || first === 192 && second === 168
      || first === 172 && second >= 16 && second <= 31
      || first === 169 && second === 254;
  } catch { return false; }
}

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || isLocalDevelopmentOrigin(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api', csrfProtection);

app.get('/api/health', (_request, response) => response.json({ status: 'ok', app: env.APP_NAME }));
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/titles', ratingRouter);
app.use('/api/library', libraryRouter);
app.use('/api/lists', listsRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);

app.use(errorHandler);
