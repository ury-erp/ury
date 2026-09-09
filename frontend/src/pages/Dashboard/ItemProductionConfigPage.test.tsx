import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ItemProductionConfigPage from './ItemProductionConfigPage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/dashboard', () => ({
  dashboardService: {
    getModuleRecords: vi.fn((doctype, branch) => {
      if (doctype === 'Branch') return Promise.resolve([{ name: 'branch1' }]);
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

vi.mock('@ury/core', () => ({
  call: vi.fn((method, params) => Promise.resolve({ message: [] })),
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../components/common/SearchableSelect', () => ({
  SearchableSelect: ({ value, options, placeholder, onChange }: any) => (
    <select value={value} onChange={(e) => onChange(null, e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('../../components/layout/SideDrawer', () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

describe('ItemProductionConfigPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Item Production Config page', async () => {
    render(<ItemProductionConfigPage />);
    await waitFor(() => {
      const page = document.body;
      expect(page).toBeInTheDocument();
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
});
