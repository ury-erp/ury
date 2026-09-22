import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ItemProductionConfigPage from './ItemProductionConfigPage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/dashboard', () => ({
  dashboardService: {
    getModuleRecords: vi.fn((doctype) => {
      if (doctype === 'URY Item Production Configuration') {
        return Promise.resolve([
          {
            name: 'config1',
            item: 'ITEM-001',
            branch: 'branch1',
            active: 1,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  },
}));

vi.mock('../../services/linkSearch', () => ({
  searchLinkOptions: vi.fn(() => Promise.resolve([])),
  withSelectedOption: (options: unknown[], value: string) =>
    value ? [{ value, label: value }, ...(options as { value: string }[])] : options,
}));

vi.mock('@ury/core', () => ({
  call: vi.fn(() => Promise.resolve({ message: [] })),
}));

vi.mock('@ury/ui', async () => {
  const actual = await vi.importActual<typeof import('@ury/ui')>('@ury/ui');
  return {
    ...actual,
    Autocomplete: ({ value, placeholder, onChange, disabled }: any) => (
      <input
        data-testid="autocomplete"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
    showToast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../components/layout/SideDrawer', () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

describe('ItemProductionConfigPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Item Production Config page', async () => {
    render(<ItemProductionConfigPage />);
    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });
  });

  it('loads module records on mount', async () => {
    render(<ItemProductionConfigPage />);
    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalled();
    });
  });

  it('renders Add button', async () => {
    render(<ItemProductionConfigPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const addBtn = buttons.find((btn) => btn.textContent?.includes('Add'));
      expect(addBtn).toBeInTheDocument();
    });
  });

  it('displays configurations in table when available', async () => {
    render(<ItemProductionConfigPage />);
    await waitFor(() => {
      const tables = document.querySelectorAll('table, [role="table"]');
      expect(tables.length > 0).toBe(true);
    });
  });

  it('opens drawer with autocomplete fields including BOM', async () => {
    render(<ItemProductionConfigPage />);
    const addBtn = await screen.findByRole('button', { name: /Add Item Production Configuration/i });
    addBtn.click();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Select an Item first')).toBeDisabled();
      expect(screen.getByPlaceholderText('Search Branch')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search Department (optional)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search Production Unit (optional)')).toBeInTheDocument();
    });
  });
});
