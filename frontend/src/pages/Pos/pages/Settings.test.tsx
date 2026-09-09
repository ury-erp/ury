import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import Settings from './Settings';

vi.mock('../i18n', () => ({
  t: (key: string, params?: any) => {
    const translations: Record<string, string> = {
      'settings.title': 'Settings',
      'settings.end_of_day': 'End of Day',
      'settings.coming_soon': 'More settings coming soon',
    };
    return translations[key] || key;
  },
}));

vi.mock('../components/POSCloseFlow', () => ({
  default: () => <div data-testid="pos-close-flow">POS Close Flow</div>,
}));

vi.mock('@ury/ui', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div data-testid="card-content" className={className}>{children}</div>,
}));

describe('Settings', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the settings page', () => {
    render(<Settings />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('displays the settings title', () => {
    render(<Settings />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('displays the end of day section heading', () => {
    render(<Settings />);
    expect(screen.getByText('End of Day')).toBeInTheDocument();
  });

  it('renders POSCloseFlow component', () => {
    render(<Settings />);
    expect(screen.getByTestId('pos-close-flow')).toBeInTheDocument();
  });

  it('displays coming soon message', () => {
    render(<Settings />);
    expect(screen.getByText('More settings coming soon')).toBeInTheDocument();
  });

  it('has proper layout structure', () => {
    const { container } = render(<Settings />);
    const mainDiv = container.querySelector('.h-full.overflow-y-auto.p-6.bg-muted');
    expect(mainDiv).toBeInTheDocument();
  });

  it('contains a card component', () => {
    render(<Settings />);
    const cards = screen.getAllByTestId('card');
    expect(cards.length).toBeGreaterThan(0);
  });
});
