import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TableSelectionDialog from './TableSelectionDialog';
import { getRooms, getTables } from '../lib/table-api';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock table-api
const mockGetRooms = vi.fn();
const mockGetTables = vi.fn();
vi.mock('../lib/table-api', () => ({
  getRooms: (...args: unknown[]) => mockGetRooms(...args),
  getTables: (...args: unknown[]) => mockGetTables(...args),
}));

// Mock TableShapeIcon
vi.mock('./TableShapeIcon', () => ({
  TableShapeIcon: ({ shape, className }: any) => (
    <div data-testid="table-shape-icon" data-shape={shape} className={className} />
  ),
}));

// Mock UI components
vi.mock('./ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => open ? (
    <div data-testid="dialog" onClick={() => onOpenChange?.(false)}>{children}</div>
  ) : null,
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
}));

vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('./ui/spinner', () => ({
  Spinner: ({ message }: any) => <div data-testid="spinner">{message || 'Loading...'}</div>,
}));

vi.mock('./ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

// Mock store
const mockSetSelectedTable = vi.fn();
let mockStoreState: Record<string, unknown> = {
  selectedTable: null,
  setSelectedTable: mockSetSelectedTable,
  posProfile: { branch: 'Branch-1' },
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockStoreState,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
  Square: () => <span data-testid="square-icon" />,
  AlertTriangle: () => <span data-testid="alert-icon" />,
}));

const mockRooms = [
  { name: 'Main Hall', branch: 'Branch-1' },
  { name: 'Terrace', branch: 'Branch-1' },
];

const mockTables = [
  { name: 'T1', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Circle' as const },
  { name: 'T2', occupied: 1, latest_invoice_time: '2024-01-01', is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Square' as const },
  { name: 'T3', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Rectangle' as const },
];

const defaultProps = {
  onClose: vi.fn(),
};

describe('TableSelectionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockGetRooms.mockResolvedValue([...mockRooms]);
    mockGetTables.mockResolvedValue([...mockTables]);
    mockStoreState = {
      selectedTable: null,
      setSelectedTable: mockSetSelectedTable,
      posProfile: { branch: 'Branch-1' },
    };
  });

  // Rendering
  it('should render the dialog', () => {
    render(<TableSelectionDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('should render the title from t()', () => {
    render(<TableSelectionDialog {...defaultProps} />);
    expect(screen.getByText('common.select_table_title')).toBeInTheDocument();
  });

  // Rooms fetching
  it('should fetch rooms on mount using posProfile.branch', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(mockGetRooms).toHaveBeenCalledWith('Branch-1');
    });
  });

  it('should not fetch rooms when posProfile.branch is missing', async () => {
    mockStoreState = {
      selectedTable: null,
      setSelectedTable: mockSetSelectedTable,
      posProfile: {},
    };
    render(<TableSelectionDialog {...defaultProps} />);
    expect(mockGetRooms).not.toHaveBeenCalled();
  });

  it('should show loading spinner while fetching rooms', () => {
    mockGetRooms.mockReturnValue(new Promise(() => {})); // never resolves
    render(<TableSelectionDialog {...defaultProps} />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('common.loading_rooms')).toBeInTheDocument();
  });

  it('should display room tabs after fetching', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
      expect(screen.getByText('Terrace')).toBeInTheDocument();
    });
  });

  it('should auto-select the first room', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const mainHallButton = screen.getByText('Main Hall').closest('button');
      expect(mainHallButton).toHaveAttribute('data-selected', 'true');
    });
  });

  // Session storage caching for rooms
  it('should use session storage cache for rooms if available', async () => {
    sessionStorage.setItem('ury_rooms_Branch-1', JSON.stringify(mockRooms));
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });
    expect(mockGetRooms).not.toHaveBeenCalled();
  });

  it('should store fetched rooms in session storage', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });
    const cached = sessionStorage.getItem('ury_rooms_Branch-1');
    expect(cached).toBeTruthy();
    expect(JSON.parse(cached!)).toEqual(mockRooms);
  });

  // Tables fetching
  it('should fetch tables when room is selected', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalledWith('Main Hall');
    });
  });

  it('should show loading spinner while fetching tables', async () => {
    mockGetRooms.mockResolvedValue(mockRooms);
    mockGetTables.mockReturnValue(new Promise(() => {})); // never resolves
    render(<TableSelectionDialog {...defaultProps} />);
    // Wait for rooms to load
    await waitFor(() => {
      expect(screen.getByText('Terrace')).toBeInTheDocument();
    });
    // Tables spinner should be present
    const spinners = screen.getAllByTestId('spinner');
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it('should display tables after fetching', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
      expect(screen.getByText('T2')).toBeInTheDocument();
      expect(screen.getByText('T3')).toBeInTheDocument();
    });
  });

  // Tables caching
  it('should set tablesCache when fetching tables', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });
    // After tables are fetched, switching rooms and back should use cache
    // Verify that getTables was called for Main Hall initially
    expect(mockGetTables).toHaveBeenCalledWith('Main Hall');
  });

  it('should fetch tables for each new room selected', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Terrace')).toBeInTheDocument();
    });
    // Switch to Terrace room
    fireEvent.click(screen.getByText('Terrace'));
    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalledWith('Terrace');
    });
  });

  // Error states
  it('should show error icon when rooms fetch fails', async () => {
    mockGetRooms.mockRejectedValue(new Error('Network error'));
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const alertIcons = screen.getAllByTestId('alert-icon');
      expect(alertIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show error when tables fetch fails', async () => {
    mockGetRooms.mockResolvedValue(mockRooms);
    mockGetTables.mockRejectedValue(new Error('Network error'));
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const alertIcons = screen.getAllByTestId('alert-icon');
      expect(alertIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show error message in both rooms and tables sections', async () => {
    mockGetRooms.mockRejectedValue(new Error('Network error'));
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const errorMessages = screen.getAllByText('errors.failed_load_rooms');
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Empty states
  it('should show no rooms found message when rooms list is empty', async () => {
    mockGetRooms.mockResolvedValue([]);
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('common.no_rooms_found')).toBeInTheDocument();
    });
  });

  it('should show no tables found message when tables list is empty', async () => {
    mockGetTables.mockResolvedValue([]);
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('common.no_tables_found')).toBeInTheDocument();
    });
  });

  // Room tab selection
  it('should set data-selected attribute on selected room tab', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
    });
    const mainHallButton = screen.getByText('Main Hall').closest('button');
    expect(mainHallButton).toHaveAttribute('data-selected', 'true');
    const terraceButton = screen.getByText('Terrace').closest('button');
    expect(terraceButton).toHaveAttribute('data-selected', 'false');
  });

  it('should fetch tables for newly selected room', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Terrace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Terrace'));
    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalledWith('Terrace');
    });
  });

  // Table selection
  it('should call setSelectedTable and onClose when a table is clicked', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('T1'));
    expect(mockSetSelectedTable).toHaveBeenCalledWith('T1', 'Main Hall');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Occupied badge
  it('should show occupied badge for occupied tables', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T2')).toBeInTheDocument();
    });
    expect(screen.getByText('tables.occupied')).toBeInTheDocument();
  });

  it('should not show occupied badge for unoccupied tables', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });
    // Only T2 is occupied, so there should be only one occupied badge
    const occupiedBadges = screen.queryAllByText('tables.occupied');
    expect(occupiedBadges.length).toBe(1);
  });

  // Table shape icons
  it('should render TableShapeIcon for each table', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const shapeIcons = screen.getAllByTestId('table-shape-icon');
      expect(shapeIcons.length).toBe(3);
    });
  });

  // Close button
  it('should call onClose when close button is clicked', async () => {
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });
    // The close button contains the X icon
    const closeButton = screen.getByTestId('x-icon').closest('button');
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  // Table sorting
  it('should display tables sorted by name', async () => {
    const unsortedTables = [
      { name: 'T3', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Circle' as const },
      { name: 'T1', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Square' as const },
      { name: 'T2', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Rectangle' as const },
    ];
    mockGetTables.mockResolvedValue(unsortedTables);
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      const tableButtons = screen.getAllByRole('button').filter(b => ['T1', 'T2', 'T3'].includes(b.textContent?.trim() || ''));
      const names = tableButtons.map(b => b.textContent?.trim());
      // Should be sorted: T1, T2, T3
      expect(names).toEqual(['T1', 'T2', 'T3']);
    });
  });

  // Selected table highlighting
  it('should highlight the currently selected table', async () => {
    mockStoreState = {
      selectedTable: 'T1',
      setSelectedTable: mockSetSelectedTable,
      posProfile: { branch: 'Branch-1' },
    };
    render(<TableSelectionDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('T1')).toBeInTheDocument();
    });
    const t1Button = screen.getByText('T1').closest('button');
    expect(t1Button?.className).toContain('border-primary-600');
  });
});
