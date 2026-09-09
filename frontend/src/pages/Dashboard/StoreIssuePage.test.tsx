import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import StoreIssuePage from './StoreIssuePage';
import { departmentStockService } from '../../services/departmentStock';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/departmentStock', () => ({
  departmentStockService: {
    listDepartments: vi.fn().mockResolvedValue([
      { name: 'kitchen', department_name: 'Kitchen' },
    ]),
    listIssueAuthorizations: vi.fn().mockResolvedValue([
      {
        name: 'ia-001',
        component_item: 'ITEM-001',
        component_item_name: 'Chicken',
        department: 'kitchen',
        authorized_qty: 100,
        remaining_after_qty: 30,
        stock_uom: 'Kg',
        status: 'Authorized',
      },
    ]),
  },
}));

vi.mock('../../components/DeskLink', () => ({
  DeskLink: ({ name, label }: any) => <a href="#">{label || name}</a>,
}));

describe('StoreIssuePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Store Issue page', async () => {
    render(
      <BrowserRouter>
        <StoreIssuePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Store Issue/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('loads departments on mount', async () => {
    render(
      <BrowserRouter>
        <StoreIssuePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(departmentStockService.listDepartments).toHaveBeenCalledWith('branch1');
    });
  });

  it('loads issue authorizations', async () => {
    render(
      <BrowserRouter>
        <StoreIssuePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(departmentStockService.listIssueAuthorizations).toHaveBeenCalled();
    });
  });

  it('renders page with filters', async () => {
    render(
      <BrowserRouter>
        <StoreIssuePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      const dateInputs = document.querySelectorAll('input[type="date"]');
      expect(dateInputs.length >= 2).toBe(true);
    });
  });
});
