import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderTypeSelect from './OrderTypeSelect';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock TableSelectionDialog
vi.mock('./TableSelectionDialog', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="table-selection-dialog">
      Table Selection Dialog
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Mock role-utils
const mockIsUserRestrictedFromTableOrders = vi.fn();
vi.mock('../lib/role-utils', () => ({
  isUserRestrictedFromTableOrders: (...args: unknown[]) => mockIsUserRestrictedFromTableOrders(...args),
}));

// Mock store
const mockSetSelectedOrderType = vi.fn();
let mockPOSStoreState: Record<string, unknown> = {
  selectedOrderType: 'Take Away',
  setSelectedOrderType: mockSetSelectedOrderType,
  selectedTable: null,
  posProfile: { name: 'Test Profile' },
  isUpdatingOrder: false,
};

let mockRootStoreState: Record<string, unknown> = {
  user: { name: 'Admin', roles: ['Admin'] },
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
  // Also provide getState for the timeout callback
}));

// We need to also provide getState for the handleTableDialogClose
vi.mock('../store/pos-store', () => {
  const getState = () => mockPOSStoreState;
  return {
    usePOSStore: Object.assign(() => mockPOSStoreState, { getState }),
  };
});

vi.mock('../store/root-store', () => ({
  useRootStore: (selector?: any) => {
    if (typeof selector === 'function') {
      return selector(mockRootStoreState);
    }
    return mockRootStoreState;
  },
}));

// Mock UI Button component
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, className, title, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} title={title} {...props}>
      {children}
    </button>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Utensils: () => <span data-testid="utensils-icon" />,
  ShoppingBag: () => <span data-testid="shopping-bag-icon" />,
  Truck: () => <span data-testid="truck-icon" />,
  Phone: () => <span data-testid="phone-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
  HandPlatter: () => <span data-testid="hand-platter-icon" />,
}));

describe('OrderTypeSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUserRestrictedFromTableOrders.mockReturnValue(false);
    mockPOSStoreState = {
      selectedOrderType: 'Take Away',
      setSelectedOrderType: mockSetSelectedOrderType,
      selectedTable: null,
      posProfile: { name: 'Test Profile' },
      isUpdatingOrder: false,
    };
    mockRootStoreState = {
      user: { name: 'Admin', roles: ['Admin'] },
    };
  });

  // Rendering
  it('should render 5 order type buttons', () => {
    render(<OrderTypeSelect />);
    const buttons = screen.getAllByRole('button');
    // 5 order type buttons, no table selection button (no table selected)
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('should render Dine In button', () => {
    render(<OrderTypeSelect />);
    expect(screen.getByText('order_types.dine_in')).toBeInTheDocument();
  });

  it('should render Take Away button', () => {
    render(<OrderTypeSelect />);
    expect(screen.getByText('order_types.take_away')).toBeInTheDocument();
  });

  it('should render Delivery button', () => {
    render(<OrderTypeSelect />);
    expect(screen.getByText('order_types.delivery')).toBeInTheDocument();
  });

  it('should render Phone In button', () => {
    render(<OrderTypeSelect />);
    expect(screen.getByText('order_types.phone_in')).toBeInTheDocument();
  });

  it('should render Aggregators button', () => {
    render(<OrderTypeSelect />);
    expect(screen.getByText('order_types.aggregators')).toBeInTheDocument();
  });

  // Selection
  it('should highlight the selected order type', () => {
    mockPOSStoreState = {
      ...mockPOSStoreState,
      selectedOrderType: 'Take Away',
    };
    render(<OrderTypeSelect />);
    const takeAwayButton = screen.getByText('order_types.take_away').closest('button');
    expect(takeAwayButton?.dataset.variant).toBe('default');
  });

  it('should call setSelectedOrderType when a non-Dine-In type is clicked', () => {
    render(<OrderTypeSelect />);
    fireEvent.click(screen.getByText('order_types.delivery'));
    expect(mockSetSelectedOrderType).toHaveBeenCalledWith('Delivery');
  });

  // Dine In behavior
  it('should open table dialog when Dine In is clicked', () => {
    render(<OrderTypeSelect />);
    fireEvent.click(screen.getByText('order_types.dine_in'));
    expect(screen.getByTestId('table-selection-dialog')).toBeInTheDocument();
  });

  it('should call setSelectedOrderType with Dine In when Dine In is clicked', () => {
    render(<OrderTypeSelect />);
    fireEvent.click(screen.getByText('order_types.dine_in'));
    expect(mockSetSelectedOrderType).toHaveBeenCalledWith('Dine In');
  });

  // Dine In restriction
  it('should not select Dine In when user is restricted', () => {
    mockIsUserRestrictedFromTableOrders.mockReturnValue(true);
    render(<OrderTypeSelect />);
    fireEvent.click(screen.getByText('order_types.dine_in'));
    expect(mockSetSelectedOrderType).not.toHaveBeenCalled();
  });

  it('should disable Dine In button when user is restricted', () => {
    mockIsUserRestrictedFromTableOrders.mockReturnValue(true);
    render(<OrderTypeSelect />);
    const dineInButton = screen.getByText('order_types.dine_in').closest('button');
    expect(dineInButton).toBeDisabled();
  });

  it('should show restriction title on Dine In button when restricted', () => {
    mockIsUserRestrictedFromTableOrders.mockReturnValue(true);
    render(<OrderTypeSelect />);
    const dineInButton = screen.getByText('order_types.dine_in').closest('button');
    expect(dineInButton).toHaveAttribute('title', 'errors.dine_in_restricted');
  });

  // Table selection display
  it('should show selected table button when Dine In and table are selected', () => {
    mockPOSStoreState = {
      ...mockPOSStoreState,
      selectedOrderType: 'Dine In',
      selectedTable: 'T1',
    };
    render(<OrderTypeSelect />);
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByTestId('hand-platter-icon')).toBeInTheDocument();
  });

  // Disabled state
  it('should disable all buttons when disabled prop is true', () => {
    render(<OrderTypeSelect disabled={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should disable all buttons when isUpdatingOrder is true', () => {
    mockPOSStoreState = {
      ...mockPOSStoreState,
      isUpdatingOrder: true,
    };
    render(<OrderTypeSelect />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});
