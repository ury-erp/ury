import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Select, SelectItem, selectVariants, RadixSelect } from './select';

vi.mock('@radix-ui/react-select', () => {
  return {
    Root: ({ children, onValueChange, value, defaultValue }: any) => (
      <div data-testid="radix-select-root" data-value={value} data-default-value={defaultValue}>
        {children}
      </div>
    ),
    Trigger: React.forwardRef(({ children, className, ...props }: any, ref: any) => (
      <button ref={ref} data-testid="radix-select-trigger" className={className} {...props}>
        {children}
      </button>
    )),
    Value: ({ placeholder, className }: any) => (
      <span data-testid="radix-select-value" data-placeholder={placeholder} className={className} />
    ),
    Icon: ({ children, asChild }: any) => <span data-testid="radix-select-icon">{children}</span>,
    Portal: ({ children }: any) => <div data-testid="radix-select-portal">{children}</div>,
    Content: ({ children, className, ...props }: any) => (
      <div data-testid="radix-select-content" className={className}>{children}</div>
    ),
    Viewport: ({ children }: any) => <div data-testid="radix-select-viewport">{children}</div>,
    Item: React.forwardRef(({ children, className, ...props }: any, ref: any) => (
      <div ref={ref} data-testid="radix-select-item" className={className} {...props}>{children}</div>
    )),
    ItemText: ({ children }: any) => <span data-testid="radix-select-item-text">{children}</span>,
  };
});

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down-icon">▼</span>,
}));

describe('Select', () => {
  it('renders with default placeholder "Select an option"', () => {
    render(<Select><SelectItem value="a">Option A</SelectItem></Select>);
    const value = screen.getByTestId('radix-select-value');
    expect(value).toHaveAttribute('data-placeholder', 'Select an option');
  });

  it('renders with custom placeholder', () => {
    render(<Select placeholder="Choose one"><SelectItem value="a">Option A</SelectItem></Select>);
    const value = screen.getByTestId('radix-select-value');
    expect(value).toHaveAttribute('data-placeholder', 'Choose one');
  });

  it('applies custom className to trigger', () => {
    render(<Select className="custom-class"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('custom-class');
  });

  it('applies error variant when error prop is true', () => {
    render(<Select error={true}><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('border-red-300');
  });

  it('renders default variant', () => {
    render(<Select variant="default"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('border-gray-200');
  });

  it('renders error variant directly', () => {
    render(<Select variant="error"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('border-red-300');
  });

  it('renders success variant', () => {
    render(<Select variant="success"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('border-green-300');
  });

  it('renders default size', () => {
    render(<Select size="default"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('h-10');
  });

  it('renders sm size', () => {
    render(<Select size="sm"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('h-8');
  });

  it('renders lg size', () => {
    render(<Select size="lg"><SelectItem value="a">Option A</SelectItem></Select>);
    const trigger = screen.getByTestId('radix-select-trigger');
    expect(trigger.className).toContain('h-12');
  });

  it('renders RadixSelect root', () => {
    render(<Select><SelectItem value="a">Option A</SelectItem></Select>);
    expect(screen.getByTestId('radix-select-root')).toBeInTheDocument();
  });

  it('renders ChevronDown icon', () => {
    render(<Select><SelectItem value="a">Option A</SelectItem></Select>);
    expect(screen.getByTestId('chevron-down-icon')).toBeInTheDocument();
  });

  it('forwards ref to trigger', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Select ref={ref}><SelectItem value="a">Option A</SelectItem></Select>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('has displayName "Select"', () => {
    expect(Select.displayName).toBe('Select');
  });
});

describe('SelectItem', () => {
  it('renders children text', () => {
    render(
      <Select>
        <SelectItem value="a">Option A</SelectItem>
      </Select>
    );
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Select>
        <SelectItem value="a" className="custom-item">Option A</SelectItem>
      </Select>
    );
    const item = screen.getByTestId('radix-select-item');
    expect(item.className).toContain('custom-item');
  });

  it('renders with default item classes', () => {
    render(
      <Select>
        <SelectItem value="a">Option A</SelectItem>
      </Select>
    );
    const item = screen.getByTestId('radix-select-item');
    expect(item.className).toContain('px-4');
    expect(item.className).toContain('py-2');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(
      <Select>
        <SelectItem value="a" ref={ref}>Option A</SelectItem>
      </Select>
    );
    expect(ref.current).not.toBeNull();
  });

  it('has displayName "SelectItem"', () => {
    expect(SelectItem.displayName).toBe('SelectItem');
  });
});

describe('exports', () => {
  it('exports selectVariants as a function', () => {
    expect(typeof selectVariants).toBe('function');
  });

  it('exports RadixSelect', () => {
    expect(RadixSelect).toBeDefined();
  });

  it('selectVariants returns base class names', () => {
    const result = selectVariants();
    expect(result).toContain('flex');
    expect(result).toContain('rounded-md');
  });
});
