const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
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

async function rotateAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      await getCsrf();
      const csrf = csrfCookie() || csrfToken;
      const response = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST', credentials: 'include', headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!response.ok) return false;
      const result = await response.json() as { accessToken: string };
      accessToken = result.accessToken;
      return true;
    } catch { return false; }
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
  const makeRequest = () => fetch(`${apiBase}${path}`, { ...init, method, headers, credentials: 'include' });
  let response = await makeRequest();
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await rotateAccessToken()) {
      headers.set('authorization', `Bearer ${accessToken}`);
      response = await makeRequest();
    }
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new ApiError(response.status, body.message || 'The request could not be completed.');
  return body as T;
}

export async function restoreSession() {
  if (!sessionRestorePromise) {
    sessionRestorePromise = (async () => {
      await getCsrf();
      return apiRequest<{ accessToken: string; user: import('../types/index.js').User }>('/auth/refresh', { method: 'POST' });
    })().finally(() => { sessionRestorePromise = null; });
  }
  return sessionRestorePromise;
}

export function getApiBase() { return apiBase; }
