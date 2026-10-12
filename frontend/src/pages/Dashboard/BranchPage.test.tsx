import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import BranchPage from './BranchPage';

const mockBranches = Object.freeze([
  {
    name: 'Kozhikode',
    branch_name: 'Kozhikode',
    address: 'Kozhikode, Kerala',
    custom_no_taxes: 0,
    custom_invoice_series_prefix: 'INV-KZK-',
    custom_aggregator_series_prefix: 'AGG-KZK-',
    tax_id: 'TAX-998877',
  },
]);

const mockMenus = Object.freeze([
  { name: 'Menu1', menu_name: 'Main Menu' },
]);

const mockRooms = Object.freeze([
  { name: 'Room1' },
]);

const mockRestaurants = Object.freeze([
  {
    name: 'Kozhikode Restaurant',
    branch: 'Kozhikode',
    company: 'Default Company',
    invoice_series_prefix: 'INV-KZK-',
    aggregator_series_prefix: 'AGG-KZK-',
    active_menu: 'Main Menu',
  },
]);

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: vi.fn(() => ({
    activeBranchId: 'Kozhikode',
    branches: mockBranches,
  })),
}));

vi.mock('../../services/dashboard', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    dashboardService: {
      getModuleRecords: vi.fn().mockImplementation(async (doctype: string) => {
        if (doctype === 'URY Menu') {
          return mockMenus;
        }
        if (doctype === 'URY Room') {
          return mockRooms;
        }
        return [];
      }),
    },
  };
});

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn().mockImplementation(async (method: string, params: any) => {
      if (method === 'frappe.client.get_list' && params.doctype === 'Branch') {
        return { message: mockBranches };
      }
      if (method === 'frappe.client.get_list' && params.doctype === 'URY Restaurant') {
        return { message: mockRestaurants };
      }
      if (method === 'frappe.client.get_list' && params.doctype === 'Company') {
        return { message: [{ name: 'Default Company', tax_id: 'TAX-998877' }] };
      }
      if (method === 'frappe.client.get' && params.doctype === 'Branch') {
        return { message: mockBranches[0] };
      }
      if (method === 'frappe.client.get' && params.doctype === 'URY Restaurant') {
        return { message: mockRestaurants[0] };
      }
      return { message: [] };
    }),
    getLoggedUser: vi.fn().mockResolvedValue('test@example.com'),
  };
});

vi.mock('@ury/ui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    showToast: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe('BranchPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows page with buttons', async () => {
    render(<BranchPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it('renders a list of branches', async () => {
    render(<BranchPage />);
    await waitFor(() => {
      expect(screen.getByText('Kozhikode')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('displays branch location information', async () => {
    render(<BranchPage />);
    await waitFor(() => {
      expect(screen.getByText('Kozhikode')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('displays branch fiscal identification headers and values in table list', async () => {
    render(<BranchPage />);
    await waitFor(() => {
      expect(screen.getByText('Invoice Prefix')).toBeInTheDocument();
      expect(screen.getByText('Aggregator Prefix')).toBeInTheDocument();
      expect(screen.getByText('Tax ID')).toBeInTheDocument();
      expect(screen.getByText('INV-KZK-')).toBeInTheDocument();
      expect(screen.getByText('AGG-KZK-')).toBeInTheDocument();
      expect(screen.getByText('TAX-998877')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
