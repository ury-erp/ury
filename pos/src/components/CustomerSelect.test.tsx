import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CustomerSelect } from './CustomerSelect';
import { searchCustomers, addCustomer } from '../lib/customer-api';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string, params?: Record<string, string>) => {
    const translations: Record<string, string> = {
      'customer.search_placeholder': 'Search customer...',
      'customer.type_to_search': 'Type to search',
      'customer.no_customers_found': 'No customers found',
      'customer.add_new': 'Add New',
      'customer.add_with_name': 'Add {{name}}',
      'customer.failed_search': 'Search failed',
      'customer.add_customer_title': 'Add Customer',
      'common.cancel': 'Cancel',
      'common.change': 'Change',
      'common.searching': 'Searching...',
      'common.loading': 'Loading...',
      'common.no_options': 'No options',
      'customer.name_label': 'Name',
      'customer.phone_label': 'Phone',
      'customer.name_required': 'Name required',
      'customer.phone_required': 'Phone required',
      'customer.customer_group_label': 'Customer Group',
      'customer.select_group': 'Select group',
      'customer.territory_label': 'Territory',
      'customer.select_territory': 'Select territory',
      'customer.add_button': 'Add',
      'customer.adding': 'Adding...',
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

// Mock customer-api
const mockSearchCustomers = vi.fn();
const mockAddCustomer = vi.fn();
vi.mock('../lib/customer-api', () => ({
  searchCustomers: (...args: unknown[]) => mockSearchCustomers(...args),
  addCustomer: (...args: unknown[]) => mockAddCustomer(...args),
}));

// Mock error-utils
vi.mock('../lib/error-utils', () => ({
  getErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

// Mock AggregatorSelect
vi.mock('./AggregatorSelect', () => ({
  AggregatorSelect: ({ disabled }: any) => (
    <div data-testid="aggregator-select" data-disabled={disabled}>Aggregator Select</div>
  ),
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, disabled, type, className, id, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      type={type}
      className={className}
      id={id}
      {...props}
    />
  ),
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  Select: ({ children, value, onValueChange, placeholder, disabled }: any) => (
    <select value={value} onChange={(e: any) => onValueChange?.(e.target.value)} disabled={disabled} data-testid="select" aria-placeholder={placeholder}>
      {children}
    </select>
  ),
  SelectItem: ({ children, value, className }: any) => (
    <option value={value} className={className}>{children}</option>
  ),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Badge: ({ children, variant }: any) => <span data-testid="badge">{children}</span>,
  Textarea: ({ value, onChange, placeholder, className, ...props }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} className={className} {...props} />
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Loader: () => <div data-testid="loader">Loading...</div>,
}));

// Mock store
const mockSetSelectedCustomer = vi.fn();
const mockFetchCustomerGroups = vi.fn().mockResolvedValue(undefined);
const mockFetchTerritories = vi.fn().mockResolvedValue(undefined);

let mockStoreState: Record<string, unknown> = {
  selectedCustomer: null,
  setSelectedCustomer: mockSetSelectedCustomer,
  selectedOrderType: 'Take Away',
  isUpdatingOrder: false,
  customerGroups: [],
  territories: [],
  fetchCustomerGroups: mockFetchCustomerGroups,
  fetchTerritories: mockFetchTerritories,
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockStoreState,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  UserPlus: () => <span data-testid="user-plus-icon" />,
  Phone: () => <span data-testid="phone-icon" />,
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  Loader: () => <span data-testid="loader-icon" />,
}));

describe('CustomerSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearchCustomers.mockResolvedValue([]);
    mockStoreState = {
      selectedCustomer: null,
      setSelectedCustomer: mockSetSelectedCustomer,
      selectedOrderType: 'Take Away',
      isUpdatingOrder: false,
      customerGroups: [],
      territories: [],
      fetchCustomerGroups: mockFetchCustomerGroups,
      fetchTerritories: mockFetchTerritories,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Rendering
  it('should render the search input', () => {
    render(<CustomerSelect />);
    expect(screen.getByPlaceholderText('Search customer...')).toBeInTheDocument();
  });

  it('should show selected customer info when a customer is selected', () => {
    mockStoreState = {
      ...mockStoreState,
      selectedCustomer: { id: 'C001', name: 'John Doe', phone: '1234567890' },
    };
    render(<CustomerSelect />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('should show Change button when customer is selected', () => {
    mockStoreState = {
      ...mockStoreState,
      selectedCustomer: { id: 'C001', name: 'John Doe', phone: '1234567890' },
    };
    render(<CustomerSelect />);
    expect(screen.getByText('Change')).toBeInTheDocument();
  });

  // Change customer
  it('should call setSelectedCustomer(null) when Change is clicked', () => {
    mockStoreState = {
      ...mockStoreState,
      selectedCustomer: { id: 'C001', name: 'John Doe', phone: '1234567890' },
    };
    render(<CustomerSelect />);
    fireEvent.click(screen.getByText('Change'));
    expect(mockSetSelectedCustomer).toHaveBeenCalledWith(null);
  });

  // Search
  it('should call searchCustomers after debounce when typing', async () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'John' } });
    
    // Advance timers past the 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(mockSearchCustomers).toHaveBeenCalledWith('John');
    });
  });

  it('should not search when search term is empty', async () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: '' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockSearchCustomers).not.toHaveBeenCalled();
  });

  // Dropdown
  it('should show "Type to search" when dropdown is open with no search term', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.focus(input);
    expect(screen.getByText('Type to search')).toBeInTheDocument();
  });

  it('should show search results after searching', async () => {
    mockSearchCustomers.mockResolvedValue([
      { name: 'C001', content: 'Customer Name : John Doe | Mobile Number : 1234567890' },
    ]);
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'John' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('should show "No customers found" when search returns empty', async () => {
    mockSearchCustomers.mockResolvedValue([]);
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'xyz' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
  });

  // Search error
  it('should show search error when searchCustomers fails', async () => {
    mockSearchCustomers.mockRejectedValue(new Error('Network error'));
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'test' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('Search failed')).toBeInTheDocument();
    });
  });

  // Selecting customer from results
  it('should call setSelectedCustomer when a search result is clicked', async () => {
    mockSearchCustomers.mockResolvedValue([
      { name: 'C001', content: 'Customer Name : John Doe | Mobile Number : 1234567890' },
    ]);
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'John' } });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText('John Doe'));
    expect(mockSetSelectedCustomer).toHaveBeenCalledWith({
      id: 'C001',
      name: 'John Doe',
      phone: '1234567890',
    });
  });

  // Add New button
  it('should show "Add New" button in dropdown', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.focus(input);
    expect(screen.getByText('Add New')).toBeInTheDocument();
  });

  it('should show "Add {{name}}" when search term exists', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.change(input, { target: { value: 'Jane' } });
    expect(screen.getByText('Add Jane')).toBeInTheDocument();
  });

  // Aggregators mode
  it('should render AggregatorSelect when order type is Aggregators', () => {
    mockStoreState = {
      ...mockStoreState,
      selectedOrderType: 'Aggregators',
    };
    render(<CustomerSelect />);
    expect(screen.getByTestId('aggregator-select')).toBeInTheDocument();
  });

  // Disabled state
  it('should disable Change button when isUpdatingOrder is true', () => {
    mockStoreState = {
      ...mockStoreState,
      selectedCustomer: { id: 'C001', name: 'John Doe', phone: '1234567890' },
      isUpdatingOrder: true,
    };
    render(<CustomerSelect />);
    const changeButton = screen.getByText('Change');
    expect(changeButton).toBeDisabled();
  });

  // Keyboard navigation
  it('should close dropdown on Escape key', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.focus(input);
    expect(screen.getByText('Type to search')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Type to search')).not.toBeInTheDocument();
  });

  it('should open dropdown on ArrowDown key when closed', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByText('Type to search')).toBeInTheDocument();
  });

  // Add customer dialog
  it('should open add customer dialog when Add New is clicked', () => {
    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Search customer...');
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText('Add New'));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Customer')).toBeInTheDocument();
  });
});
