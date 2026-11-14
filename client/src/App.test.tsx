import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

describe('application entry point', () => {
  it('renders the public landing UI without waiting on the API', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><AuthProvider><ThemeProvider><App /></ThemeProvider></AuthProvider></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /your life.*in titles/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /build your watchline/i })).toHaveAttribute('href', '/register');
  });
});
