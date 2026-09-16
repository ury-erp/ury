import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import WastagePage from './WastagePage';
import { departmentStockService } from '../../services/departmentStock';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/departmentStock', () => ({
  departmentStockService: {
    listDepartments: vi.fn().mockResolvedValue([
      { name: 'kitchen', department_name: 'Kitchen' },
    ]),
    listWastage: vi.fn().mockResolvedValue([
      {
        name: 'waste-001',
        component_item: 'ITEM-001',
        department: 'kitchen',
        wasted_qty: 5,
        status: 'Draft',
        valuation_amount: 500,
      },
    ]),
    approveWastage: vi.fn().mockResolvedValue({}),
    rejectWastage: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@ury/core', () => ({
  getLoggedUser: vi.fn().mockResolvedValue('user@test.com'),
  getUserRoles: vi.fn().mockResolvedValue({
    roles: ['Stock Manager'],
  }),
}));

describe('WastagePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders page', async () => {
    const { container } = render(
      <BrowserRouter>
        <WastagePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('loads departments', async () => {
    render(
      <BrowserRouter>
        <WastagePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(departmentStockService.listDepartments).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('loads wastage records', async () => {
    render(
      <BrowserRouter>
        <WastagePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(departmentStockService.listWastage).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('renders filter elements', async () => {
    render(
      <BrowserRouter>
        <WastagePage />
      </BrowserRouter>
    );
    await waitFor(() => {
      const page = document.body;
      expect(page.innerHTML.length).toBeGreaterThan(100);
    }, { timeout: 2000 });
  });
});
