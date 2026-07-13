import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders as a textarea element', () => {
    render(<Textarea />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea?.tagName).toBe('TEXTAREA');
  });

  it('applies default CSS classes including min-h-[80px]', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('min-h-[80px]');
  });

  it('applies default CSS classes with rounded-md', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('rounded-md');
  });

  it('applies default CSS classes with border', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('border');
    expect(textarea.className).toContain('border-gray-200');
  });

  it('applies custom className', () => {
    const { container } = render(<Textarea className="custom-class" />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('custom-class');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('TEXTAREA');
  });

  it('handles disabled prop', () => {
    const { container } = render(<Textarea disabled />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea).toBeDisabled();
    expect(textarea.className).toContain('disabled:cursor-not-allowed');
  });

  it('handles placeholder prop', () => {
    render(<Textarea placeholder="Enter description" />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toHaveAttribute('placeholder', 'Enter description');
  });

  it('handles value and onChange', () => {
    const handleChange = vi.fn();
    render(<Textarea value="test value" onChange={handleChange} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toHaveValue('test value');
    fireEvent.change(textarea!, { target: { value: 'new value' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('has displayName "Textarea"', () => {
    expect(Textarea.displayName).toBe('Textarea');
  });

  it('handles rows prop', () => {
    render(<Textarea rows={5} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toHaveAttribute('rows', '5');
  });

  it('handles cols prop', () => {
    render(<Textarea cols={40} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toHaveAttribute('cols', '40');
  });

  it('applies bg-white class by default', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('bg-white');
  });

  it('applies text-sm class by default', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('text-sm');
  });

  it('spreads additional textarea HTML attributes', () => {
    render(<Textarea id="my-textarea" name="description" />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toHaveAttribute('id', 'my-textarea');
    expect(textarea).toHaveAttribute('name', 'description');
  });

  it('applies focus ring classes', () => {
    const { container } = render(<Textarea />);
    const textarea = container.firstElementChild as HTMLElement;
    expect(textarea.className).toContain('focus-visible:ring-2');
  });
});
