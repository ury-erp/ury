import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LayoutView from './LayoutView';

// ---- Mocks ----

vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveDirection: () => 'ltr',
  getActiveLanguage: () => 'en',
  initI18n: vi.fn(),
}));

vi.mock('../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatInvoiceTime: (ts: string | null) => ts || 'No time',
}));

vi.mock('../lib/table-api', () => ({
  updateTableLayout: vi.fn().mockResolvedValue({}),
}));

vi.mock('../lib/order-api', () => ({
  getTableOrder: vi.fn().mockResolvedValue({ message: { name: 'INV-001', grand_total: 100 } }),
}));

vi.mock('./ui', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Badge: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Spinner: () => <div data-testid="spinner" />,
}));

const mockOnBackToGrid = vi.fn();
const mockOnRefresh = vi.fn();

const sampleTables = [
  {
    name: 'Table-1',
    occupied: 0,
    latest_invoice_time: null,
    is_take_away: 0,
    restaurant_room: 'Main Hall',
    table_shape: 'Circle' as const,
    no_of_seats: 4,
    layout_x: 100,
    layout_y: 100,
    minimum_seating: 1,
  },
  {
    name: 'Table-2',
    occupied: 1,
    latest_invoice_time: '2025-01-01 12:00:00',
    is_take_away: 0,
    restaurant_room: 'Main Hall',
    table_shape: 'Rectangle' as const,
    no_of_seats: 6,
    layout_x: 300,
    layout_y: 100,
    minimum_seating: 2,
  },
];

const defaultProps = {
  selectedRoom: 'Main Hall',
  tables: sampleTables,
  onBackToGrid: mockOnBackToGrid,
  onRefresh: mockOnRefresh,
};

describe('LayoutView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header with room name and grid view button', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText('tables.grid_view')).toBeInTheDocument();
    // Room name is inside h2 with other children, use container query
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Main Hall');
    expect(heading.textContent).toContain('tables.layout');
  });

  it('calls onBackToGrid when grid view button is clicked', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByText('tables.grid_view'));
    expect(mockOnBackToGrid).toHaveBeenCalledTimes(1);
  });

  it('renders zoom controls', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset Zoom & Pan')).toBeInTheDocument();
  });

  it('displays initial zoom level at 100%', () => {
    render(<LayoutView {...defaultProps} />);
    // Zoom display splits number and % sign, use textContent match
    const zoomDisplay = screen.getByText(/100/);
    expect(zoomDisplay.textContent).toContain('100');
  });

  it('increases zoom when zoom in button is clicked', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(screen.getByText(/110/)).toBeInTheDocument();
  });

  it('decreases zoom when zoom out button is clicked', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Zoom Out'));
    expect(screen.getByText(/90/)).toBeInTheDocument();
  });

  it('resets zoom and pan when reset button is clicked', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(screen.getByText(/110/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Reset Zoom & Pan'));
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('renders edit layout button in default (non-edit) mode', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText('tables.edit_layout')).toBeInTheDocument();
  });

  it('toggles to edit mode and shows finish editing button', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByText('tables.edit_layout'));
    expect(screen.getByText('tables.finish_editing')).toBeInTheDocument();
  });

  it('calls onRefresh when toggling from edit mode back to normal', () => {
    render(<LayoutView {...defaultProps} />);
    // Enter edit mode
    fireEvent.click(screen.getByText('tables.edit_layout'));
    // Exit edit mode
    fireEvent.click(screen.getByText('tables.finish_editing'));
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders table names on the canvas', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText('Table-1')).toBeInTheDocument();
    expect(screen.getByText('Table-2')).toBeInTheDocument();
  });

  it('renders table seat counts', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('shows zoom/pan hint when not in edit mode', () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText('tables.zoom_pan_hint')).toBeInTheDocument();
  });

  it('shows edit mode hints when in edit mode', () => {
    render(<LayoutView {...defaultProps} />);
    fireEvent.click(screen.getByText('tables.edit_layout'));
    expect(screen.getByText('tables.editing_layout_hint_title')).toBeInTheDocument();
    expect(screen.getByText('tables.drag_tables_hint')).toBeInTheDocument();
    expect(screen.getByText('tables.autosave_hint')).toBeInTheDocument();
  });

  it('shows table properties panel when a table is clicked', async () => {
    render(<LayoutView {...defaultProps} />);
    const table1 = screen.getByText('Table-1');
    fireEvent.mouseDown(table1.closest('[class]')!, { clientX: 150, clientY: 150, stopPropagation: vi.fn() });
    await waitFor(() => {
      expect(screen.getByText('tables.table_name')).toBeInTheDocument();
    });
  });

  it('renders empty state when no tables provided', () => {
    render(<LayoutView {...defaultProps} tables={[]} />);
    // Canvas should exist but no tables rendered
    expect(screen.queryByText('Table-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Table-2')).not.toBeInTheDocument();
  });

  it('does not call onRefresh when it is undefined', () => {
    render(<LayoutView {...defaultProps} onRefresh={undefined} />);
    fireEvent.click(screen.getByText('tables.edit_layout'));
    fireEvent.click(screen.getByText('tables.finish_editing'));
    // onRefresh is undefined so it shouldn't throw
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });

  it('zoom stays within bounds (max 3x)', () => {
    render(<LayoutView {...defaultProps} />);
    const zoomInBtn = screen.getByTitle('Zoom In');
    // Click zoom in 25 times (would go to 3.5 without bounds)
    for (let i = 0; i < 25; i++) {
      fireEvent.click(zoomInBtn);
    }
    expect(screen.getByText(/300/)).toBeInTheDocument();
  });

  it('zoom stays within bounds (min 0.3x)', () => {
    render(<LayoutView {...defaultProps} />);
    const zoomOutBtn = screen.getByTitle('Zoom Out');
    for (let i = 0; i < 20; i++) {
      fireEvent.click(zoomOutBtn);
    }
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });
});
