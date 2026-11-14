import { env } from './env.js';

const allowedOrigins = new Set([
  ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  env.FRONTEND_URL,
  env.CLIENT_URL,
].map((value) => {
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

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const normalized = new URL(origin).origin;
    return allowedOrigins.has(normalized) || isLocalDevelopmentOrigin(normalized);
  } catch { return false; }
}

export function isApiOriginAllowed(origin: string | undefined): boolean {
  return !origin || isOriginAllowed(origin);
}
