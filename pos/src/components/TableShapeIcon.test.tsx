import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TableShapeIcon } from './TableShapeIcon';

describe('TableShapeIcon', () => {
  it('renders a circle icon for Circle shape', () => {
    const { container } = render(<TableShapeIcon shape="Circle" />);
    expect(container.querySelector('.lucide-circle')).toBeTruthy();
  });

  it('renders a square icon for Square shape', () => {
    const { container } = render(<TableShapeIcon shape="Square" />);
    expect(container.querySelector('.lucide-square')).toBeTruthy();
  });

  it('renders a rectangle icon for Rectangle shape', () => {
    const { container } = render(<TableShapeIcon shape="Rectangle" />);
    expect(container.querySelector('.lucide-rectangle-horizontal')).toBeTruthy();
  });

  it('defaults to a rectangle icon when no shape is given', () => {
    const { container } = render(<TableShapeIcon />);
    expect(container.querySelector('.lucide-rectangle-horizontal')).toBeTruthy();
  });

  it('falls back to a rectangle icon for an unrecognized shape', () => {
    // @ts-expect-error - deliberately passing an invalid shape to exercise the default branch
    const { container } = render(<TableShapeIcon shape="Triangle" />);
    expect(container.querySelector('.lucide-rectangle-horizontal')).toBeTruthy();
  });

  it('applies the given className to the rendered icon', () => {
    const { container } = render(<TableShapeIcon shape="Circle" className="text-red-500" />);
    expect(container.querySelector('svg')?.classList.contains('text-red-500')).toBe(true);
  });
});
