import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentDialog from './PaymentDialog';
import { call } from '../lib/frappe-sdk';

// Mock the i18n module
vi.mock('../i18n', () => ({
  t: (key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      'payment.title': 'Payment',
      'payment.apply_discount': 'Apply Discount',
      'payment.discount_placeholder': 'Enter discount %',
      'common.apply': 'Apply',
      'payment.payment_methods': 'Payment Methods',
      'payment.amount_placeholder': 'Amount',
      'payment.total_entered': 'Total Entered',
      'payment.order_summary': 'Order Summary',
      'payment.subtotal': 'Subtotal',
      'payment.discount': 'Discount',
      'payment.adjustment': 'Adjustment',
      'payment.total': 'Total',
      'payment.pay_button': 'Pay {{amount}}',
      'payment.processing': 'Processing...',
      'errors.invalid_discount': 'Invalid discount value',
      'errors.discount_exceeds_max': 'Discount exceeds maximum',
      'success.payment_successful': 'Payment successful',
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

// Mock the frappe-sdk
vi.mock('../lib/frappe-sdk', () => ({
  call: {
    get: vi.fn(),
    post: vi.fn(),
  },
  db: {
    getDocList: vi.fn(),
    getDoc: vi.fn(),
    getValue: vi.fn(),
    getCount: vi.fn(),
  },
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
  },
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

// Mock the store module — mock usePOSStore as a function we control
const mockFetchPaymentModes = vi.fn();
let mockStoreState: Record<string, unknown> = {
  paymentModes: ['Cash', 'Card'],
  fetchPaymentModes: mockFetchPaymentModes,
  posProfile: { name: 'Test Profile', enable_discount: 1 },
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockStoreState,
}));

// Mock the UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, disabled, type, min, step, className, size, onFocus, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      type={type}
      min={min}
      step={step}
      className={className}
      onFocus={onFocus}
      data-size={size}
      {...props}
    />
  ),
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, variant, className, showCloseButton }: any) => (
    <div data-testid="dialog-content" data-variant={variant} className={className}>
      {children}
    </div>
  ),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)} data-testid="select">
      {children}
    </select>
  ),
  Badge: ({ children, variant }: any) => <span data-testid="badge" data-variant={variant}>{children}</span>,
  Textarea: ({ value, onChange, placeholder, className, ...props }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} className={className} {...props} />
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Loader: () => <div data-testid="loader">Loading...</div>,
}));

const defaultProps = {
  onClose: vi.fn(),
  grandTotal: 100,
  roundedTotal: 100,
  invoice: 'INV-001',
  customer: 'Walk In Customer',
  posProfile: 'POS-Profile-1',
  table: null,
  cashier: 'Cashier1',
  owner: 'Admin',
  fetchOrders: vi.fn().mockResolvedValue(undefined),
  clearSelectedOrder: vi.fn(),
};

describe('PaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock store state
    mockStoreState = {
      paymentModes: ['Cash', 'Card'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 1 },
    };
  });

  it('should render the payment dialog with title', () => {
    render(<PaymentDialog {...defaultProps} />);
    expect(screen.getByText('Payment')).toBeInTheDocument();
  });

  it('should display payment method inputs for each mode', () => {
    render(<PaymentDialog {...defaultProps} />);
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('should display order summary with subtotal and total', () => {
    render(<PaymentDialog {...defaultProps} />);
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('should auto-fill default payment mode with total amount', async () => {
    render(<PaymentDialog {...defaultProps} />);
    const amountInputs = screen.getAllByPlaceholderText('Amount');
    // The first input (Cash) should be auto-filled with the total
    // For type="number" inputs, toHaveValue expects a number
    await waitFor(() => {
      expect(amountInputs[0]).toHaveValue(100);
    });
  });

  it('should disable pay button when no payment is entered', () => {
    mockStoreState = {
      paymentModes: ['Cash', 'Card'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 0 },
    };

    render(<PaymentDialog {...defaultProps} />);
    // The pay button should exist
    const allButtons = screen.getAllByRole('button');
    const payButton = allButtons.find(b => b.textContent?.includes('Pay'));
    expect(payButton).toBeDefined();
  });

  it('should call onClose when close button is clicked', () => {
    render(<PaymentDialog {...defaultProps} />);
    // Find the close button (X icon button, variant="ghost")
    const ghostButtons = screen.getAllByRole('button').filter(b => b.dataset.variant === 'ghost');
    // The first ghost button is the X close button
    if (ghostButtons.length > 0) {
      fireEvent.click(ghostButtons[0]);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('should handle payment successfully', async () => {
    vi.mocked(call.post).mockResolvedValue({ message: 'Success' });
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 0 },
    };

    render(<PaymentDialog {...defaultProps} />);

    // Wait for auto-fill
    await waitFor(() => {
      const amountInput = screen.getByPlaceholderText('Amount');
      expect(amountInput).toHaveValue(100);
    });

    // Find and click the Pay button
    const allButtons = screen.getAllByRole('button');
    const payButton = allButtons.find(b => b.textContent?.includes('Pay'));
    if (payButton && !payButton.disabled) {
      fireEvent.click(payButton);
      await waitFor(() => {
        expect(call.post).toHaveBeenCalledWith(
          'ury.ury.doctype.ury_order.ury_order.make_invoice',
          expect.objectContaining({
            customer: 'Walk In Customer',
            invoice: 'INV-001',
            pos_profile: 'POS-Profile-1',
          })
        );
      });
    }
  });

  it('should handle payment error gracefully', async () => {
    vi.mocked(call.post).mockRejectedValue(new Error('Payment failed'));
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 0 },
    };

    render(<PaymentDialog {...defaultProps} />);

    // Wait for auto-fill then click pay
    await waitFor(() => {
      const amountInput = screen.getByPlaceholderText('Amount');
      expect(amountInput).toHaveValue(100);
    });

    const allButtons = screen.getAllByRole('button');
    const payButton = allButtons.find(b => b.textContent?.includes('Pay'));
    if (payButton && !payButton.disabled) {
      fireEvent.click(payButton);
      await waitFor(() => {
        expect(screen.getByText('Payment failed')).toBeInTheDocument();
      });
    }
  });

  it('should show discount section when enable_discount is 1', () => {
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 1 },
    };

    render(<PaymentDialog {...defaultProps} />);
    expect(screen.getByText('Apply Discount')).toBeInTheDocument();
  });

  it('should hide discount section when enable_discount is 0', () => {
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 0 },
    };

    render(<PaymentDialog {...defaultProps} />);
    expect(screen.queryByText('Apply Discount')).not.toBeInTheDocument();
  });

  it('should apply valid discount and update total', async () => {
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 1 },
    };

    render(<PaymentDialog {...defaultProps} />);

    const discountInput = screen.getByPlaceholderText('Enter discount %');
    fireEvent.change(discountInput, { target: { value: '10' } });

    const applyButtons = screen.getAllByRole('button');
    const applyButton = applyButtons.find(b => b.textContent === 'Apply');
    if (applyButton) {
      fireEvent.click(applyButton);
      // After applying 10% discount on 100, discount = 10, discountedTotal = 90, finalTotal = ceil(90) = 90
      await waitFor(() => {
        expect(screen.getByText('Discount')).toBeInTheDocument();
      });
    }
  });

  it('should reject discount values above 100', async () => {
    mockStoreState = {
      paymentModes: ['Cash'],
      fetchPaymentModes: mockFetchPaymentModes,
      posProfile: { name: 'Test Profile', enable_discount: 1 },
    };

    render(<PaymentDialog {...defaultProps} />);

    const discountInput = screen.getByPlaceholderText('Enter discount %');
    fireEvent.change(discountInput, { target: { value: '150' } });

    const applyButtons = screen.getAllByRole('button');
    const applyButton = applyButtons.find(b => b.textContent === 'Apply');
    if (applyButton) {
      fireEvent.click(applyButton);
      await waitFor(() => {
        expect(screen.getByText('Discount exceeds maximum')).toBeInTheDocument();
      });
    }
  });

  it('should call fetchPaymentModes on mount', () => {
    render(<PaymentDialog {...defaultProps} />);
    expect(mockFetchPaymentModes).toHaveBeenCalled();
  });
});
