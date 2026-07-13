import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from './button';
import React from 'react';

describe('Button', () => {
  it('renders as a button element', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByText('Click me');
    expect(button.tagName).toBe('BUTTON');
  });

  it('renders with default variant and size', () => {
    const { container } = render(<Button>Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('h-10');
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Click</Button>);
    const button = screen.getByText('Click');
    expect(button.className).toContain('custom-class');
  });

  it('renders destructive variant', () => {
    const { container } = render(<Button variant="destructive">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-destructive');
  });

  it('renders outline variant', () => {
    const { container } = render(<Button variant="outline">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('border');
    expect(button.className).toContain('border-input');
  });

  it('renders secondary variant', () => {
    const { container } = render(<Button variant="secondary">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-secondary');
  });

  it('renders ghost variant', () => {
    const { container } = render(<Button variant="ghost">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('hover:bg-accent');
  });

  it('renders link variant', () => {
    const { container } = render(<Button variant="link">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('underline-offset-4');
  });

  it('renders tab variant', () => {
    const { container } = render(<Button variant="tab">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-gray-100');
  });

  it('renders success variant', () => {
    const { container } = render(<Button variant="success">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-green-600');
  });

  it('renders warning variant', () => {
    const { container } = render(<Button variant="warning">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-orange-600');
  });

  it('renders danger variant', () => {
    const { container } = render(<Button variant="danger">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('bg-red-600');
  });

  it('renders sm size', () => {
    const { container } = render(<Button size="sm">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('h-9');
  });

  it('renders lg size', () => {
    const { container } = render(<Button size="lg">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('h-11');
  });

  it('renders icon size', () => {
    const { container } = render(<Button size="icon">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('h-10');
    expect(button.className).toContain('w-10');
  });

  it('renders xs size', () => {
    const { container } = render(<Button size="xs">Click</Button>);
    const button = container.firstElementChild as HTMLElement;
    expect(button.className).toContain('h-7');
    expect(button.className).toContain('text-xs');
  });

  it('handles disabled state', () => {
    render(<Button disabled>Click</Button>);
    const button = screen.getByText('Click');
    expect(button).toBeDisabled();
    expect(button.className).toContain('disabled:opacity-50');
  });

  it('handles onClick', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Click</Button>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('has displayName "Button"', () => {
    expect(Button.displayName).toBe('Button');
  });

  it('exports buttonVariants as a function', () => {
    expect(typeof buttonVariants).toBe('function');
  });

  it('accepts asChild prop without error', () => {
    render(<Button asChild={false}>Click</Button>);
    expect(screen.getByText('Click')).toBeInTheDocument();
  });

  it('spreads additional button HTML attributes', () => {
    render(<Button type="submit" id="test-btn">Click</Button>);
    const button = screen.getByText('Click');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('id', 'test-btn');
  });
});
