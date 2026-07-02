import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableShapeIcon } from './TableShapeIcon';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Circle: ({ className }: any) => <svg data-testid="circle-icon" className={className} />,
  Square: ({ className }: any) => <svg data-testid="square-icon" className={className} />,
  RectangleHorizontal: ({ className }: any) => <svg data-testid="rectangle-icon" className={className} />,
}));

describe('TableShapeIcon', () => {
  it('renders Circle icon for Circle shape', () => {
    render(<TableShapeIcon shape="Circle" />);
    expect(screen.getByTestId('circle-icon')).toBeInTheDocument();
  });

  it('renders Square icon for Square shape', () => {
    render(<TableShapeIcon shape="Square" />);
    expect(screen.getByTestId('square-icon')).toBeInTheDocument();
  });

  it('renders Rectangle icon for Rectangle shape', () => {
    render(<TableShapeIcon shape="Rectangle" />);
    expect(screen.getByTestId('rectangle-icon')).toBeInTheDocument();
  });

  it('defaults to Rectangle when no shape is provided', () => {
    render(<TableShapeIcon />);
    expect(screen.getByTestId('rectangle-icon')).toBeInTheDocument();
  });

  it('defaults to Rectangle for unknown shape', () => {
    render(<TableShapeIcon shape={'Unknown' as any} />);
    expect(screen.getByTestId('rectangle-icon')).toBeInTheDocument();
  });

  it('passes className to the icon', () => {
    render(<TableShapeIcon shape="Circle" className="w-4 h-4" />);
    const icon = screen.getByTestId('circle-icon');
    expect(icon).toHaveAttribute('class', 'w-4 h-4');
  });

  it('passes className to Square icon', () => {
    render(<TableShapeIcon shape="Square" className="text-red-500" />);
    const icon = screen.getByTestId('square-icon');
    expect(icon).toHaveAttribute('class', 'text-red-500');
  });

  it('passes className to Rectangle icon', () => {
    render(<TableShapeIcon shape="Rectangle" className="w-6 h-3" />);
    const icon = screen.getByTestId('rectangle-icon');
    expect(icon).toHaveAttribute('class', 'w-6 h-3');
  });

  it('renders without className when not provided', () => {
    render(<TableShapeIcon shape="Circle" />);
    const icon = screen.getByTestId('circle-icon');
    // When className is undefined, the mock passes undefined which renders as empty
    expect(icon).toBeInTheDocument();
  });

  it('only renders one icon at a time', () => {
    render(<TableShapeIcon shape="Circle" />);
    expect(screen.getByTestId('circle-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('square-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectangle-icon')).not.toBeInTheDocument();
  });
});
