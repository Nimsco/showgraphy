import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

describe('application entry point', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the public landing UI without waiting on the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const csrf = String(input).endsWith('/auth/csrf');
      return new Response(JSON.stringify(csrf ? { csrfToken: 'test-csrf' } : { message: 'Sign in to continue.' }), { status: csrf ? 200 : 401, headers: { 'content-type': 'application/json' } });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><AuthProvider><ThemeProvider><App /></ThemeProvider></AuthProvider></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /your life.*in titles/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /build your watchline/i })).toHaveAttribute('href', '/register');
  });
});
