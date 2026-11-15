import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { isApiOriginAllowed } from './config/origins.js';
import { csrfProtection } from './middleware/csrf.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter, ratingRouter } from './routes/catalog.routes.js';
import { libraryRouter, statsRouter } from './routes/library.routes.js';
import { listsRouter, sharesRouter } from './routes/lists.routes.js';
import { usersRouter } from './routes/user.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { socialRouter } from './routes/social.routes.js';
import { communityRouter } from './routes/community.routes.js';
import { errorHandler } from './utils/http.js';

export const app = express();
// Render sits behind one trusted edge proxy; use the originating client IP
// instead of counting every visitor against the proxy's shared address.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (isApiOriginAllowed(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth', (request, response, next) => {
  response.on('finish', () => {
    if (response.statusCode < 400) return;
    const status = response.statusCode;
    const reason = status === 401 ? 'authentication rejected' : status === 403 ? 'request forbidden or CSRF check failed' : status === 404 ? 'endpoint or resource not found' : status === 429 ? 'rate limit exceeded' : status >= 500 ? 'backend failure' : 'request rejected';
    console.warn('[Auth request failed]', { endpoint: request.path, method: request.method, status, reason });
  });
  next();
});
app.use('/api', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(env.RATE_LIMIT_MAX, 1000),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (request) => ['/api/health', '/api/auth/config', '/api/auth/csrf', '/api/auth/refresh'].includes(request.originalUrl.split('?')[0] ?? ''),
  handler: (request, response) => {
    console.warn('[API request rejected]', { endpoint: request.originalUrl.split('?')[0], method: request.method, status: 429, reason: 'rate limit exceeded' });
    response.status(429).json({ message: 'Too many requests. Try again shortly.' });
  },
}));
app.use('/api', csrfProtection);

app.get('/health', (_request, response) => response.status(200).type('text/plain').send(`${env.APP_NAME} API is healthy and running.`));
app.get('/api/health', (_request, response) => response.json({ status: 'ok', app: env.APP_NAME }));
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/titles', ratingRouter);
app.use('/api/library', libraryRouter);
app.use('/api/lists', listsRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/users', usersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/social', socialRouter);
app.use('/api/community', communityRouter);
app.use('/api/stats', statsRouter);

app.use(errorHandler);
