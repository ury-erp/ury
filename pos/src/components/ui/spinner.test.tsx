import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './spinner';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

describe('Spinner', () => {
  it('renders with default message from i18n', () => {
    render(<Spinner />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders with custom message prop', () => {
    render(<Spinner message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('hides message when hideMessage is true', () => {
    render(<Spinner hideMessage={true} />);
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
  });

  it('shows message by default (hideMessage is false)', () => {
    render(<Spinner />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('applies custom className to spinner div', () => {
    const { container } = render(<Spinner className="custom-spinner" />);
    const spinnerDiv = container.querySelector('.animate-spin');
    expect(spinnerDiv?.className).toContain('custom-spinner');
  });

  it('contains spinning animation div', () => {
    const { container } = render(<Spinner />);
    const spinnerDiv = container.querySelector('.animate-spin');
    expect(spinnerDiv).toBeInTheDocument();
  });

  it('spinning div has rounded-full class', () => {
    const { container } = render(<Spinner />);
    const spinnerDiv = container.querySelector('.animate-spin');
    expect(spinnerDiv?.className).toContain('rounded-full');
  });

  it('spinning div has border classes', () => {
    const { container } = render(<Spinner />);
    const spinnerDiv = container.querySelector('.animate-spin');
    expect(spinnerDiv?.className).toContain('border-t-2');
    expect(spinnerDiv?.className).toContain('border-b-2');
  });

  it('renders outer container with flex classes', () => {
    const { container } = render(<Spinner />);
    const outerDiv = container.firstElementChild as HTMLElement;
    expect(outerDiv.className).toContain('flex');
    expect(outerDiv.className).toContain('items-center');
    expect(outerDiv.className).toContain('justify-center');
  });

  it('message is rendered in a p tag', () => {
    render(<Spinner message="Loading" />);
    const message = screen.getByText('Loading');
    expect(message.tagName).toBe('P');
  });

  it('message has text-gray-600 class', () => {
    render(<Spinner message="Loading" />);
    const message = screen.getByText('Loading');
    expect(message.className).toContain('text-gray-600');
  });

  it('custom message overrides default i18n message', () => {
    render(<Spinner message="Custom" />);
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('hideMessage with custom message still hides the message', () => {
    render(<Spinner message="Custom" hideMessage={true} />);
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('Spinner is a named export (not default)', () => {
    // Verify that we can import Spinner as a named import
    expect(typeof Spinner).toBe('function');
  });

  it('spinning div has correct dimensions', () => {
    const { container } = render(<Spinner />);
    const spinnerDiv = container.querySelector('.animate-spin');
    expect(spinnerDiv?.className).toContain('h-12');
    expect(spinnerDiv?.className).toContain('w-12');
  });
});
