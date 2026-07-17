import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  MenuCardSkeleton,
  DashboardCardSkeleton,
  TableRowSkeleton,
  ChartSkeleton,
} from './skeleton';

describe('Skeleton', () => {
  it('renders with default text variant', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain('bg-gray-200');
    expect(el.className).toContain('animate-pulse');
  });

  it('renders circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('rounded-full');
  });

  it('renders rectangular variant', () => {
    const { container } = render(<Skeleton variant="rectangular" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('rounded-md');
  });

  it('applies pulse animation by default', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('animate-pulse');
  });

  it('applies wave animation', () => {
    const { container } = render(<Skeleton animation="wave" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('animate-shimmer');
  });

  it('applies no animation', () => {
    const { container } = render(<Skeleton animation="none" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toContain('animate-pulse');
    expect(el.className).not.toContain('animate-shimmer');
  });

  it('applies width and height styles', () => {
    const { container } = render(<Skeleton width={200} height={40} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('40px');
  });

  it('has role="status" for accessibility', () => {
    render(<Skeleton />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-48" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-48');
  });
});

describe('Pre-built skeletons', () => {
  it('MenuCardSkeleton renders without crashing', () => {
    render(<MenuCardSkeleton />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('DashboardCardSkeleton renders without crashing', () => {
    render(<DashboardCardSkeleton />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('TableRowSkeleton renders correct number of cells', () => {
    render(
      <table>
        <tbody>
          <TableRowSkeleton columns={5} />
        </tbody>
      </table>,
    );
    expect(screen.getAllByRole('status').length).toBe(5);
  });

  it('ChartSkeleton renders without crashing', () => {
    render(<ChartSkeleton />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});
