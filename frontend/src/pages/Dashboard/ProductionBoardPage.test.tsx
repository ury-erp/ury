import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProductionBoardPage from './ProductionBoardPage';
import { chefProductionService, type ChefDepartment, type ChefQueueResponse } from '../../services/chefProduction';

const mockAuthState: { isManager: boolean; roles: string[] } = { isManager: false, roles: ['URY Department Head'] };
vi.mock('../../store/useAuth', () => ({
  useAuth: () => ({
    user: 'chef@example.com',
    roles: mockAuthState.roles,
    fullName: 'Chef',
    isLoading: false,
    error: null,
    isManager: mockAuthState.isManager,
  }),
}));

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'Half and Honey', activeBranch: { id: 'Half and Honey', name: 'Half and Honey' } }),
}));

vi.mock('../../services/chefProduction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/chefProduction')>();
  return {
    ...actual,
    chefProductionService: {
      getProductionQueue: vi.fn(),
      getDepartmentRawMaterials: vi.fn(),
      updateProductionQuantities: vi.fn(),
      submitProductionPlan: vi.fn(),
      prepareDepartmentProduction: vi.fn(),
    },
  };
});

const draftDepartment: ChefDepartment = {
  department: 'Hot Kitchen',
  department_warehouse: 'Hot Kitchen - HH',
  production_plan: 'MFG-PP-0001',
  docstatus: 0,
  erpnext_status: 'Draft',
  production_state: 'Awaiting Materials',
  link_state: 'live',
  execution_state: 'awaiting_materials',
  can_edit: true,
  can_submit: true,
  can_prepare: false,
  blockers: [],
  totals: { items: 1, planned_qty: 20, production_qty: 22 },
  items: [
    {
      row_name: 'row-1',
      row_key: 'row-1',
      item_code: 'BIRYANI',
      item_name: 'Chicken Biryani',
      stock_uom: 'Nos',
      production_policy: 'MADE_TO_ORDER',
      planned_qty: 20,
      production_qty: 22,
      is_sub_assembly: false,
      derived_qty: false,
      last_weekday_qty: 18,
      last_weekday_date: '2026-11-20',
      produced_qty: null,
    },
  ],
};

const submittedDepartment: ChefDepartment = {
  ...draftDepartment,
  department: 'Pastry',
  production_plan: 'MFG-PP-0002',
  docstatus: 1,
  erpnext_status: 'Not Started',
  can_edit: false,
  can_submit: false,
  can_prepare: true,
  blockers: [{ type: 'store_shortage', message: 'Flour short by 2 Kg' }],
  items: [
    {
      ...draftDepartment.items[0],
      row_name: 'row-9',
      row_key: 'row-9',
      production_policy: 'PRE_PRODUCED',
      item_code: 'CAKE',
      item_name: 'Lemon Cake',
      last_weekday_qty: null,
      last_weekday_date: null,
      produced_qty: 0,
    },
  ],
};

const queue = (departments: ChefDepartment[], overrides: Partial<ChefQueueResponse> = {}): ChefQueueResponse => ({
  branch: 'Half and Honey',
  branches: ['Half and Honey'],
  plan_date: '2026-11-27',
  sales_plan: 'SP-2026-00001',
  sales_plan_status: 'Locked for Production',
  departments,
  totals: { items_to_prepare: 18, items_prepared: 0, production_qty: 107, material_shortages: 4 },
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProductionBoardPage />
    </MemoryRouter>,
  );

const card = async (department: string) => {
  const heading = await screen.findByRole('button', { name: department, expanded: true });
  return heading.closest('div.overflow-hidden') as HTMLElement;
};

describe('ProductionBoardPage', () => {
  beforeEach(() => {
    vi.mocked(chefProductionService.getProductionQueue).mockResolvedValue(queue([draftDepartment, submittedDepartment]));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders one card per department Production Plan with server values', async () => {
    renderPage();
    const hot = await card('Hot Kitchen');
    expect(within(hot).getByText('Chicken Biryani')).toBeInTheDocument();
    expect(within(hot).getByText('BIRYANI')).toBeInTheDocument();
    expect(within(hot).getByText('18')).toBeInTheDocument();
    // History shows the quantity only, no date under it.
    expect(within(hot).queryByText(/Fri|20 Nov/)).toBeNull();
    expect(within(hot).getByText('Previous Production Qty')).toBeInTheDocument();
    const pastry = await card('Pastry');
    expect(within(pastry).getByText('No history')).toBeInTheDocument();
    expect(within(pastry).getByText('Flour short by 2 Kg')).toBeInTheDocument();
  });

  it('makes Production Qty editable only on Draft plans', async () => {
    renderPage();
    const hot = await card('Hot Kitchen');
    expect(within(hot).getByLabelText('Production quantity for Chicken Biryani')).toBeInTheDocument();
    expect(within(hot).getByRole('button', { name: /Submit plan/ })).toBeInTheDocument();
    expect(within(hot).queryByRole('button', { name: /Prepare Production/ })).toBeNull();

    const pastry = await card('Pastry');
    expect(within(pastry).queryByLabelText('Production quantity for Lemon Cake')).toBeNull();
    expect(within(pastry).getByRole('button', { name: /Prepare Production/ })).toBeInTheDocument();
    expect(within(pastry).queryByRole('button', { name: /Submit plan/ })).toBeNull();
  });

  it('saves only changed quantities and reloads', async () => {
    vi.mocked(chefProductionService.updateProductionQuantities).mockResolvedValue({ production_plan: 'MFG-PP-0001', changed: 1 });
    const user = userEvent.setup();
    renderPage();
    const hot = await card('Hot Kitchen');
    const input = within(hot).getByLabelText('Production quantity for Chicken Biryani');
    await user.clear(input);
    await user.type(input, '30');
    await user.click(within(hot).getByRole('button', { name: /Save quantities/ }));
    await waitFor(() =>
      expect(chefProductionService.updateProductionQuantities).toHaveBeenCalledWith('MFG-PP-0001', [
        { row_name: 'row-1', item_code: 'BIRYANI', production_qty: 30 },
      ]),
    );
    expect(chefProductionService.getProductionQueue).toHaveBeenCalledTimes(2);
  });

  it('prepares after confirmation through the Chef UI endpoint', async () => {
    vi.mocked(chefProductionService.prepareDepartmentProduction).mockResolvedValue({
      status: 'processing',
      production_plan: 'MFG-PP-0002',
    });
    const user = userEvent.setup();
    renderPage();
    const pastry = await card('Pastry');
    await user.click(within(pastry).getByRole('button', { name: /Prepare Production/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Prepare Production' }));
    await waitFor(() => expect(chefProductionService.prepareDepartmentProduction).toHaveBeenCalledWith('MFG-PP-0002'));
  });

  it('opens the raw materials popup and loads it only on demand', async () => {
    vi.mocked(chefProductionService.getDepartmentRawMaterials).mockResolvedValue({
      production_plan: 'MFG-PP-0001',
      department: 'Hot Kitchen',
      department_warehouse: 'Hot Kitchen - HH',
      store_warehouse: 'Stores - HH',
      rows: [
        {
          item_code: 'RICE',
          item_name: 'Basmati Rice',
          stock_uom: 'Kg',
          required_qty: 4.4,
          department_available: 1,
          department_shortage: 3.4,
          store_available: 10,
          store_shortage: 0,
        },
      ],
      blockers: [],
      totals: { items: 1, short_items: 1 },
    });
    const user = userEvent.setup();
    renderPage();
    const hot = await card('Hot Kitchen');
    expect(chefProductionService.getDepartmentRawMaterials).not.toHaveBeenCalled();
    await user.click(within(hot).getByRole('button', { name: /Raw materials/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Basmati Rice')).toBeInTheDocument();
    expect(within(dialog).getByText('1 short')).toBeInTheDocument();
    expect(chefProductionService.getDepartmentRawMaterials).toHaveBeenCalledWith('MFG-PP-0001');
  });

  it('shows an empty state when the date has no approved Sales Plan', async () => {
    vi.mocked(chefProductionService.getProductionQueue).mockResolvedValue(
      queue([], { sales_plan: null, sales_plan_status: null }),
    );
    renderPage();
    expect(await screen.findByText('No approved Sales Plan for Half and Honey on this date.')).toBeInTheDocument();
  });

  it('shows a "no plan yet" note for a department without a Production Plan', async () => {
    vi.mocked(chefProductionService.getProductionQueue).mockResolvedValue(
      queue([{ ...draftDepartment, production_plan: null, docstatus: null, link_state: 'none', items: [], can_edit: false, can_submit: false }]),
    );
    renderPage();
    expect(
      await screen.findByText('No Production Plan yet. It is created once the Sales Plan is Locked for Production.'),
    ).toBeInTheDocument();
  });

  it('shows the item production policy in its own column, not as a badge beside the name', async () => {
    renderPage();
    const hot = await card('Hot Kitchen');
    expect(within(hot).getByRole('columnheader', { name: 'Policy' })).toBeInTheDocument();
    expect(within(hot).getByText('Made to Order')).toBeInTheDocument();
    expect(within(hot).queryByText('Sub-assembly')).toBeNull();
    const pastry = await card('Pastry');
    expect(within(pastry).getByText('Pre-produced')).toBeInTheDocument();
  });

  it('shows a stock-covered sub-assembly with 0 in an editable field and saves it by item code', async () => {
    const subAssembly = {
      ...draftDepartment.items[0],
      row_name: null,
      row_key: 'item:BASE',
      item_code: 'BASE',
      item_name: 'Biryani Base',
      production_policy: 'PRE_PRODUCED' as const,
      planned_qty: 8,
      production_qty: 0,
      is_sub_assembly: true,
      derived_qty: true,
      last_weekday_qty: null,
      last_weekday_date: null,
    };
    vi.mocked(chefProductionService.getProductionQueue).mockResolvedValue(
      queue([{ ...draftDepartment, items: [subAssembly, draftDepartment.items[0]] }]),
    );
    vi.mocked(chefProductionService.updateProductionQuantities).mockResolvedValue({ production_plan: 'MFG-PP-0001', changed: 1 });
    const user = userEvent.setup();
    renderPage();
    const hot = await card('Hot Kitchen');
    const input = within(hot).getByLabelText('Production quantity for Biryani Base') as HTMLInputElement;
    expect(input.value).toBe('0');
    expect(within(hot).queryByText(/must be greater than 0/)).toBeNull();
    await user.clear(input);
    await user.type(input, '9');
    await user.click(within(hot).getByRole('button', { name: /Save quantities/ }));
    await waitFor(() =>
      expect(chefProductionService.updateProductionQuantities).toHaveBeenCalledWith('MFG-PP-0001', [
        { row_name: null, item_code: 'BASE', production_qty: 9 },
      ]),
    );
  });

  it('allows 0 on a sub-assembly but not on a directly planned item', async () => {
    const subAssembly = {
      ...draftDepartment.items[0],
      row_name: 'row-base',
      row_key: 'row-base',
      item_code: 'BASE',
      item_name: 'Biryani Base',
      production_policy: 'PRE_PRODUCED' as const,
      production_qty: 5,
      is_sub_assembly: true,
      derived_qty: true,
    };
    vi.mocked(chefProductionService.getProductionQueue).mockResolvedValue(
      queue([{ ...draftDepartment, items: [subAssembly, draftDepartment.items[0]] }]),
    );
    const user = userEvent.setup();
    renderPage();
    const hot = await card('Hot Kitchen');
    await user.clear(within(hot).getByLabelText('Production quantity for Biryani Base'));
    expect(within(hot).queryByText(/must be greater than 0/)).toBeNull();
    expect(within(hot).getByRole('button', { name: /Save quantities/ })).toBeEnabled();
    await user.clear(within(hot).getByLabelText('Production quantity for Chicken Biryani'));
    expect(within(hot).getByText(/must be greater than 0/)).toBeInTheDocument();
    expect(within(hot).getByRole('button', { name: /Save quantities/ })).toBeDisabled();
  });

  it('shows the four summary cards from the server totals, without descriptions', async () => {
    renderPage();
    await card('Hot Kitchen');
    const expectCard = (label: string, value: string) => {
      const element = screen.getByText(label).parentElement as HTMLElement;
      expect(within(element).getByText(value)).toBeInTheDocument();
    };
    expectCard('Items to Prepare', '18');
    expectCard('Total Production Qty', '107');
    expectCard('Material Shortages', '4');
    expectCard('Preparation Progress', '0 / 18');
    expect(screen.queryByText('Items with production required')).toBeNull();
    expect(screen.queryByText('Total quantity to produce')).toBeNull();
    expect(screen.queryByText('Raw materials with insufficient stock')).toBeNull();
    expect(screen.queryByText('Items prepared / items to prepare')).toBeNull();
  });
});
