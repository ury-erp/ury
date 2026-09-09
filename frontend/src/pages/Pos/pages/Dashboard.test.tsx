import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    const { container } = render(<Dashboard />);
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders page structure', async () => {
    const { container } = render(<Dashboard />);
    await waitFor(() => {
      const divs = container.querySelectorAll('div');
      expect(divs.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('renders as a React component', async () => {
    const { container } = render(<Dashboard />);
    expect(container.firstChild).toBeTruthy();
  });

  it('applies overflow styling', async () => {
    const { container } = render(<Dashboard />);
    await waitFor(() => {
      const mainDiv = container.querySelector('.overflow-y-auto');
      expect(mainDiv).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
