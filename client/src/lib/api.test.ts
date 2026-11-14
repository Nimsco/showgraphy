import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function freshApi() {
  vi.resetModules();
  return import('./api');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('API session handling', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('uses the same-origin Vercel API proxy in production even if a direct API URL is configured', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', 'https://showgraphy.onrender.com/api');
    const api = await freshApi();
    expect(api.getApiBase()).toBe('/api');
  });

  it('refreshes an expired access token and retries the original request', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ csrfToken: 'csrf' }))
      .mockResolvedValueOnce(json({ accessToken: 'fresh-access' }))
      .mockResolvedValueOnce(json({ items: [] }));
    const api = await freshApi();
    api.setAccessToken('expired-access');

    await expect(api.apiRequest('/stats')).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/auth/refresh');
    const retriedHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(retriedHeaders.get('authorization')).toBe('Bearer fresh-access');
  });

  it('surfaces a missing or expired refresh cookie as a definitive 401', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({ csrfToken: 'csrf' })).mockResolvedValueOnce(json({ message: 'Sign in to continue.' }, 401));
    const api = await freshApi();

    await expect(api.restoreSession()).rejects.toMatchObject({ status: 401 });
  });

  it('distinguishes an invalid refresh session from a temporary refresh network failure', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json({ csrfToken: 'csrf' })).mockResolvedValueOnce(json({ message: 'Sign in to continue.' }, 401));
    const unauthorizedApi = await freshApi();
    await expect(unauthorizedApi.refreshAccessTokenStatus()).resolves.toBe('unauthorized');

    fetchMock.mockReset().mockResolvedValueOnce(json({ csrfToken: 'csrf' })).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const temporaryFailureApi = await freshApi();
    temporaryFailureApi.setAccessToken('keep-current-session');
    await expect(temporaryFailureApi.refreshAccessTokenStatus()).resolves.toBe('retry');
    expect(temporaryFailureApi.getAccessToken()).toBe('keep-current-session');
  });

  it('retries a temporary network failure while restoring a session', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ csrfToken: 'csrf' }))
      .mockResolvedValueOnce(json({ accessToken: 'access', user: { id: 'u1' } }));
    const api = await freshApi();
    const restore = api.restoreSession();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(restore).resolves.toMatchObject({ accessToken: 'access' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries session restoration after an HTTP 429 rate-limit response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(json({ message: 'too many requests' }, 429))
      .mockResolvedValueOnce(json({ csrfToken: 'csrf' }))
      .mockResolvedValueOnce(json({ accessToken: 'access', user: { id: 'u1' } }));
    const api = await freshApi();
    const restore = api.restoreSession();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(restore).resolves.toMatchObject({ accessToken: 'access' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retains the exact HTTP status for Google config and rate-limit failures', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(json({ message: 'not found' }, 404))
      .mockResolvedValueOnce(json({ message: 'forbidden' }, 403))
      .mockResolvedValueOnce(json({ message: 'too many requests' }, 429))
      .mockResolvedValueOnce(json({ message: 'server error' }, 500));
    const api = await freshApi();

    for (const status of [404, 403, 429, 500]) {
      await expect(api.apiRequest('/auth/config')).rejects.toMatchObject({ status });
    }
  });

  it('distinguishes Google config network and HTTP failures for the UI', async () => {
    const { ApiError } = await freshApi();
    const { googleConfigErrorMessage } = await import('../pages/AuthPage');
    expect(googleConfigErrorMessage(new TypeError('Failed to fetch'))).toMatch(/could not connect/i);
    for (const status of [404, 401, 403, 429, 500, 502, 503, 504]) {
      expect(googleConfigErrorMessage(new ApiError(status, 'request failed'))).toContain(`HTTP ${status}`);
    }
  });
});
