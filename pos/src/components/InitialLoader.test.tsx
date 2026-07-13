import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InitialLoader from './InitialLoader';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock Spinner
vi.mock('./ui/spinner', () => ({
  Spinner: ({ className, message }: any) => (
    <div data-testid="spinner" className={className}>
      {message || 'Loading'}
    </div>
  ),
}));

describe('InitialLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loader container', () => {
    render(<InitialLoader />);
    const container = screen.getByTestId('spinner').parentElement!.parentElement!;
    expect(container.className).toContain('fixed');
    expect(container.className).toContain('bg-white');
  });

  it('renders the spinner', () => {
    render(<InitialLoader />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders the loading text', () => {
    render(<InitialLoader />);
    expect(screen.getByText('common.loading_ury_pos')).toBeInTheDocument();
  });

  it('renders the please wait text', () => {
    render(<InitialLoader />);
    expect(screen.getByText('common.please_wait_setup')).toBeInTheDocument();
  });

  it('applies w-12 h-12 className to spinner', () => {
    render(<InitialLoader />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner.className).toContain('w-12');
    expect(spinner.className).toContain('h-12');
  });

  it('renders centered content', () => {
    render(<InitialLoader />);
    const textCenter = screen.getByText('common.loading_ury_pos').closest('.text-center')!;
    expect(textCenter).toBeInTheDocument();
  });

  it('covers the full screen', () => {
    render(<InitialLoader />);
    const overlay = screen.getByTestId('spinner').closest('.fixed')!;
    expect(overlay.className).toContain('inset-0');
  });
});
