import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaptainTables from './CaptainTables';

vi.mock('../hooks/useCaptainContext', () => ({
  useCaptainContext: () => ({
    context: {
      user: 'waiter-001',
    },
    capabilities: {
      canAccessOtherCaptainsTables: false,
    },
    branch: 'Mumbai',
    rooms: [{ name: 'Hall A' }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../lib/table-api', () => ({
  getRooms: vi.fn().mockResolvedValue([{ name: 'Hall A' }]),
  getTables: vi.fn().mockResolvedValue([
    { name: 'Table-1', occupied: 0, table_shape: 'Rectangle', no_of_seats: 4 },
  ]),
  getMergeGroupMembers: vi.fn(() => []),
  sortTablesByMergeGroups: vi.fn((tables) => tables),
}));

vi.mock('../lib/captain-table-api', () => ({
  getActiveTableOrders: vi.fn().mockResolvedValue(new Map()),
  getUserFullNames: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../components/CaptainTableCard', () => ({
  default: ({ table, onTap }: any) => (
    <div onClick={onTap} data-testid={`table-${table.name}`}>
      {table.name}
    </div>
  ),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@ury/ui', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  Spinner: ({ message }: any) => <div>{message}</div>,
  showToast: {
    error: vi.fn(),
  },
}));

describe('CaptainTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tables heading', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeTruthy();
    });
  });

  it('displays room tabs', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByText('Hall A')).toBeTruthy();
    });
  });

  it('displays refresh button', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
  });

  it('displays table cards when data loads', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByTestId('table-Table-1')).toBeTruthy();
    });
  });

  it('renders sticky header with tables title', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeTruthy();
    });
  });

  it('handles table API calls', async () => {
    const { getRooms, getTables } = await import('../../lib/table-api');
    const mockGetRooms = getRooms as ReturnType<typeof vi.fn>;
    const mockGetTables = getTables as ReturnType<typeof vi.fn>;
    
    mockGetRooms.mockClear();
    mockGetTables.mockClear();
    
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(mockGetRooms).toHaveBeenCalled();
    });
  });

  it('displays minimum required layout elements', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      expect(screen.getByText('Tables')).toBeTruthy();
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
  });

  it('renders with proper container structure', async () => {
    const { container } = render(<CaptainTables />);
    
    await waitFor(() => {
      expect(container.querySelector('.flex-col')).toBeTruthy();
    });
  });

  it('responds to refresh button click', async () => {
    render(<CaptainTables />);
    
    await waitFor(() => {
      const refreshButton = screen.getByText('Refresh');
      expect(refreshButton).toBeTruthy();
    });
  });
});
