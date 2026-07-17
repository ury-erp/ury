import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';
import { ShoppingCart } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="No orders yet"
        description="Orders will appear here once customers start placing them."
      />,
    );
    expect(screen.getByText('No orders yet')).toBeTruthy();
    expect(
      screen.getByText('Orders will appear here once customers start placing them.'),
    ).toBeTruthy();
  });

  it('renders with icon', () => {
    render(<EmptyState icon={ShoppingCart} title="Empty cart" />);
    // Icon is rendered as SVG inside the component
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders action element', () => {
    render(<EmptyState title="No data" action={<button>Create New</button>} />);
    expect(screen.getByText('Create New')).toBeTruthy();
  });

  it('has role="status" for accessibility', () => {
    render(<EmptyState title="No data" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('applies size variants correctly', () => {
    const { container: smContainer } = render(<EmptyState title="Small" size="sm" />);
    expect(smContainer.querySelector('.py-6')).toBeTruthy();

    const { container: mdContainer } = render(<EmptyState title="Medium" size="md" />);
    expect(mdContainer.querySelector('.py-12')).toBeTruthy();

    const { container: lgContainer } = render(<EmptyState title="Large" size="lg" />);
    expect(lgContainer.querySelector('.py-20')).toBeTruthy();
  });

  it('renders without optional props', () => {
    const { container } = render(<EmptyState />);
    expect(container.firstChild).toBeTruthy();
  });
});
