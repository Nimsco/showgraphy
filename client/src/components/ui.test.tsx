import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './ui';

describe('EmptyState', () => {
  it('announces a helpful empty state and its next action', () => {
    render(<EmptyState title="Your library is waiting" description="Find a title to begin." action={<a href="/app/discover">Find a title</a>} />);
    expect(screen.getByRole('heading', { name: 'Your library is waiting' })).toBeInTheDocument();
    expect(screen.getByText('Find a title to begin.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a title' })).toHaveAttribute('href', '/app/discover');
  });
});
