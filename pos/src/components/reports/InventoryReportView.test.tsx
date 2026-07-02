import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InventoryReportView from './InventoryReportView';

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

// Mock Badge component
vi.mock('../ui', () => ({
  Badge: ({ children, variant, size, className }: any) => (
    <div data-testid="badge" data-variant={variant} data-size={size} className={className}>
      {children}
    </div>
  ),
}));

// Module-level mutable store state
let mockStoreState: Record<string, unknown> = {
  inventoryReport: null,
};

vi.mock('../../store/reports-store', () => ({
  useReportsStore: () => mockStoreState,
}));

// Sample data factory
const createInventoryReport = (overrides = {}) => ({
  from_date: '2025-01-01',
  to_date: '2025-01-31',
  summary: {
    total_items: 50,
    low_stock_items: 5,
    out_of_stock_items: 2,
    total_stock_value: 25000,
  },
  items: [
    {
      item_code: 'ITEM001',
      item_name: 'Chicken Breast (kg)',
      current_stock: 45,
      reorder_level: 20,
      stock_uom: 'kg',
      valuation_rate: 8.5,
      stock_value: 382.5,
      status: 'OK' as const,
    },
    {
      item_code: 'ITEM002',
      item_name: 'Olive Oil (L)',
      current_stock: 8,
      reorder_level: 10,
      stock_uom: 'L',
      valuation_rate: 12.0,
      stock_value: 96.0,
      status: 'Low' as const,
    },
    {
      item_code: 'ITEM003',
      item_name: 'Fresh Salmon (kg)',
      current_stock: 0,
      reorder_level: 5,
      stock_uom: 'kg',
      valuation_rate: 22.0,
      stock_value: 0,
      status: 'Out of Stock' as const,
    },
  ],
  ...overrides,
});

describe('InventoryReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      inventoryReport: null,
    };
  });

  // ─── Placeholder Data (when store report is null) ─────────────────

  it('renders with placeholder data when inventoryReport is null', () => {
    render(<InventoryReportView />);
    // Placeholder has total_items: 156
    expect(screen.getByText('156')).toBeInTheDocument();
  });

  it('renders summary cards with placeholder data', () => {
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.totalItems')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.lowStock')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.outOfStock')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.totalValue')).toBeInTheDocument();
  });

  // ─── Summary Cards with Real Data ─────────────────────────────────

  it('renders total items summary card', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.totalItems')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders low stock items summary card', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.lowStock')).toBeInTheDocument();
    // '5' appears in summary card and reorder_level column
    const fiveValues = screen.getAllByText('5');
    expect(fiveValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders out of stock summary card', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.outOfStock')).toBeInTheDocument();
    // '2' appears in summary card
    const twoValues = screen.getAllByText('2');
    expect(twoValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders total stock value summary card', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.totalValue')).toBeInTheDocument();
    expect(screen.getByText('€ 25000')).toBeInTheDocument();
  });

  // ─── Low Stock Alert ──────────────────────────────────────────────

  it('renders low stock alert when there are low/out-of-stock items', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.reorderNote')).toBeInTheDocument();
  });

  it('renders out-of-stock count in alert', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    // Text is broken across elements: "2 reports.inventory.outOfStockAlert"
    expect(screen.getByText(/reports\.inventory\.outOfStockAlert/)).toBeInTheDocument();
  });

  it('renders low stock count in alert', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    // Text is broken across elements
    expect(screen.getByText(/reports\.inventory\.lowStockAlert/)).toBeInTheDocument();
  });

  it('does not render alert when no low or out-of-stock items', () => {
    mockStoreState.inventoryReport = createInventoryReport({
      summary: {
        total_items: 50,
        low_stock_items: 0,
        out_of_stock_items: 0,
        total_stock_value: 25000,
      },
    });
    render(<InventoryReportView />);
    expect(screen.queryByText('reports.inventory.reorderNote')).not.toBeInTheDocument();
  });

  // ─── Inventory Table ──────────────────────────────────────────────

  it('renders stock levels heading', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.stockLevels')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.item')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.currentStock')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.reorderLevel')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.status')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.unit')).toBeInTheDocument();
    expect(screen.getByText('reports.inventory.value')).toBeInTheDocument();
  });

  it('renders item names in the table', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('Chicken Breast (kg)')).toBeInTheDocument();
    expect(screen.getByText('Olive Oil (L)')).toBeInTheDocument();
    expect(screen.getByText('Fresh Salmon (kg)')).toBeInTheDocument();
  });

  it('renders current stock values', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    // 0 stock for out-of-stock item
    const zeroStocks = screen.getAllByText('0');
    expect(zeroStocks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders reorder levels', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    const twentyValues = screen.getAllByText('20');
    expect(twentyValues.length).toBeGreaterThanOrEqual(1);
    const tenValues = screen.getAllByText('10');
    expect(tenValues.length).toBeGreaterThanOrEqual(1);
    const fiveValues = screen.getAllByText('5');
    expect(fiveValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders stock units (UOM)', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    // "kg" appears multiple times (items 1 and 3)
    const kgLabels = screen.getAllByText('kg');
    expect(kgLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('renders stock values as currency', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('€ 382.5')).toBeInTheDocument();
    expect(screen.getByText('€ 96')).toBeInTheDocument();
  });

  // ─── Status Badges ────────────────────────────────────────────────

  it('renders status badges for items', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    const badges = screen.getAllByTestId('badge');
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it('renders OK status in badge', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders Low status in badge', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders Out of Stock status in badge', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });

  it('applies success variant for OK status', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    const badges = screen.getAllByTestId('badge');
    const okBadge = badges.find((b) => b.textContent?.includes('OK'));
    expect(okBadge?.getAttribute('data-variant')).toBe('success');
  });

  it('applies warning variant for Low status', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    const badges = screen.getAllByTestId('badge');
    const lowBadge = badges.find((b) => b.textContent?.includes('Low'));
    expect(lowBadge?.getAttribute('data-variant')).toBe('warning');
  });

  it('applies danger variant for Out of Stock status', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    render(<InventoryReportView />);
    const badges = screen.getAllByTestId('badge');
    const oosBadge = badges.find((b) => b.textContent?.includes('Out of Stock'));
    expect(oosBadge?.getAttribute('data-variant')).toBe('danger');
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('renders empty items list without error', () => {
    mockStoreState.inventoryReport = createInventoryReport({
      summary: {
        total_items: 0,
        low_stock_items: 0,
        out_of_stock_items: 0,
        total_stock_value: 0,
      },
      items: [],
    });
    render(<InventoryReportView />);
    expect(screen.getByText('reports.inventory.stockLevels')).toBeInTheDocument();
    // Table should exist but with no data rows
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
  });

  it('renders grid layout for summary cards', () => {
    mockStoreState.inventoryReport = createInventoryReport();
    const { container } = render(<InventoryReportView />);
    const grid = container.querySelector('.grid.grid-cols-2');
    expect(grid).toBeInTheDocument();
  });
});
