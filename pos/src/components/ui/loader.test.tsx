import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loader from './loader';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

describe('Loader', () => {
  it('renders with default message from i18n', () => {
    render(<Loader />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders with custom message prop', () => {
    render(<Loader message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('contains an SVG spinner', () => {
    const { container } = render(<Loader />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  it('displays message text', () => {
    render(<Loader message="Please wait" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
  });

  it('message has role="status"', () => {
    render(<Loader message="Loading" />);
    const message = screen.getByText('Loading');
    expect(message).toHaveAttribute('role', 'status');
  });

  it('message has aria-live="polite"', () => {
    render(<Loader message="Loading" />);
    const message = screen.getByText('Loading');
    expect(message).toHaveAttribute('aria-live', 'polite');
  });

  it('applies correct CSS classes to container', () => {
    const { container } = render(<Loader />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('flex-col');
    expect(wrapper.className).toContain('items-center');
  });

  it('applies correct CSS classes to SVG', () => {
    const { container } = render(<Loader />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseValue ?? svg?.getAttribute('class')).toContain('animate-spin');
  });

  it('SVG has correct dimension classes', () => {
    const { container } = render(<Loader />);
    const svg = container.querySelector('svg');
    const classValue = svg?.className.baseValue ?? svg?.getAttribute('class') ?? '';
    expect(classValue).toContain('h-8');
    expect(classValue).toContain('w-8');
  });

  it('renders circle inside SVG', () => {
    const { container } = render(<Loader />);
    const circle = container.querySelector('svg circle');
    expect(circle).toBeInTheDocument();
  });

  it('renders path inside SVG', () => {
    const { container } = render(<Loader />);
    const path = container.querySelector('svg path');
    expect(path).toBeInTheDocument();
  });

  it('message span has text-gray-600 class', () => {
    render(<Loader message="Loading" />);
    const message = screen.getByText('Loading');
    expect(message.className).toContain('text-gray-600');
  });

  it('SVG has text-blue-600 class', () => {
    const { container } = render(<Loader />);
    const svg = container.querySelector('svg');
    const classValue = svg?.className.baseValue ?? svg?.getAttribute('class') ?? '';
    expect(classValue).toContain('text-blue-600');
  });

  it('custom message overrides default i18n message', () => {
    render(<Loader message="Custom" />);
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });
});
