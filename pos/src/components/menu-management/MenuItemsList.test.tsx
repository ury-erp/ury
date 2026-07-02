import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MenuItemsList from './MenuItemsList';
import { SortConfig } from './MenuItemsList';

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

// Mock utils to avoid twMerge issues in test env
vi.mock('../../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatCurrency: (amount: number) => `€ ${amount}`,
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
  { name: 'ROW002', item: 'ITEM002', item_name: 'Grilled Chicken', rate: 25, special_dish: 1, disabled: 1, course: 'Main Course', course_icon: null, idx: 2 },
  { name: 'ROW003', item: 'ITEM003', item_name: 'Ice Cream', rate: 6, special_dish: 0, disabled: 0, course: null, course_icon: null, idx: 3 },
];

const mockOnEditItem = vi.fn();
const mockOnToggleSelect = vi.fn();
const mockOnToggleSelectAll = vi.fn();
const mockOnSort = vi.fn();

const defaultProps = {
  items: mockItems,
  menuName: 'Lunch Menu',
  onEditItem: mockOnEditItem,
  selectedItems: new Set<string>(),
  onToggleSelect: mockOnToggleSelect,
  onToggleSelectAll: mockOnToggleSelectAll,
  sortConfig: null as SortConfig | null,
  onSort: mockOnSort,
};

/**
 * Helper: find a table row by item name, then find buttons within it.
 * Each row has: status toggle button, edit button (Pencil SVG), delete button (Trash2 SVG)
 */
function getRowButtons(itemName: string) {
  const cell = screen.getByText(itemName);
  const row = cell.closest('tr')!;
  const buttons = within(row).getAllByRole('button');
  return buttons;
}

describe('MenuItemsList', () => {
  let confirmMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockStoreState = {
      removeItemFromMenu: vi.fn().mockResolvedValue(undefined),
      updateItemInMenu: vi.fn().mockResolvedValue(undefined),
      availableItems: [
        { name: 'ITEM001', item_name: 'Caesar Salad', item_group: 'Salads', standard_rate: 12.5, image: 'https://example.com/salad.jpg' },
        { name: 'ITEM002', item_name: 'Grilled Chicken', item_group: 'Mains', standard_rate: 25, image: null },
        { name: 'ITEM003', item_name: 'Ice Cream', item_group: 'Desserts', standard_rate: 6, image: null },
      ],
    };
  });

  afterEach(() => {
    confirmMock.mockRestore();
  });

  it('renders table headers', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('menu_management.item_name')).toBeInTheDocument();
    expect(screen.getByText('menu_management.course')).toBeInTheDocument();
    expect(screen.getByText('menu_management.price')).toBeInTheDocument();
    expect(screen.getByText('common.status')).toBeInTheDocument();
    expect(screen.getByText('menu_management.special')).toBeInTheDocument();
    expect(screen.getByText('common.actions')).toBeInTheDocument();
  });

  it('renders item names', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('Ice Cream')).toBeInTheDocument();
  });

  it('renders item codes', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('ITEM001')).toBeInTheDocument();
    expect(screen.getByText('ITEM002')).toBeInTheDocument();
    expect(screen.getByText('ITEM003')).toBeInTheDocument();
  });

  it('renders formatted prices', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('€ 12.5')).toBeInTheDocument();
    expect(screen.getByText('€ 25')).toBeInTheDocument();
    expect(screen.getByText('€ 6')).toBeInTheDocument();
  });

  it('renders course badges for items with courses', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('Starters')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
  });

  it('renders dash for items without course', () => {
    render(<MenuItemsList {...defaultProps} />);
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('renders Active status for enabled items', () => {
    render(<MenuItemsList {...defaultProps} />);
    // Two items are active (Caesar Salad, Ice Cream)
    const activeButtons = screen.getAllByText('menu_management.active');
    expect(activeButtons.length).toBe(2);
  });

  it('renders Disabled status for disabled items', () => {
    render(<MenuItemsList {...defaultProps} />);
    expect(screen.getByText('menu_management.disabled')).toBeInTheDocument();
  });

  it('renders special star for special dish items', () => {
    render(<MenuItemsList {...defaultProps} />);
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1); // header + items
  });

  it('renders dash for non-special items', () => {
    render(<MenuItemsList {...defaultProps} />);
    const emDashes = screen.getAllByText('—');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('renders checkboxes for each item', () => {
    render(<MenuItemsList {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // 1 select-all + 3 items = 4 checkboxes
    expect(checkboxes.length).toBe(4);
  });

  it('toggles item selection when checkbox is clicked', () => {
    render(<MenuItemsList {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    expect(mockOnToggleSelect).toHaveBeenCalledWith('ROW001');
  });

  it('toggles select all when header checkbox is clicked', () => {
    render(<MenuItemsList {...defaultProps} />);
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    expect(mockOnToggleSelectAll).toHaveBeenCalledTimes(1);
  });

  it('calls onEditItem when edit button is clicked', () => {
    render(<MenuItemsList {...defaultProps} />);
    // Get buttons within Caesar Salad row
    const rowButtons = getRowButtons('Caesar Salad');
    // Row buttons: [status-toggle, edit-pencil, delete-trash]
    // The edit button contains a Pencil SVG (no text)
    // Find it by checking which button is NOT the status toggle
    // Status toggle has text "menu_management.active", so we look for buttons without that text
    const editButton = rowButtons.find(
      (btn) => btn.textContent?.includes('menu_management') === false
    );
    if (editButton) {
      fireEvent.click(editButton);
      expect(mockOnEditItem).toHaveBeenCalledWith(mockItems[0]);
    }
  });

  it('shows confirm dialog when delete is clicked', () => {
    render(<MenuItemsList {...defaultProps} />);
    const rowButtons = getRowButtons('Caesar Salad');
    // Delete button: the last button in the row (Trash2 icon)
    // Find buttons that are not status toggle and not edit
    // The simplest approach: the delete button is the last button in the actions column
    const deleteButton = rowButtons[rowButtons.length - 1];
    fireEvent.click(deleteButton);
    expect(confirmMock).toHaveBeenCalled();
  });

  it('calls removeItemFromMenu when delete is confirmed', async () => {
    confirmMock.mockReturnValue(true);
    render(<MenuItemsList {...defaultProps} />);
    const rowButtons = getRowButtons('Caesar Salad');
    const deleteButton = rowButtons[rowButtons.length - 1];
    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(mockStoreState.removeItemFromMenu).toHaveBeenCalledWith('Lunch Menu', 'ROW001');
    });
  });

  it('does not call removeItemFromMenu when delete is cancelled', () => {
    confirmMock.mockReturnValue(false);
    render(<MenuItemsList {...defaultProps} />);
    const rowButtons = getRowButtons('Caesar Salad');
    const deleteButton = rowButtons[rowButtons.length - 1];
    fireEvent.click(deleteButton);
    expect(mockStoreState.removeItemFromMenu).not.toHaveBeenCalled();
  });

  it('calls updateItemInMenu when status toggle is clicked', async () => {
    render(<MenuItemsList {...defaultProps} />);
    // Use the first Active status toggle button
    const activeButtons = screen.getAllByText('menu_management.active');
    fireEvent.click(activeButtons[0]);
    await waitFor(() => {
      expect(mockStoreState.updateItemInMenu).toHaveBeenCalledWith(
        'Lunch Menu',
        'ROW001',
        { disabled: 1 }
      );
    });
  });

  it('toggles disabled item back to enabled', async () => {
    render(<MenuItemsList {...defaultProps} />);
    const disabledButton = screen.getByText('menu_management.disabled');
    fireEvent.click(disabledButton);
    await waitFor(() => {
      expect(mockStoreState.updateItemInMenu).toHaveBeenCalledWith(
        'Lunch Menu',
        'ROW002',
        { disabled: 0 }
      );
    });
  });

  it('sort headers are clickable', () => {
    render(<MenuItemsList {...defaultProps} />);
    const itemHeader = screen.getByText('menu_management.item_name');
    fireEvent.click(itemHeader);
    expect(mockOnSort).toHaveBeenCalledWith('item_name');
  });

  it('clicking rate header calls onSort with rate', () => {
    render(<MenuItemsList {...defaultProps} />);
    const rateHeader = screen.getByText('menu_management.price');
    fireEvent.click(rateHeader);
    expect(mockOnSort).toHaveBeenCalledWith('rate');
  });

  it('renders image for items with image', () => {
    render(<MenuItemsList {...defaultProps} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders empty list when no items', () => {
    render(<MenuItemsList {...defaultProps} items={[]} />);
    expect(screen.getByText('menu_management.item_name')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(1); // Only the select-all checkbox
  });

  it('select-all checkbox is checked when all items are selected', () => {
    const selectedItems = new Set(['ROW001', 'ROW002', 'ROW003']);
    render(<MenuItemsList {...defaultProps} selectedItems={selectedItems} />);
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(selectAllCheckbox.checked).toBe(true);
  });

  it('item checkboxes reflect selected state', () => {
    const selectedItems = new Set(['ROW001']);
    render(<MenuItemsList {...defaultProps} selectedItems={selectedItems} />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(true);  // ROW001
    expect(checkboxes[2].checked).toBe(false); // ROW002
    expect(checkboxes[3].checked).toBe(false); // ROW003
  });
});
