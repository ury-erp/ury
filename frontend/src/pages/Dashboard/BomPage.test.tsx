import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BomPage, { getBomStatus } from './BomPage';
import { call } from '@ury/core';

let mockCompanyState = {
  activeCompanyId: 'all',
  companies: [
    { name: 'Tridz Co', company_name: 'Tridz Technologies' },
    { name: 'Other Co', company_name: 'Other Enterprise' },
  ],
};

let mockBranchState = {
  activeBranchId: 'all',
  activeBranch: null as any,
  branches: [
    { id: 'branch-1', name: 'Branch 1', company: 'Tridz Co' },
    { id: 'branch-2', name: 'Branch 2', company: 'Other Co' },
  ],
};

vi.mock('../../context/CurrencyContext', () => ({
  useCurrency: () => ({
    symbol: '₹',
  }),
}));

vi.mock('../../context/CompanyContext', () => ({
  useCompanyContext: () => mockCompanyState,
}));

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => mockBranchState,
}));

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn(),
    formatCurrency: (amount: number) => `₹${amount}`,
  };
});

vi.mock('@ury/ui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    showToast: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../../components/DeskLink', () => ({
  DeskLink: ({ label, doctype, name }: any) => (
    <span data-testid="desk-link" data-doctype={doctype} data-name={name}>
      {label || 'DeskLink'}
    </span>
  ),
  useDeskPermission: () => ({ read: true, write: true }),
}));

vi.mock('../../components/common/SearchableSelect', () => ({
  SearchableSelect: ({ id, value, onChange, options, placeholder }: any) => (
    <select
      data-testid={id}
      value={value}
      onChange={(e) => onChange(id, e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../components/layout/SideDrawer', () => ({
  default: ({ isOpen, title, subtitle, children }: any) => {
    return isOpen ? (
      <div data-testid="side-drawer">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    ) : null;
  },
}));

const mockBoms = [
  {
    name: 'BOM-BIRYANI-001',
    item: 'BIRYANI',
    item_name: 'Chicken Biryani',
    company: 'Tridz Co',
    quantity: 1,
    uom: 'Plate',
    is_active: 1,
    is_default: 1,
    docstatus: 1, // Submitted & Default -> "Default"
    raw_material_cost: 120,
    total_cost: 120,
    rm_cost_as_per: 'Valuation Rate',
  },
  {
    name: 'BOM-BURGER-001',
    item: 'BURGER',
    item_name: 'Veg Burger',
    company: 'Tridz Co',
    quantity: 1,
    uom: 'Nos',
    is_active: 0,
    is_default: 0,
    docstatus: 0, // Draft -> "Draft"
    raw_material_cost: 45,
    total_cost: 45,
    rm_cost_as_per: 'Valuation Rate',
  },
  {
    name: 'BOM-PIZZA-001',
    item: 'PIZZA',
    item_name: 'Cheese Pizza',
    company: 'Other Co',
    quantity: 1,
    uom: 'Nos',
    is_active: 1,
    is_default: 0,
    docstatus: 1, // Submitted & Active -> "Active"
    raw_material_cost: 80,
    total_cost: 80,
    rm_cost_as_per: 'Valuation Rate',
  },
  {
    name: 'BOM-PASTA-001',
    item: 'PASTA',
    item_name: 'White Sauce Pasta',
    company: 'Tridz Co',
    quantity: 1,
    uom: 'Bowl',
    is_active: 0,
    is_default: 0,
    docstatus: 1, // Submitted & Inactive -> "Not active"
    raw_material_cost: 60,
    total_cost: 60,
    rm_cost_as_per: 'Valuation Rate',
  },
  {
    name: 'BOM-SOUP-001',
    item: 'SOUP',
    item_name: 'Tomato Soup',
    company: 'Tridz Co',
    quantity: 1,
    uom: 'Bowl',
    is_active: 0,
    is_default: 0,
    docstatus: 2, // Cancelled -> "Cancelled"
    raw_material_cost: 30,
    total_cost: 30,
    rm_cost_as_per: 'Valuation Rate',
  },
];

const mockBomItems = [
  {
    parent: 'BOM-BIRYANI-001',
    item_code: 'RICE',
    item_name: 'Basmati Rice',
    qty: 0.25,
    uom: 'Kg',
    rate: 100,
    amount: 25,
  },
  {
    parent: 'BOM-BIRYANI-001',
    item_code: 'CHICKEN',
    item_name: 'Chicken Meat',
    qty: 0.3,
    uom: 'Kg',
    rate: 250,
    amount: 75,
  },
  {
    parent: 'BOM-BURGER-001',
    item_code: 'BUN',
    item_name: 'Burger Bun',
    qty: 1,
    uom: 'Nos',
    rate: 20,
    amount: 20,
  },
  {
    parent: 'BOM-PIZZA-001',
    item_code: 'CHEESE',
    item_name: 'Mozzarella Cheese',
    qty: 0.2,
    uom: 'Kg',
    rate: 400,
    amount: 80,
  },
];

describe('BomPage - View Only BOM Inspection', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockCompanyState.activeCompanyId = 'all';
    mockBranchState.activeBranchId = 'all';
    mockBranchState.activeBranch = null;

    (call as any).mockImplementation((method: string, args: any) => {
      if (method === 'frappe.client.get_list') {
        if (args?.doctype === 'BOM') {
          return Promise.resolve(mockBoms);
        }
        if (args?.doctype === 'BOM Item') {
          return Promise.resolve(mockBomItems);
        }
        if (args?.doctype === 'URY Item Production Configuration') {
          return Promise.resolve([
            { bom: 'BOM-BIRYANI-001', branch: 'branch-1' },
          ]);
        }
        return Promise.resolve([]);
      }
      if (method === 'frappe.client.get') {
        const found = mockBoms.find((b) => b.name === args?.name);
        const items = mockBomItems.filter((i) => i.parent === args?.name);
        return Promise.resolve({
          ...(found || {}),
          items,
        });
      }
      return Promise.resolve({});
    });
  });

  it('renders BOM list with records from ERPNext', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
      expect(screen.getByText('Veg Burger')).toBeInTheDocument();
      expect(screen.getByText('Cheese Pizza')).toBeInTheDocument();
    });

    expect(screen.getByText('5 BOMs')).toBeInTheDocument();
  });

  it('does NOT render any create property (no New BOM or Create buttons)', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    // Verify there is no "New BOM" button
    expect(screen.queryByRole('button', { name: /New BOM/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Create BOM/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create First BOM/i)).not.toBeInTheDocument();
  });

  it('does NOT render any delete property (no delete buttons or delete dialog)', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    // Verify there are no delete buttons
    expect(screen.queryByTitle('Delete BOM')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete Draft')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
  });

  it('accurately renders ERPNext BOM status indicators', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    // In ERPNext:
    // BOM-BIRYANI-001 is submitted & default -> "Default"
    // BOM-BURGER-001 is draft (docstatus 0) -> "Draft"
    // BOM-PIZZA-001 is submitted & active -> "Active"
    // BOM-PASTA-001 is submitted & inactive -> "Not active"
    // BOM-SOUP-001 is cancelled (docstatus 2) -> "Cancelled"
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
  });

  it('computes status via getBomStatus matching ERPNext standard indicators', () => {
    expect(getBomStatus(mockBoms[0]).label).toBe('Default');
    expect(getBomStatus(mockBoms[1]).label).toBe('Draft');
    expect(getBomStatus(mockBoms[2]).label).toBe('Active');
    expect(getBomStatus(mockBoms[3]).label).toBe('Not active');
    expect(getBomStatus(mockBoms[4]).label).toBe('Cancelled');
  });

  it('filters BOMs using the status dropdown matching ERPNext statuses', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    const statusFilter = screen.getByTestId('bom-status-filter');
    fireEvent.change(statusFilter, { target: { value: 'Default' } });

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
      expect(screen.queryByText('Veg Burger')).not.toBeInTheDocument();
      expect(screen.queryByText('Cheese Pizza')).not.toBeInTheDocument();
      expect(screen.getByText('1 BOM')).toBeInTheDocument();
    });

    fireEvent.change(statusFilter, { target: { value: 'Draft' } });

    await waitFor(() => {
      expect(screen.getByText('Veg Burger')).toBeInTheDocument();
      expect(screen.queryByText('Chicken Biryani')).not.toBeInTheDocument();
      expect(screen.getByText('1 BOM')).toBeInTheDocument();
    });
  });

  it('filters BOMs based on the common top header Company filter', async () => {
    mockCompanyState.activeCompanyId = 'Tridz Co';
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
      expect(screen.getByText('Veg Burger')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cheese Pizza')).not.toBeInTheDocument();
  });

  it('filters BOMs based on the common top header Branch filter via IPC', async () => {
    mockBranchState.activeBranchId = 'branch-1';
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cheese Pizza')).not.toBeInTheDocument();
    expect(screen.queryByText('Veg Burger')).not.toBeInTheDocument();
  });

  it('filters BOMs by search query', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search BOM or item...');
    fireEvent.change(searchInput, { target: { value: 'burger' } });

    await waitFor(() => {
      expect(screen.getByText('Veg Burger')).toBeInTheDocument();
      expect(screen.queryByText('Chicken Biryani')).not.toBeInTheDocument();
      expect(screen.queryByText('Cheese Pizza')).not.toBeInTheDocument();
      expect(screen.getByText('1 BOM')).toBeInTheDocument();
    });
  });

  it('switches between list and grid views', async () => {
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    const gridBtn = screen.getByTitle('Grid View');
    fireEvent.click(gridBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Total Cost:').length).toBeGreaterThan(0);
    });

    const listBtn = screen.getByTitle('List View');
    fireEvent.click(listBtn);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });
  });

  it('opens drawer to view BOM details in read-only inspection mode without create/delete/mutation buttons', async () => {
    const user = userEvent.setup();
    render(<BomPage />);

    await waitFor(() => {
      expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    });

    // Click "View BOM Details" button
    const viewButtons = screen.getAllByTitle('View BOM Details');
    await user.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
      expect(screen.getByText('Bill of Materials Details')).toBeInTheDocument();
      expect(screen.getAllByText('BOM-BIRYANI-001').length).toBeGreaterThan(0);
    });

    // Check inspection content
    expect(screen.getByText(/Finished Product \(Output\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Materials \/ Components/i)).toBeInTheDocument();
    expect(screen.getByText('Basmati Rice')).toBeInTheDocument();
    expect(screen.getByText('Chicken Meat')).toBeInTheDocument();

    // Verify footer only has Close and DeskLink (no create, submit, amend, cancel, or delete buttons)
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    expect(screen.getAllByText('Open in ERPNext Desk').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Save as Draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create & Submit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit BOM/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update Details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Amend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel BOM/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete BOM/i })).not.toBeInTheDocument();
  });
});
