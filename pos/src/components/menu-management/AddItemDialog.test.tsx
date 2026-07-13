import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddItemDialog from './AddItemDialog';

// Mock i18n (not used by AddItemDialog but imported transitively)
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

const mockCourses = [
  { name: 'CRS001', course: 'Starters', custom_serving_priority: 1, custom_indicate_in_kds: 0 },
  { name: 'CRS002', course: 'Main Course', custom_serving_priority: 2, custom_indicate_in_kds: 0 },
];

const mockAvailableItems = [
  { name: 'ITEM001', item_name: 'Caesar Salad', item_group: 'Salads', standard_rate: 12.5, image: null },
  { name: 'ITEM002', item_name: 'Grilled Chicken', item_group: 'Mains', standard_rate: 25, image: null },
  { name: 'ITEM003', item_name: 'Chocolate Cake', item_group: 'Desserts', standard_rate: 8.99, image: 'https://example.com/cake.jpg' },
];

const mockOnClose = vi.fn();

describe('AddItemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      availableItems: [...mockAvailableItems],
      addItemToMenu: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('renders the "Add Item to Menu" title', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Add Item to Menu')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByPlaceholderText('Search items to add...')).toBeInTheDocument();
  });

  it('renders the close button', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    // The close button has an X icon; we can find it by role or by the parent button
    const closeButton = screen.getByRole('button', { name: '' });
    // There are multiple buttons; find the one that's the ghost variant close button
    expect(closeButton).toBeInTheDocument();
  });

  it('shows available items in the list', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('shows formatted prices for items', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('€ 12.5')).toBeInTheDocument();
    expect(screen.getByText('€ 25')).toBeInTheDocument();
    expect(screen.getByText('€ 8.99')).toBeInTheDocument();
  });

  it('shows "No items found" when no available items', () => {
    mockStoreState.availableItems = [];
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('filters items by search query', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const searchInput = screen.getByPlaceholderText('Search items to add...');
    fireEvent.change(searchInput, { target: { value: 'chicken' } });
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.queryByText('Caesar Salad')).not.toBeInTheDocument();
    expect(screen.queryByText('Chocolate Cake')).not.toBeInTheDocument();
  });

  it('filters items by item name (code)', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const searchInput = screen.getByPlaceholderText('Search items to add...');
    fireEvent.change(searchInput, { target: { value: 'ITEM003' } });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
    expect(screen.queryByText('Caesar Salad')).not.toBeInTheDocument();
  });

  it('shows configuration view after selecting an item', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Course / Category')).toBeInTheDocument();
    expect(screen.getByText('Mark as Special Dish')).toBeInTheDocument();
  });

  it('pre-fills rate with item standard_rate on selection', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    // The price input should have the default standard_rate value
    const priceInput = screen.getByDisplayValue('12.5');
    expect(priceInput).toBeInTheDocument();
  });

  it('shows course options in the select dropdown', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    const select = screen.getByDisplayValue('No course');
    expect(select).toBeInTheDocument();
    // Check that course options are available
    expect(screen.getByText('Starters')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
  });

  it('"Add to Menu" button is disabled when rate <= 0', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    const priceInput = screen.getByDisplayValue('12.5');
    fireEvent.change(priceInput, { target: { value: '0' } });
    const addButton = screen.getByText('Add to Menu');
    expect(addButton.closest('button')).toBeDisabled();
  });

  it('"Add to Menu" button is enabled when rate > 0', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    const addButton = screen.getByText('Add to Menu');
    expect(addButton.closest('button')).not.toBeDisabled();
  });

  it('calls addItemToMenu when "Add to Menu" is clicked', async () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    const addButton = screen.getByText('Add to Menu');
    fireEvent.click(addButton);
    await waitFor(() => {
      expect(mockStoreState.addItemToMenu).toHaveBeenCalledWith(
        'Lunch Menu',
        'ITEM001',
        12.5,
        null,
        0
      );
    });
  });

  it('calls onClose after successful add', async () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    fireEvent.click(screen.getByText('Add to Menu'));
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('clicking "Back" returns to item list view', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    expect(screen.getByText('Price')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search items to add...')).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    // Find the X button in the header (it's the first button with an SVG icon)
    const headerButtons = screen.getAllByRole('button');
    // The first button is the close button (X icon in header)
    fireEvent.click(headerButtons[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows "No items found" when search matches nothing', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const searchInput = screen.getByPlaceholderText('Search items to add...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('toggles special dish checkbox', () => {
    render(<AddItemDialog menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Caesar Salad'));
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
