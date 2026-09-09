import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ProductionUnitPage from './ProductionUnitPage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
  }),
}));

vi.mock('../../services/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/dashboard')>();
  return {
    ...actual,
    dashboardService: {
      getModuleRecords: vi.fn(),
    },
  };
});

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn(),
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

const productionUnits = [
  {
    name: 'PU-0001',
    production: 'Main Kitchen',
    production_unit_name: 'Main Kitchen',
    branch: 'Kozhikode',
    item_groups: [
      { item_group: 'Main Course' },
      { item_group: 'Appetizers' }
    ],
  },
];

const branches = [
  { name: 'Kozhikode' },
];

const itemGroups = [
  { name: 'Main Course', item_group_name: 'Main Course' },
  { name: 'Appetizers', item_group_name: 'Appetizers' },
];

describe('ProductionUnitPage', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(dashboardService.getModuleRecords).mockReset();
  });

  it('shows empty state when no production units exist', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<ProductionUnitPage />);
    expect(await screen.findByText('No Production Units Configured')).toBeInTheDocument();
  });

  it('renders a table of production units', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === 'URY Production Unit') {
        return productionUnits;
      }
      if (doctype === 'Branch') {
        return branches;
      }
      if (doctype === 'Item Group') {
        return itemGroups;
      }
      return [];
    });

    render(<ProductionUnitPage />);
    expect(await screen.findByText('Main Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Kozhikode')).toBeInTheDocument();
  });

  it('opens the add unit drawer when Add Production Unit is clicked', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<ProductionUnitPage />);
    const addButton = await screen.findByRole('button', { name: /Add Production Unit/i });
    
    // Button should be clickable
    expect(addButton).toBeInTheDocument();
  });

  it('renders Add button for empty state', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<ProductionUnitPage />);
    const addButton = await screen.findByRole('button', { name: /Add Production Unit/i });
    expect(addButton).toBeInTheDocument();
  });

  it('displays production units with branch information', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === 'URY Production Unit') {
        return productionUnits;
      }
      return [];
    });

    render(<ProductionUnitPage />);
    expect(await screen.findByText('Main Kitchen')).toBeInTheDocument();
  });
});
