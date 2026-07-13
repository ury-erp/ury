import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Input, inputVariants } from './input';

describe('Input', () => {
  it('renders as an input element', () => {
    render(<Input />);
    const input = document.querySelector('input');
    expect(input).toBeInTheDocument();
    expect(input?.tagName).toBe('INPUT');
  });

  it('renders with default variant', () => {
    const { container } = render(<Input />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('border-gray-200');
    expect(input.className).toContain('focus:border-blue-500');
  });

  it('renders with error prop - should apply error variant', () => {
    const { container } = render(<Input error={true} />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('border-red-300');
    expect(input.className).toContain('focus:border-red-500');
  });

  it('renders error variant directly', () => {
    const { container } = render(<Input variant="error" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('border-red-300');
  });

  it('renders success variant', () => {
    const { container } = render(<Input variant="success" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('border-green-300');
    expect(input.className).toContain('focus:border-green-500');
  });

  it('renders search variant', () => {
    const { container } = render(<Input variant="search" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('bg-gray-50');
  });

  it('renders default size', () => {
    const { container } = render(<Input size="default" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('h-10');
  });

  it('renders sm size', () => {
    const { container } = render(<Input size="sm" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('h-8');
    expect(input.className).toContain('text-xs');
  });

  it('renders lg size', () => {
    const { container } = render(<Input size="lg" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('h-12');
  });

  it('applies custom className', () => {
    const { container } = render(<Input className="custom-class" />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('custom-class');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('handles type prop', () => {
    render(<Input type="password" />);
    const input = document.querySelector('input');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('handles disabled prop', () => {
    const { container } = render(<Input disabled />);
    const input = container.firstElementChild as HTMLElement;
    expect(input).toBeDisabled();
    expect(input.className).toContain('disabled:cursor-not-allowed');
  });

  it('handles placeholder', () => {
    render(<Input placeholder="Enter text" />);
    const input = document.querySelector('input');
    expect(input).toHaveAttribute('placeholder', 'Enter text');
  });

  it('handles value and onChange', () => {
    const handleChange = vi.fn();
    render(<Input value="test value" onChange={handleChange} />);
    const input = document.querySelector('input');
    expect(input).toHaveValue('test value');
    fireEvent.change(input!, { target: { value: 'new value' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('error prop overrides variant to "error"', () => {
    const { container } = render(<Input variant="success" error={true} />);
    const input = container.firstElementChild as HTMLElement;
    expect(input.className).toContain('border-red-300');
    expect(input.className).not.toContain('border-green-300');
  });

  it('exports inputVariants as a function', () => {
    expect(typeof inputVariants).toBe('function');
  });

  it('inputVariants returns base class names', () => {
    const result = inputVariants();
    expect(result).toContain('flex');
    expect(result).toContain('rounded-md');
  });

  it('has displayName "Input"', () => {
    expect(Input.displayName).toBe('Input');
  });
});
