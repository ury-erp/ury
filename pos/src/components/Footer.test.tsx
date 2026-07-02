import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to, className, ...props }: any) => {
    const isActive = to === '/';
    const cn = typeof className === 'function' ? className({ isActive }) : className;
    return (
      <a href={to} className={cn} {...props}>
        {typeof children === 'function' ? children({ isActive }) : children}
      </a>
    );
  },
}));

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the footer container', () => {
    render(<Footer />);
    const footer = screen.getByRole('navigation').parentElement!;
    expect(footer.className).toContain('bg-white');
  });

  it('renders all navigation items', () => {
    render(<Footer />);
    expect(screen.getByText('footer.pos')).toBeInTheDocument();
    expect(screen.getByText('footer.table')).toBeInTheDocument();
    expect(screen.getByText('footer.orders')).toBeInTheDocument();
    expect(screen.getByText('footer.dashboard')).toBeInTheDocument();
    expect(screen.getByText('footer.menu')).toBeInTheDocument();
    expect(screen.getByText('footer.reports')).toBeInTheDocument();
  });

  it('renders correct navigation links', () => {
    render(<Footer />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveAttribute('href', '/table');
    expect(links[2]).toHaveAttribute('href', '/orders');
    expect(links[3]).toHaveAttribute('href', '/dashboard');
    expect(links[4]).toHaveAttribute('href', '/menu-management');
    expect(links[5]).toHaveAttribute('href', '/reports');
  });

  it('applies active style to the current route link', () => {
    render(<Footer />);
    const posLink = screen.getByText('footer.pos').closest('a')!;
    expect(posLink.className).toContain('text-blue-600');
  });
});
