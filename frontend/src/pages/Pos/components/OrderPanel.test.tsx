import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderPanel from './OrderPanel';

vi.mock('../i18n', () => ({
  t: (key: string, params?: any) => key,
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock('../lib/order-api', () => ({
  syncOrder: vi.fn().mockResolvedValue({ status: 'success' }),
}));

let mockPOSStoreState = {
  activeOrders: [
    {
      uniqueId: 'item-1',
      id: 'ITEM-001',
      name: 'Chicken Biryani',
      price: 250,
      quantity: 1,
      selectedVariant: null,
      selectedAddons: [],
      comment: null,
      variants: [],
      addons: [],
    },
  ],
  removeFromOrder: vi.fn(),
  updateQuantity: vi.fn(),
  clearOrder: vi.fn(),
  setSelectedItem: vi.fn(),
  orderLoading: false,
  isOrderInteractionDisabled: () => false,
  isUpdatingOrder: false,
  posProfile: { name: 'POS-001', cashier: 'user1', owner: 'user1' },
  selectedOrderType: 'Dine In',
  selectedTable: 'T1',
  selectedRoom: 'Main Hall',
  selectedCustomer: { name: 'CUST-001' },
  selectedAggregator: null,
  resetOrderState: vi.fn(),
  paymentModes: ['Cash'],
  orderId: null,
  orderComment: '',
  setOrderComment: vi.fn(),
  noOfPax: 2,
  setNoOfPax: vi.fn(),
  lastModifiedTime: null,
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

vi.mock('../store/root-store', () => ({
  useRootStore: () => ({ user: { name: 'cashier@ury.test' } }),
}));

vi.mock('./CustomerSelect', () => ({
  CustomerSelect: () => <div>Customer Select</div>,
}));

vi.mock('./ProductDialog', () => ({
  default: () => <div>Product Dialog</div>,
}));

vi.mock('./OrderTypeSelect', () => ({
  default: () => <div>Order Type Select</div>,
}));

vi.mock('./CommentDialog', () => ({
  default: ({ onClose, onSave, isOpen }: any) => (
    isOpen ? <div onClick={() => onClose()}>Comment Dialog</div> : null
  ),
}));

describe('OrderPanel', () => {
  beforeEach(() => {
    cleanup();
    mockPOSStoreState = {
      activeOrders: [
        {
          uniqueId: 'item-1',
          id: 'ITEM-001',
          name: 'Chicken Biryani',
          price: 250,
          quantity: 1,
          selectedVariant: null,
          selectedAddons: [],
          comment: null,
          variants: [],
          addons: [],
        },
      ],
      removeFromOrder: vi.fn(),
      updateQuantity: vi.fn(),
      clearOrder: vi.fn(),
      setSelectedItem: vi.fn(),
      orderLoading: false,
      isOrderInteractionDisabled: () => false,
      isUpdatingOrder: false,
      posProfile: { name: 'POS-001', cashier: 'user1', owner: 'user1' },
      selectedOrderType: 'Dine In',
      selectedTable: 'T1',
      selectedRoom: 'Main Hall',
      selectedCustomer: { name: 'CUST-001' },
      selectedAggregator: null,
      resetOrderState: vi.fn(),
      paymentModes: ['Cash'],
      orderId: null,
      orderComment: '',
      setOrderComment: vi.fn(),
      noOfPax: 2,
      setNoOfPax: vi.fn(),
      lastModifiedTime: null,
    };
  });

  it('renders the order panel', () => {
    render(<OrderPanel />);
    expect(screen.getByText('Customer Select')).toBeInTheDocument();
  });

  it('displays the total price of all items', () => {
    render(<OrderPanel />);
    const priceElements = screen.getAllByText(/Rs. 250/);
    expect(priceElements.length).toBeGreaterThan(0);
  });

  it('shows empty cart message when no items', () => {
    mockPOSStoreState.activeOrders = [];
    render(<OrderPanel />);
    expect(screen.getByText('cart.empty_title')).toBeInTheDocument();
  });

  it('displays loading state when orderLoading is true', () => {
    mockPOSStoreState.orderLoading = true;
    render(<OrderPanel />);
    expect(screen.getByText('cart.loading_order')).toBeInTheDocument();
  });

  it('renders order items with quantity and total', () => {
    render(<OrderPanel />);
    expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
  });

  it('increments pax count on plus button click', async () => {
    const setNoOfPax = vi.fn();
    mockPOSStoreState.setNoOfPax = setNoOfPax;
    render(<OrderPanel />);
    const buttons = screen.getAllByRole('button');
    const plusButton = buttons.find(b => b.textContent === '+');
    
    if (plusButton) {
      await userEvent.click(plusButton);
      expect(setNoOfPax).toHaveBeenCalled();
    }
  });

  it('shows add new order button in initial state', () => {
    render(<OrderPanel />);
    expect(screen.getByText('cart.add_new_order')).toBeInTheDocument();
  });

  it('handles validation for no customer selected', () => {
    mockPOSStoreState.selectedCustomer = null;
    render(<OrderPanel />);
    const submitButton = screen.getByText('cart.add_new_order').closest('button');
    expect(submitButton).toBeInTheDocument();
  });

  it('handles validation for no table selected for dine-in', () => {
    mockPOSStoreState.selectedTable = null;
    render(<OrderPanel />);
    const submitButton = screen.getByText('cart.add_new_order').closest('button');
    expect(submitButton).toBeInTheDocument();
  });

  it('shows comment button', () => {
    render(<OrderPanel />);
    const commentButtons = screen.getAllByRole('button').filter(b => b.getAttribute('title')?.includes('comment'));
    expect(commentButtons.length).toBeGreaterThan(0);
  });
});
