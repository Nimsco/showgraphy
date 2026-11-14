function resolveApiBase() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  // Production is served by Vercel's same-origin /api rewrite. Keeping auth
  // requests same-origin is required for the refresh cookie to be sent.
  if (import.meta.env.PROD) return '/api';
  if (typeof window === 'undefined') return configured || '/api';
  if (!configured) return '/api';
  const pageHost = window.location.hostname;
  try {
    const base = new URL(configured);
    const localApiHost = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (import.meta.env.DEV && localApiHost) return '/api';
    const pageIsRemote = !['localhost', '127.0.0.1', '[::1]'].includes(pageHost);
    if (localApiHost && pageIsRemote) base.hostname = pageHost;
    return base.toString().replace(/\/$/, '');
  } catch { return configured; }
}

const apiBase = resolveApiBase();
let accessToken: string | null = null;
let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;
let refreshPromise: Promise<boolean> | null = null;
let sessionRestorePromise: Promise<{ accessToken: string; user: import('../types/index.js').User }> | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function logApiFailure(method: string, endpoint: string, status: number | null, reason: string) {
  console.warn('[Showgraphy API failure]', { method, endpoint: endpoint.split('?')[0], status, reason });
}

export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }

async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = (async () => {
      const response = await fetch(`${apiBase}/auth/csrf`, { credentials: 'include' });
      if (!response.ok) throw new ApiError(response.status, 'Security token could not be created. Refresh and try again.');
      const body = await response.json() as { csrfToken: string };
      csrfToken = body.csrfToken;
      return csrfToken;
    })().finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
}

function csrfCookie(): string | null {
  const entry = document.cookie.split('; ').find((part) => part.startsWith('sg_csrf='));
  return entry ? decodeURIComponent(entry.slice('sg_csrf='.length)) : null;
}

async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('showgraphy-refresh-token', work) : work();
}

async function rotateAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rotate = async () => {
      try {
        await getCsrf();
        const csrf = csrfCookie() || csrfToken;
        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST', credentials: 'include', headers: csrf ? { 'x-csrf-token': csrf } : {},
        });
        if (!response.ok) {
          logApiFailure('POST', '/auth/refresh', response.status, response.status === 401 ? 'refresh token missing, expired, or revoked' : `HTTP ${response.status}`);
          return false;
        }
        const result = await response.json() as { accessToken: string };
        accessToken = result.accessToken;
        return true;
      } catch (error) {
        logApiFailure('POST', '/auth/refresh', null, error instanceof Error ? error.name : 'network failure');
        return false;
      }
    };
    try {
      // Refresh cookies are shared between tabs. Serialize rotation so a second
      // tab cannot reuse the token another tab has just revoked.
      return await withRefreshLock(rotate);
    } catch (error) {
      logApiFailure('POST', '/auth/refresh', null, error instanceof Error ? error.name : 'refresh lock failure');
      return false;
    }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await getCsrf();
    const csrf = csrfCookie() || csrfToken;
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  const makeRequest = async () => {
    try { return await fetch(`${apiBase}${path}`, { ...init, method, headers, credentials: 'include' }); }
    catch (error) {
      logApiFailure(method, path, null, error instanceof Error ? error.name : 'network failure');
      throw error;
    }
  };
  let response = await makeRequest();
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await rotateAccessToken()) {
      headers.set('authorization', `Bearer ${accessToken}`);
      response = await makeRequest();
    }
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    logApiFailure(method, path, response.status, body.message || `HTTP ${response.status}`);
    throw new ApiError(response.status, body.message || 'The request could not be completed.');
  }
  return body as T;
}

export async function restoreSession() {
  if (!sessionRestorePromise) {
    sessionRestorePromise = (async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await getCsrf();
          return await withRefreshLock(async () => {
            await getCsrf();
            return apiRequest<{ accessToken: string; user: import('../types/index.js').User }>('/auth/refresh', { method: 'POST' });
          });
        } catch (error) {
          const retryable = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
          if (!retryable || attempt >= 4) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 8_000)));
        }
      }
    })().finally(() => { sessionRestorePromise = null; });
  }
  return sessionRestorePromise;
}

export function getApiBase() { return apiBase; }
