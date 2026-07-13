import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders with default variant and size', () => {
    render(<Badge>Default Badge</Badge>);
    const badge = screen.getByText('Default Badge');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('DIV');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Badge</Badge>);
    const badge = screen.getByText('Badge');
    expect(badge.className).toContain('custom-class');
  });

  it('renders default variant with correct classes', () => {
    const { container } = render(<Badge variant="default">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-primary');
    expect(badge.className).toContain('text-primary-foreground');
  });

  it('renders secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-secondary');
    expect(badge.className).toContain('text-secondary-foreground');
  });

  it('renders destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-destructive');
    expect(badge.className).toContain('text-destructive-foreground');
  });

  it('renders outline variant', () => {
    const { container } = render(<Badge variant="outline">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('text-foreground');
  });

  it('renders success variant', () => {
    const { container } = render(<Badge variant="success">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders warning variant', () => {
    const { container } = render(<Badge variant="warning">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-orange-100');
    expect(badge.className).toContain('text-orange-800');
  });

  it('renders danger variant', () => {
    const { container } = render(<Badge variant="danger">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('renders info variant', () => {
    const { container } = render(<Badge variant="info">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-800');
  });

  it('renders pending variant', () => {
    const { container } = render(<Badge variant="pending">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-800');
  });

  it('renders completed variant', () => {
    const { container } = render(<Badge variant="completed">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('renders cancelled variant', () => {
    const { container } = render(<Badge variant="cancelled">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-800');
  });

  it('renders default size with correct classes', () => {
    const { container } = render(<Badge size="default">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('px-2.5');
    expect(badge.className).toContain('py-0.5');
  });

  it('renders sm size with correct classes', () => {
    const { container } = render(<Badge size="sm">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('px-2');
  });

  it('renders lg size with correct classes', () => {
    const { container } = render(<Badge size="lg">Badge</Badge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('px-3');
    expect(badge.className).toContain('py-1');
    expect(badge.className).toContain('text-sm');
  });

  it('spreads additional HTML div attributes', () => {
    render(<Badge data-testid="test-badge" aria-label="test">Badge</Badge>);
    const badge = screen.getByTestId('test-badge');
    expect(badge).toHaveAttribute('aria-label', 'test');
  });

  it('renders as a div element', () => {
    const { container } = render(<Badge>Badge</Badge>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('exports badgeVariants as a function', () => {
    expect(typeof badgeVariants).toBe('function');
  });

  it('badgeVariants returns base class names with no arguments', () => {
    const result = badgeVariants();
    expect(result).toContain('inline-flex');
    expect(result).toContain('rounded-full');
  });
});
