import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the current lifecycle state', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('running')).toHaveClass('status-running');
  });
});
