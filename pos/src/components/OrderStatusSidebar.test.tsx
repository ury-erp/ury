import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderStatusSidebar from './OrderStatusSidebar';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Module-level mutable store state
let mockPOSStoreState: Record<string, unknown> = {
  posProfile: null,
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

describe('OrderStatusSidebar', () => {
  const mockSetSelectedStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPOSStoreState = {
      posProfile: null,
    };
  });

  it('renders the status title', () => {
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.getByText('orders.status_title')).toBeInTheDocument();
  });

  it('renders Draft and Unbilled by default', () => {
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.getByText('order_status_types.draft')).toBeInTheDocument();
    expect(screen.getByText('order_status_types.unbilled')).toBeInTheDocument();
  });

  it('renders Recently Paid when paid_limit > 0', () => {
    mockPOSStoreState.posProfile = { paid_limit: 10 };
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.getByText('order_status_types.recently_paid')).toBeInTheDocument();
  });

  it('does not render Recently Paid when paid_limit is 0', () => {
    mockPOSStoreState.posProfile = { paid_limit: 0 };
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.queryByText('order_status_types.recently_paid')).not.toBeInTheDocument();
  });

  it('renders extended statuses when view_all_status is enabled', () => {
    mockPOSStoreState.posProfile = { view_all_status: 1 };
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.getByText('order_status_types.paid')).toBeInTheDocument();
    expect(screen.getByText('order_status_types.consolidated')).toBeInTheDocument();
    expect(screen.getByText('order_status_types.return')).toBeInTheDocument();
  });

  it('does not render extended statuses when view_all_status is disabled', () => {
    mockPOSStoreState.posProfile = { view_all_status: 0 };
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    expect(screen.queryByText('order_status_types.paid')).not.toBeInTheDocument();
  });

  it('calls setSelectedStatus when a status is clicked', () => {
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    fireEvent.click(screen.getByText('order_status_types.unbilled'));
    expect(mockSetSelectedStatus).toHaveBeenCalledWith('Unbilled');
  });

  it('applies active style to selected status', () => {
    render(<OrderStatusSidebar selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    const draftButton = screen.getByText('order_status_types.draft').closest('button')!;
    expect(draftButton.className).toContain('shadow-sm');
  });

  it('disables buttons when disabled prop is true', () => {
    render(<OrderStatusSidebar disabled={true} selectedStatus="Draft" setSelectedStatus={mockSetSelectedStatus} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });
});
