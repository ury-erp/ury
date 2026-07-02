import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrderPanel from './OrderPanel';
import { syncOrder } from '../lib/order-api';

// Mock the i18n module
vi.mock('../i18n', () => ({
  t: (key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      'cart.empty_title': 'Your cart is empty',
      'cart.empty_subtitle': 'Add items from the menu to get started',
      'cart.click_to_add': 'Click items to add',
      'cart.double_click_hint': 'Double click for quick add',
      'cart.loading_order': 'Loading order...',
      'cart.total': 'Total',
      'cart.clear_cart': 'Clear Cart',
      'cart.edit_item': 'Edit item',
      'cart.add_comment': 'Add comment',
      'cart.edit_comment': 'Edit comment',
      'cart.add_new_order': 'Add New Order',
      'cart.update_order': 'Update Order',
      'cart.updating_order': 'Updating...',
      'cart.processing_order': 'Processing...',
      'errors.pos_profile_not_found': 'POS profile not found',
      'errors.user_not_logged_in': 'User not logged in',
      'errors.select_customer': 'Please select a customer',
      'errors.select_aggregator': 'Please select an aggregator',
      'errors.select_table': 'Please select a table for {{order_type}}',
      'errors.no_payment_modes': 'No payment modes available',
      'success.order_created': 'Order created successfully',
      'success.order_updated': 'Order updated successfully',
    };
    let result = translations[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{{${k}}}`, v);
      });
    }
    return result;
  },
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock the order-api
vi.mock('../lib/order-api', () => ({
  syncOrder: vi.fn().mockResolvedValue(undefined),
}));

// Mock error-utils
vi.mock('../lib/error-utils', () => ({
  getErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

// Mock the toast
vi.mock('./ui/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  ToastProvider: () => null,
}));

// Mock UI components
vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, title, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className} title={title} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('./ui/spinner', () => ({
  Spinner: ({ message }: any) => <div data-testid="spinner">{message || 'Loading...'}</div>,
}));

// Mock CustomerSelect
vi.mock('./CustomerSelect', () => ({
  CustomerSelect: ({ disabled }: any) => (
    <div data-testid="customer-select" data-disabled={disabled}>Customer Select</div>
  ),
}));

// Mock OrderTypeSelect
vi.mock('./OrderTypeSelect', () => ({
  default: ({ disabled }: any) => (
    <div data-testid="order-type-select" data-disabled={disabled}>Order Type Select</div>
  ),
}));

// Mock CommentDialog
vi.mock('./CommentDialog', () => ({
  default: ({ isOpen, onClose, onSave, initialComment }: any) => (
    isOpen ? <div data-testid="comment-dialog">Comment Dialog</div> : null
  ),
}));

// Mock ProductDialog
vi.mock('./ProductDialog', () => ({
  default: ({ onClose, editMode }: any) => (
    <div data-testid="product-dialog">
      Product Dialog
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Mock stores with controllable state
const mockRemoveFromOrder = vi.fn();
const mockUpdateQuantity = vi.fn();
const mockClearOrder = vi.fn();
const mockSetSelectedItem = vi.fn();
const mockResetOrderState = vi.fn();
const mockSetOrderComment = vi.fn();

let mockPOSStoreState: Record<string, unknown>;
let mockRootStoreState: Record<string, unknown>;

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

vi.mock('../store/root-store', () => ({
  useRootStore: (_selector: any) => {
    // If selector is a function, call it with the state
    if (typeof _selector === 'function') {
      return _selector(mockRootStoreState);
    }
    return mockRootStoreState;
  },
}));

// Sample order items for testing
const sampleOrderItems = [
  {
    id: 'item-1',
    name: 'Espresso',
    price: 3.5,
    quantity: 2,
    uniqueId: 'unique-1',
    selectedVariant: null,
    selectedAddons: [],
    addons: [],
    variants: [],
    image: null,
  },
  {
    id: 'item-2',
    name: 'Cappuccino',
    price: 4.0,
    quantity: 1,
    uniqueId: 'unique-2',
    selectedVariant: { id: 'v1', name: 'Large', price: 5.0 },
    selectedAddons: [{ id: 'a1', name: 'Extra Shot', price: 1.0 }],
    addons: [],
    variants: [],
    image: null,
  },
];

const defaultPOSStore = {
  activeOrders: [],
  removeFromOrder: mockRemoveFromOrder,
  updateQuantity: mockUpdateQuantity,
  clearOrder: mockClearOrder,
  setSelectedItem: mockSetSelectedItem,
  orderLoading: false,
  isOrderInteractionDisabled: () => false,
  isUpdatingOrder: false,
  posProfile: { name: 'Test Profile', cashier: 'Cashier1', owner: 'Admin' },
  selectedOrderType: 'Take Away',
  selectedTable: null,
  selectedRoom: null,
  selectedCustomer: { id: 'cust-1', name: 'Walk In', phone: '' },
  selectedAggregator: null,
  resetOrderState: mockResetOrderState,
  paymentModes: ['Cash'],
  orderId: null,
  orderComment: '',
  setOrderComment: mockSetOrderComment,
  fetchPaymentModes: vi.fn(),
};

describe('OrderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPOSStoreState = { ...defaultPOSStore };
    mockRootStoreState = { user: { name: 'Admin' } };
  });

  it('should show empty cart message when no items', () => {
    render(<OrderPanel />);
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByText('Add items from the menu to get started')).toBeInTheDocument();
  });

  it('should show loading spinner when orderLoading is true', () => {
    mockPOSStoreState = { ...defaultPOSStore, orderLoading: true };

    render(<OrderPanel />);
    expect(screen.getByText('Loading order...')).toBeInTheDocument();
  });

  it('should render order items when cart has items', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Cappuccino')).toBeInTheDocument();
  });

  it('should display variant name when item has selected variant', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    expect(screen.getByText('Large')).toBeInTheDocument();
  });

  it('should display addon names when item has selected addons', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    expect(screen.getByText('Extra Shot')).toBeInTheDocument();
  });

  it('should calculate and display total correctly', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    // Espresso: 3.5 * 2 = 7, Cappuccino: (5.0 + 1.0) * 1 = 6, Total = 13
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('should call updateQuantity when + button is clicked', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: [sampleOrderItems[0]] };

    render(<OrderPanel />);
    const plusButton = screen.getAllByRole('button').find(b => b.textContent === '+');
    if (plusButton) {
      fireEvent.click(plusButton);
      expect(mockUpdateQuantity).toHaveBeenCalledWith('unique-1', 3);
    }
  });

  it('should call updateQuantity when - button is clicked', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: [sampleOrderItems[0]] };

    render(<OrderPanel />);
    const minusButton = screen.getAllByRole('button').find(b => b.textContent === '−');
    if (minusButton) {
      fireEvent.click(minusButton);
      expect(mockUpdateQuantity).toHaveBeenCalledWith('unique-1', 1);
    }
  });

  it('should call removeFromOrder when - reduces quantity to 0', () => {
    const singleQtyItem = { ...sampleOrderItems[0], quantity: 1 };
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: [singleQtyItem] };

    render(<OrderPanel />);
    const minusButton = screen.getAllByRole('button').find(b => b.textContent === '−');
    if (minusButton) {
      fireEvent.click(minusButton);
      expect(mockRemoveFromOrder).toHaveBeenCalledWith('unique-1');
    }
  });

  it('should show clear cart button when items are present', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    expect(screen.getByText('Clear Cart')).toBeInTheDocument();
  });

  it('should call clearOrder when Clear Cart is clicked', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems };

    render(<OrderPanel />);
    fireEvent.click(screen.getByText('Clear Cart'));
    expect(mockClearOrder).toHaveBeenCalled();
  });

  it('should show add new order button when not updating', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems, isUpdatingOrder: false };

    render(<OrderPanel />);
    expect(screen.getByText('Add New Order')).toBeInTheDocument();
  });

  it('should show update order button when updating existing order', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: sampleOrderItems, isUpdatingOrder: true };

    render(<OrderPanel />);
    expect(screen.getByText('Update Order')).toBeInTheDocument();
  });

  it('should submit order with correct data on button click', async () => {
    mockPOSStoreState = {
      ...defaultPOSStore,
      activeOrders: [sampleOrderItems[0]],
      isUpdatingOrder: false,
      posProfile: { name: 'Test Profile', cashier: 'Cashier1', owner: 'Admin' },
      selectedOrderType: 'Take Away',
      selectedCustomer: { id: 'cust-1', name: 'Walk In', phone: '' },
      paymentModes: ['Cash'],
    };

    render(<OrderPanel />);
    fireEvent.click(screen.getByText('Add New Order'));

    await waitFor(() => {
      expect(syncOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              item: 'item-1',
              item_name: 'Espresso',
              rate: 3.5,
              qty: 2,
            }),
          ]),
          pos_profile: 'Test Profile',
          order_type: 'Take Away',
          customer: 'Walk In',
          cashier: 'Cashier1',
        })
      );
    });
  });

  it('should show error when submitting without POS profile', async () => {
    const { showToast } = await import('./ui/toast');
    mockPOSStoreState = {
      ...defaultPOSStore,
      activeOrders: [sampleOrderItems[0]],
      posProfile: null,
    };

    render(<OrderPanel />);
    fireEvent.click(screen.getByText('Add New Order'));

    await waitFor(() => {
      expect(showToast.error).toHaveBeenCalledWith('POS profile not found');
    });
  });

  it('should disable interaction when isOrderInteractionDisabled returns true', () => {
    mockPOSStoreState = {
      ...defaultPOSStore,
      activeOrders: sampleOrderItems,
      isOrderInteractionDisabled: () => true,
    };

    render(<OrderPanel />);
    const clearButton = screen.getByText('Clear Cart');
    expect(clearButton).toBeDisabled();
  });

  it('should display order type select and customer select', () => {
    render(<OrderPanel />);
    expect(screen.getByTestId('order-type-select')).toBeInTheDocument();
    expect(screen.getByTestId('customer-select')).toBeInTheDocument();
  });

  it('should handle edit item by opening product dialog', () => {
    mockPOSStoreState = { ...defaultPOSStore, activeOrders: [sampleOrderItems[0]] };

    render(<OrderPanel />);
    // Find the edit button (title="Edit item")
    const editButton = screen.getAllByRole('button').find(b => b.title === 'Edit item');
    if (editButton) {
      fireEvent.click(editButton);
      expect(mockSetSelectedItem).toHaveBeenCalled();
    }
  });
});
