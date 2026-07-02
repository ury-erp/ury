import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductDialog from './ProductDialog';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock storage for formatCurrency
vi.mock('../lib/storage', () => ({
  storage: {
    getItem: (key: string) => key === 'currencySymbol' ? '€' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Mock frappe-sdk
const mockGetDoc = vi.fn();
vi.mock('../lib/frappe-sdk', () => ({
  db: {
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
  },
  call: {
    get: vi.fn(),
    post: vi.fn(),
  },
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, disabled, type, min, max, className, id, onBlur, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      type={type}
      min={min}
      max={max}
      className={className}
      id={id}
      onBlur={onBlur}
      {...props}
    />
  ),
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, variant, className, showCloseButton, ref, ...props }: any) => (
    <div data-testid="dialog-content" data-variant={variant} className={className} {...props}>
      {children}
    </div>
  ),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Select: ({ children, value, onValueChange, placeholder, disabled }: any) => (
    <select value={value} onChange={(e: any) => onValueChange?.(e.target.value)} disabled={disabled} data-testid="select">
      {children}
    </select>
  ),
  SelectItem: ({ children, value, className }: any) => (
    <option value={value} className={className}>{children}</option>
  ),
  Badge: ({ children, variant }: any) => <span data-testid="badge">{children}</span>,
  Textarea: ({ value, onChange, placeholder, className, ...props }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} className={className} {...props} />
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Loader: () => <div data-testid="loader">Loading...</div>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Minus: () => <span data-testid="minus-icon" />,
}));

// Sample menu item
const sampleSelectedItem = {
  id: 'item-1',
  name: 'Espresso',
  item_name: 'Espresso',
  price: 3.5,
  item: 'espresso-item',
  image: null,
  course: 'Coffee',
  course_label: 'Coffee',
  description: 'Strong coffee',
  special_dish: 0 as 0 | 1,
  tax_rate: 0,
};

const sampleItemDoc = {
  name: 'espresso-item',
  item_name: 'Espresso',
  item: 'espresso-item',
  custom_pos_add_on_items: [
    { item: 'milk-addon' },
    { item: 'sugar-addon' },
  ],
  custom_pos_item_variants: [
    { item: 'espresso-large' },
  ],
};

const sampleMenuItems = [
  { ...sampleSelectedItem },
  {
    id: 'milk-addon-id',
    name: 'Extra Milk',
    item_name: 'Extra Milk',
    price: 0.5,
    item: 'milk-addon',
    image: null,
    course: '',
    course_label: '',
    description: '',
    special_dish: 0 as 0 | 1,
    tax_rate: 0,
  },
  {
    id: 'sugar-addon-id',
    name: 'Extra Sugar',
    item_name: 'Extra Sugar',
    price: 0.3,
    item: 'sugar-addon',
    image: null,
    course: '',
    course_label: '',
    description: '',
    special_dish: 0 as 0 | 1,
    tax_rate: 0,
  },
  {
    id: 'espresso-large-id',
    name: 'Espresso Large',
    item_name: 'Espresso Large',
    price: 4.5,
    item: 'espresso-large',
    image: null,
    course: 'Coffee',
    course_label: 'Coffee',
    description: 'Large espresso',
    special_dish: 0 as 0 | 1,
    tax_rate: 0,
  },
];

// Mock store
const mockAddToOrder = vi.fn();
const mockRemoveFromOrder = vi.fn();
const mockSetSelectedItem = vi.fn();
const mockGetItemQuantityFromCart = vi.fn().mockReturnValue(0);

let mockStoreState: Record<string, unknown> = {
  selectedItem: sampleSelectedItem,
  addToOrder: mockAddToOrder,
  removeFromOrder: mockRemoveFromOrder,
  setSelectedItem: mockSetSelectedItem,
  getItemQuantityFromCart: mockGetItemQuantityFromCart,
  activeOrders: [],
  menuItems: sampleMenuItems,
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockStoreState,
}));

const defaultProps = {
  onClose: vi.fn(),
};

describe('ProductDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue(sampleItemDoc);
    mockStoreState = {
      selectedItem: sampleSelectedItem,
      addToOrder: mockAddToOrder,
      removeFromOrder: mockRemoveFromOrder,
      setSelectedItem: mockSetSelectedItem,
      getItemQuantityFromCart: mockGetItemQuantityFromCart,
      activeOrders: [],
      menuItems: sampleMenuItems,
    };
  });

  // Rendering
  it('should not render when selectedItem is null', () => {
    mockStoreState = { ...mockStoreState, selectedItem: null };
    render(<ProductDialog {...defaultProps} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('should render the dialog when selectedItem is present', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('should display the item name', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('Espresso')).toBeInTheDocument();
  });

  it('should display the item code', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('espresso-item')).toBeInTheDocument();
  });

  it('should display course label when present', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('Coffee')).toBeInTheDocument();
  });

  // Loading state
  it('should show loading state while fetching item doc', async () => {
    mockGetDoc.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('product_dialog.loading_addons')).toBeInTheDocument();
    });
  });

  // Error state
  it('should show addon error when item doc fetch fails', async () => {
    mockGetDoc.mockRejectedValue(new Error('Network error'));
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      // The addon section shows the error message when fetch fails
      expect(screen.getByText('errors.failed_fetch_addons')).toBeInTheDocument();
    });
  });

  // Variants
  it('should display variants section when variants exist', async () => {
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('product_dialog.variants')).toBeInTheDocument();
      expect(screen.getByText('Espresso Large')).toBeInTheDocument();
    });
  });

  it('should display variant price', async () => {
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('€ 4.5')).toBeInTheDocument();
    });
  });

  it('should not display variants section when no variants', async () => {
    mockGetDoc.mockResolvedValue({
      ...sampleItemDoc,
      custom_pos_item_variants: [],
    });
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText('product_dialog.variants')).not.toBeInTheDocument();
    });
  });

  // Add-ons
  it('should display add-ons section when add-ons exist', async () => {
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('product_dialog.addons')).toBeInTheDocument();
      expect(screen.getByText('Extra Milk')).toBeInTheDocument();
      expect(screen.getByText('Extra Sugar')).toBeInTheDocument();
    });
  });

  it('should display add-on prices', async () => {
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('+€ 0.5')).toBeInTheDocument();
      expect(screen.getByText('+€ 0.3')).toBeInTheDocument();
    });
  });

  it('should show no add-ons message when there are no add-ons', async () => {
    mockGetDoc.mockResolvedValue({
      ...sampleItemDoc,
      custom_pos_add_on_items: [],
    });
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('product_dialog.no_addons')).toBeInTheDocument();
    });
  });

  // Add-on toggle
  it('should toggle add-on selection on click', async () => {
    render(<ProductDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Extra Milk')).toBeInTheDocument();
    });
    const addonButton = screen.getByText('Extra Milk').closest('button');
    fireEvent.click(addonButton!);
    // The add-on should now show as selected (border-blue-500)
    expect(addonButton?.className).toContain('border-blue-500');
  });

  // Quantity controls
  it('should display quantity section', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('product_dialog.quantity')).toBeInTheDocument();
  });

  it('should increment quantity when + button is clicked', () => {
    render(<ProductDialog {...defaultProps} />);
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="plus-icon"]'));
    fireEvent.click(plusButtons[0]);
    const quantityInput = screen.getByRole('spinbutton');
    expect(quantityInput).toHaveValue(1);
  });

  it('should decrement quantity when - button is clicked', () => {
    render(<ProductDialog {...defaultProps} />);
    // First increment
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="plus-icon"]'));
    fireEvent.click(plusButtons[0]);
    // Then decrement
    const minusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="minus-icon"]'));
    fireEvent.click(minusButtons[0]);
    const quantityInput = screen.getByRole('spinbutton');
    expect(quantityInput).toHaveValue(0);
  });

  it('should not decrement below 0', () => {
    render(<ProductDialog {...defaultProps} />);
    const minusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="minus-icon"]'));
    fireEvent.click(minusButtons[0]);
    const quantityInput = screen.getByRole('spinbutton');
    expect(quantityInput).toHaveValue(0);
  });

  it('should allow direct quantity input', () => {
    render(<ProductDialog {...defaultProps} />);
    const quantityInput = screen.getByRole('spinbutton');
    fireEvent.change(quantityInput, { target: { value: '5' } });
    expect(quantityInput).toHaveValue(5);
  });

  // Total calculation
  it('should display total section', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('product_dialog.total')).toBeInTheDocument();
  });

  it('should calculate total based on quantity and add-ons', () => {
    render(<ProductDialog {...defaultProps} />);
    // Base price is 3.5, quantity starts at 0, total = 0
    // Increment to 1
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="plus-icon"]'));
    fireEvent.click(plusButtons[0]);
    // Total should be € 3.5 (1 * 3.5)
    expect(screen.getByText('€ 3.5')).toBeInTheDocument();
  });

  // Add to order button
  it('should disable add button when quantity is 0', () => {
    render(<ProductDialog {...defaultProps} />);
    const addButton = screen.getByText('product_dialog.add_to_order').closest('button');
    expect(addButton).toBeDisabled();
  });

  it('should enable add button when quantity is > 0', () => {
    render(<ProductDialog {...defaultProps} />);
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="plus-icon"]'));
    fireEvent.click(plusButtons[0]);
    const addButton = screen.getByText('product_dialog.add_to_order').closest('button');
    expect(addButton).not.toBeDisabled();
  });

  it('should show "Update Order" when in edit mode or existing cart item', () => {
    render(<ProductDialog {...defaultProps} editMode={true} />);
    expect(screen.getByText('product_dialog.update_order')).toBeInTheDocument();
  });

  // Add to order action
  it('should call addToOrder and close when add button is clicked with quantity > 0', () => {
    render(<ProductDialog {...defaultProps} />);
    const plusButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="plus-icon"]'));
    fireEvent.click(plusButtons[0]);
    const addButton = screen.getByText('product_dialog.add_to_order').closest('button');
    fireEvent.click(addButton!);
    expect(mockAddToOrder).toHaveBeenCalled();
    expect(mockSetSelectedItem).toHaveBeenCalledWith(null);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Close button
  it('should call setSelectedItem(null) and onClose when close button is clicked', () => {
    render(<ProductDialog {...defaultProps} />);
    const closeButtons = screen.getAllByRole('button').filter(b => b.querySelector('[data-testid="x-icon"]'));
    fireEvent.click(closeButtons[0]);
    expect(mockSetSelectedItem).toHaveBeenCalledWith(null);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Image display
  it('should show placeholder when no image is available', () => {
    render(<ProductDialog {...defaultProps} />);
    // The placeholder shows first 2 chars of itemDoc name in uppercase
    // Since itemDoc loads async, we'll check for the placeholder div
    expect(document.querySelector('.bg-gray-200')).toBeInTheDocument();
  });

  // Special instructions
  it('should display special instructions section', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByText('product_dialog.special_instructions')).toBeInTheDocument();
  });

  it('should display special instructions placeholder', () => {
    render(<ProductDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('product_dialog.special_instructions_placeholder')).toBeInTheDocument();
  });
});
