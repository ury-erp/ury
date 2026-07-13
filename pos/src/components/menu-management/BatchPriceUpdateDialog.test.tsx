import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchPriceUpdateDialog from './BatchPriceUpdateDialog';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock storage for formatCurrency
vi.mock('../../lib/storage', () => ({
  storage: {
    getItem: (key: string) => (key === 'currencySymbol' ? '€' : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Mock UI components
vi.mock('../ui', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => {
    const { className, variant, size, error, ...rest } = props;
    return <input {...rest} />;
  },
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>{children}</span>
  ),
  Spinner: () => <div data-testid="spinner">Loading</div>,
}));

// Mutable store state
let mockStoreState: Record<string, unknown> = {};

vi.mock('../../store/menu-management-store', () => ({
  useMenuManagementStore: () => mockStoreState,
}));

const mockItems = [
  { name: 'ROW001', item: 'ITEM001', item_name: 'Caesar Salad', rate: 12.5, special_dish: 0, disabled: 0, course: 'Starters', course_icon: null, idx: 1 },
  { name: 'ROW002', item: 'ITEM002', item_name: 'Grilled Chicken', rate: 25, special_dish: 0, disabled: 0, course: 'Main Course', course_icon: null, idx: 2 },
  { name: 'ROW003', item: 'ITEM003', item_name: 'Chocolate Cake', rate: 8.99, special_dish: 1, disabled: 0, course: null, course_icon: null, idx: 3 },
];

const mockOnClose = vi.fn();

describe('BatchPriceUpdateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      batchUpdateItemPrices: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('renders the batch update prices title', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText('menu_management.batch_update_prices')).toBeInTheDocument();
  });

  it('renders the close button', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    // The close button is in the header
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders the apply-to-all section', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText('menu_management.apply_to_all')).toBeInTheDocument();
  });

  it('renders the percentage/fixed mode selector', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const select = screen.getByDisplayValue('%');
    expect(select).toBeInTheDocument();
  });

  it('renders item names in the table', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('renders current prices formatted', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText('€ 12.5')).toBeInTheDocument();
    expect(screen.getByText('€ 25')).toBeInTheDocument();
    expect(screen.getByText('€ 8.99')).toBeInTheDocument();
  });

  it('renders new price inputs with current values', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    // The new price inputs should have the current rate as value
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8.99')).toBeInTheDocument();
  });

  it('"Update Prices" button is disabled when no changes', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const updateButton = screen.getByText('menu_management.update_prices').closest('button')!;
    expect(updateButton.disabled).toBe(true);
  });

  it('shows change indicator as 0 when no changes', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    // Each row shows "0" for no change
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it('shows 0 items updated in footer when no changes', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText(/0.*menu_management.items_updated/)).toBeInTheDocument();
  });

  it('applies percentage change to all items', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const applyInput = screen.getByPlaceholderText('+10 / -5');
    fireEvent.change(applyInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('common.apply'));
    // After 10% increase: 12.5 * 1.1 = 13.75, 25 * 1.1 = 27.5, 8.99 * 1.1 = 9.89
    expect(screen.getByDisplayValue('13.75')).toBeInTheDocument();
    expect(screen.getByDisplayValue('27.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('9.89')).toBeInTheDocument();
  });

  it('applies fixed amount change to all items', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    // Switch to fixed mode
    const select = screen.getByDisplayValue('%');
    fireEvent.change(select, { target: { value: 'fixed' } });
    const applyInput = screen.getByPlaceholderText('+50 / -20');
    fireEvent.change(applyInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('common.apply'));
    // After +5: 12.5 + 5 = 17.5, 25 + 5 = 30, 8.99 + 5 = 13.99
    expect(screen.getByDisplayValue('17.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('13.99')).toBeInTheDocument();
  });

  it('handles individual price changes', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const priceInput = screen.getByDisplayValue('12.5');
    fireEvent.change(priceInput, { target: { value: '15' } });
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
  });

  it('"Update Prices" button is enabled when there are changes', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const priceInput = screen.getByDisplayValue('12.5');
    fireEvent.change(priceInput, { target: { value: '15' } });
    const updateButton = screen.getByText('menu_management.update_prices').closest('button')!;
    expect(updateButton.disabled).toBe(false);
  });

  it('calls batchUpdateItemPrices on update', async () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const priceInput = screen.getByDisplayValue('12.5');
    fireEvent.change(priceInput, { target: { value: '15' } });
    const updateButton = screen.getByText('menu_management.update_prices').closest('button')!;
    fireEvent.click(updateButton);
    await waitFor(() => {
      expect(mockStoreState.batchUpdateItemPrices).toHaveBeenCalledWith(
        'Lunch Menu',
        [{ item_row_name: 'ROW001', rate: 15 }]
      );
    });
  });

  it('calls onClose after successful update', async () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const priceInput = screen.getByDisplayValue('12.5');
    fireEvent.change(priceInput, { target: { value: '15' } });
    fireEvent.click(screen.getByText('menu_management.update_prices').closest('button')!);
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('Cancel button calls onClose', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('Apply button is disabled when value is empty', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const applyButton = screen.getByText('common.apply').closest('button')!;
    expect(applyButton.disabled).toBe(true);
  });

  it('renders with empty items list', () => {
    render(<BatchPriceUpdateDialog items={[]} menuName="Lunch Menu" onClose={mockOnClose} />);
    expect(screen.getByText('menu_management.batch_update_prices')).toBeInTheDocument();
  });

  it('shows negative percentage change correctly', () => {
    render(<BatchPriceUpdateDialog items={mockItems} menuName="Lunch Menu" onClose={mockOnClose} />);
    const applyInput = screen.getByPlaceholderText('+10 / -5');
    fireEvent.change(applyInput, { target: { value: '-10' } });
    fireEvent.click(screen.getByText('common.apply'));
    // After -10%: 12.5 * 0.9 = 11.25, 25 * 0.9 = 22.5, 8.99 * 0.9 = 8.09
    expect(screen.getByDisplayValue('11.25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('22.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8.09')).toBeInTheDocument();
  });
});
