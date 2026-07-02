import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BulkActionsToolbar from './BulkActionsToolbar';

// Mock i18n
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

const mockOnEnableSelected = vi.fn();
const mockOnDisableSelected = vi.fn();
const mockOnDeleteSelected = vi.fn();
const mockOnBatchUpdatePrices = vi.fn();
const mockOnClearSelection = vi.fn();

const defaultProps = {
  selectedCount: 3,
  onEnableSelected: mockOnEnableSelected,
  onDisableSelected: mockOnDisableSelected,
  onDeleteSelected: mockOnDeleteSelected,
  onBatchUpdatePrices: mockOnBatchUpdatePrices,
  onClearSelection: mockOnClearSelection,
};

describe('BulkActionsToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when selectedCount is 0', () => {
    const { container } = render(<BulkActionsToolbar {...defaultProps} selectedCount={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when selectedCount > 0', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('common.selected_count')).toBeInTheDocument();
  });

  it('shows the selected count text', () => {
    render(<BulkActionsToolbar {...defaultProps} selectedCount={5} />);
    // The t mock returns the key, but the component also has a fallback
    expect(screen.getByText('common.selected_count')).toBeInTheDocument();
  });

  it('shows the Enable button', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('menu_management.enable_selected')).toBeInTheDocument();
  });

  it('shows the Disable button', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('menu_management.disable_selected')).toBeInTheDocument();
  });

  it('shows the Batch Prices button', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('menu_management.batch_update_prices')).toBeInTheDocument();
  });

  it('shows the Delete button', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('menu_management.delete_selected')).toBeInTheDocument();
  });

  it('shows the Clear button', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    expect(screen.getByText('common.deselect_all')).toBeInTheDocument();
  });

  it('calls onEnableSelected when Enable is clicked', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText('menu_management.enable_selected'));
    expect(mockOnEnableSelected).toHaveBeenCalledTimes(1);
  });

  it('calls onDisableSelected when Disable is clicked', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText('menu_management.disable_selected'));
    expect(mockOnDisableSelected).toHaveBeenCalledTimes(1);
  });

  it('calls onBatchUpdatePrices when Batch Prices is clicked', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText('menu_management.batch_update_prices'));
    expect(mockOnBatchUpdatePrices).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteSelected when Delete is clicked', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText('menu_management.delete_selected'));
    expect(mockOnDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('calls onClearSelection when Clear is clicked', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText('common.deselect_all'));
    expect(mockOnClearSelection).toHaveBeenCalledTimes(1);
  });

  it('renders all action buttons', () => {
    render(<BulkActionsToolbar {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    // Enable, Disable, Batch Prices, Delete, Clear = 5 buttons
    expect(buttons.length).toBe(5);
  });

  it('does not render when selectedCount is 0 even with all props', () => {
    const { container } = render(<BulkActionsToolbar {...defaultProps} selectedCount={0} />);
    expect(container.innerHTML).toBe('');
  });
});
