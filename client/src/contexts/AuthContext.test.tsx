import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { restoreSession, setAccessToken, apiRequest, ApiError } = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  setAccessToken: vi.fn(),
  apiRequest: vi.fn(),
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));

vi.mock('../lib/api', () => ({ restoreSession, setAccessToken, apiRequest, ApiError }));

import { AuthProvider, useAuth } from './AuthContext';

function AuthState() {
  const auth = useAuth();
  return <div>
    <span>{auth.ready ? 'ready' : 'loading'}</span>
    <span>{auth.user?.username ?? 'no user'}</span>
    {auth.restoreError && <p role="alert">{auth.restoreError}</p>}
    <button onClick={() => void auth.retryRestore()}>Retry restore</button>
  </div>;
}

beforeEach(() => { cleanup(); vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('AuthProvider restore behavior', () => {
  it('does not turn a temporary network error into a sign-out and supports retry', async () => {
    restoreSession
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ accessToken: 'restored-token', user: { id: 'u1', username: 'viewer' } });
    render(<AuthProvider><AuthState /></AuthProvider>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/saved sign-in may still be active/i);
    expect(screen.getByText('no user')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry restore/i })); });
    expect(await screen.findByText('viewer')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(setAccessToken).toHaveBeenCalledWith('restored-token');
  });

  it('treats a definitive 401 as an expired or missing sign-in', async () => {
    restoreSession.mockRejectedValueOnce(new ApiError(401, 'Sign in to continue.'));
    render(<AuthProvider><AuthState /></AuthProvider>);

    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(screen.getByText('no user')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a retry path when the backend returns a temporary server error', async () => {
    restoreSession.mockRejectedValueOnce(new ApiError(503, 'waking'));
    render(<AuthProvider><AuthState /></AuthProvider>);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
    expect(screen.getByText('no user')).toBeInTheDocument();
  });
});
