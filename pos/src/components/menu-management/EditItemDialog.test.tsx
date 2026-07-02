import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditItemDialog from './EditItemDialog';

// Mock i18n (not directly used but imported transitively)
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
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

const mockItem = {
  name: 'ROW001',
  item: 'ITEM001',
  item_name: 'Caesar Salad',
  rate: 12.5,
  special_dish: 0,
  disabled: 0,
  course: 'CRS001',
  course_icon: null,
  idx: 1,
};

const mockCourses = [
  { name: 'CRS001', course: 'Starters', custom_serving_priority: 1, custom_indicate_in_kds: 0 },
  { name: 'CRS002', course: 'Main Course', custom_serving_priority: 2, custom_indicate_in_kds: 0 },
];

const mockOnClose = vi.fn();

describe('EditItemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      updateItemInMenu: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('renders the "Edit Menu Item" title', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Edit Menu Item')).toBeInTheDocument();
  });

  it('shows the item name', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument();
  });

  it('shows the item code', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('ITEM001')).toBeInTheDocument();
  });

  it('pre-fills the rate from item.rate', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const rateInput = screen.getByDisplayValue('12.5');
    expect(rateInput).toBeInTheDocument();
  });

  it('shows Price label', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Price')).toBeInTheDocument();
  });

  it('shows Course / Category label', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Course / Category')).toBeInTheDocument();
  });

  it('shows course select with pre-filled value', () => {
    const { container } = render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('CRS001');
  });

  it('shows "No course" option in select', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('No course')).toBeInTheDocument();
  });

  it('shows course options in dropdown', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Starters')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
  });

  it('shows special dish checkbox with correct initial state (unchecked)', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(false);
  });

  it('shows special dish checkbox as checked when item has special_dish=1', () => {
    const specialItem = { ...mockItem, special_dish: 1 };
    render(<EditItemDialog item={specialItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(true);
  });

  it('shows "Save Changes" button', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('shows Cancel button', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('Cancel button calls onClose', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls updateItemInMenu when "Save Changes" is clicked', async () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockStoreState.updateItemInMenu).toHaveBeenCalledWith(
        'Lunch Menu',
        'ROW001',
        { rate: 12.5, course: 'CRS001', special_dish: 0 }
      );
    });
  });

  it('calls onClose after successful save', async () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('disables Save Changes button while saving', async () => {
    // Make updateItemInMenu return a promise that doesn't resolve immediately
    let resolvePromise: () => void;
    mockStoreState.updateItemInMenu = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolvePromise = resolve; })
    );
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const saveButton = screen.getByText('Save Changes').closest('button')!;
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    // Wait for the "Saving..." state to appear
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
    // Resolve the promise to clean up
    resolvePromise!();
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  it('close button (X) calls onClose', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    // The close button in the header
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('selects "No course" when item has no course', () => {
    const noCourseItem = { ...mockItem, course: null };
    render(<EditItemDialog item={noCourseItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const select = screen.getByDisplayValue('No course');
    expect(select).toBeInTheDocument();
  });

  it('updates rate when price input is changed', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const rateInput = screen.getByDisplayValue('12.5');
    fireEvent.change(rateInput, { target: { value: '15' } });
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
  });

  it('toggles special dish checkbox', () => {
    render(<EditItemDialog item={mockItem} menuName="Lunch Menu" courses={mockCourses} onClose={mockOnClose} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
