import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesPlanPage from './SalesPlanPage';
import { salesPlanService } from '../../services/salesPlan';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'Kozhikode' }),
}));

vi.mock('../../services/salesPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/salesPlan')>();
  return {
    ...actual,
    salesPlanService: {
      ...actual.salesPlanService,
      getComparableHistory: vi.fn(),
      searchBranchItems: vi.fn(),
    },
  };
});

const historyResponse = {
  plan_date: '2026-08-29',
  branch: 'Kozhikode',
  company: 'URY',
  sample_dates: ['2026-08-08', '2026-08-15', '2026-08-22'],
  items: [
    {
      item_code: 'ITEM-001',
      item_name: 'Chicken Biryani',
      stock_uom: 'Nos',
      department: 'Indian',
      production_unit: 'Hot Kitchen',
      average_qty: 72,
      sample_days: 3,
      history: [
        { date: '2026-08-08', qty: 70, invoices: 14 },
        { date: '2026-08-15', qty: 74, invoices: 16 },
      ],
    },
    {
      item_code: 'ITEM-002',
      item_name: 'Fried Rice',
      stock_uom: 'Nos',
      department: 'Chinese',
      production_unit: 'Wok',
      average_qty: 44,
      sample_days: 3,
      history: [{ date: '2026-08-08', qty: 40, invoices: 10 }],
    },
  ],
};

// Finds the numeric "Plan" input within the row that contains the given item
// name text -- EditableDataTable renders one plain, unlabeled number input
// per row rather than a distinct aria-label per cell.
const getPlanInputForRow = (itemName: string): HTMLInputElement => {
  const matches = screen.getAllByText(itemName);
  const row = matches.map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => tr !== null);
  if (!row) throw new Error(`Could not find table row for "${itemName}"`);
  return within(row).getByRole('spinbutton') as HTMLInputElement;
};

describe('SalesPlanPage', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(historyResponse);
    vi.mocked(salesPlanService.searchBranchItems).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads comparable history into an editable plan table', async () => {
    render(<SalesPlanPage />);

    expect(await screen.findByText('Chicken Biryani')).toBeInTheDocument();
    expect(screen.getByText('Fried Rice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Last 3 comparable days avg 72/i })).toBeInTheDocument();
    expect(getPlanInputForRow('Chicken Biryani')).toHaveValue(72);

    const planInput = getPlanInputForRow('Chicken Biryani');
    await userEvent.clear(planInput);
    await userEvent.type(planInput, '70');

    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('opens the history drill-down modal from the history insight', async () => {
    render(<SalesPlanPage />);

    await userEvent.click(await screen.findByRole('button', { name: /Last 3 comparable days avg 72/i }));

    expect(screen.getByRole('dialog', { name: 'Chicken Biryani' })).toBeInTheDocument();
    expect(screen.getByText('Comparable weekday sales history')).toBeInTheDocument();
    expect(screen.getByText('2026-08-08')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close history details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('saves draft quantities in branch and date scoped browser storage', async () => {
    render(<SalesPlanPage />);

    await screen.findByRole('button', { name: /Last 3 comparable days avg 72/i });
    const friedRiceInput = getPlanInputForRow('Fried Rice');
    await userEvent.clear(friedRiceInput);
    await userEvent.type(friedRiceInput, '48');
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(window.localStorage.getItem('ury_v3_sales_plan_draft:URY:Kozhikode:2026-08-29')).toContain('"ITEM-002":48');
  });

  it('defaults the plan date from the local business date instead of UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T22:30:00.000Z'));
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-240);

    render(<SalesPlanPage />);

    const planDate = screen.getByLabelText('Plan date') as HTMLInputElement;
    expect(planDate.value).toBe('2026-08-29');
  });

  it('adds a zero-history item via catalog search and renders it in its department table', async () => {
    vi.mocked(salesPlanService.searchBranchItems).mockResolvedValue([
      {
        item_code: 'ITEM-999',
        item_name: 'New Zero History Item',
        stock_uom: 'Nos',
        department: 'Indian',
        production_unit: 'Hot Kitchen',
      },
    ]);

    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    const addItemInput = screen.getByPlaceholderText('Search the item catalog by name or code');
    await userEvent.type(addItemInput, 'zero');

    const resultButton = await screen.findByRole('button', { name: /New Zero History Item/i });
    await userEvent.click(resultButton);

    // Zero-history items default planned_qty to 0, so the variance vs. a 0
    // average is 0 -- confirming it rendered as a full plan row, not gated.
    expect(getPlanInputForRow('New Zero History Item')).toHaveValue(0);
  });

  it('collapses the attention block to 3 items by default with working expand/collapse', async () => {
    const manyBlocked = {
      ...historyResponse,
      items: [
        ...historyResponse.items,
        { item_code: 'ITEM-003', item_name: 'No PU Item', stock_uom: 'Nos', department: 'Indian', production_unit: 'Unassigned', average_qty: 10, sample_days: 3, history: [] },
        { item_code: 'ITEM-004', item_name: 'No History Item', stock_uom: 'Nos', department: 'Indian', production_unit: 'Wok', average_qty: 0, sample_days: 0, history: [] },
        { item_code: 'ITEM-005', item_name: 'Another No PU Item', stock_uom: 'Nos', department: 'Indian', production_unit: 'Unassigned', average_qty: 5, sample_days: 3, history: [] },
        { item_code: 'ITEM-006', item_name: 'Yet Another No PU Item', stock_uom: 'Nos', department: 'Indian', production_unit: 'Unassigned', average_qty: 5, sample_days: 3, history: [] },
      ],
    };
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(manyBlocked as any);

    render(<SalesPlanPage />);

    await screen.findByText('Needs Attention');
    const showAllButton = await screen.findByRole('button', { name: /Show all \(4\)/i });
    expect(showAllButton).toBeInTheDocument();

    await userEvent.click(showAllButton);
    expect(await screen.findByRole('button', { name: 'Collapse' })).toBeInTheDocument();
  });

  it('toggles department group collapse/expand with correct aria attributes', async () => {
    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    const toggle = screen.getByRole('button', { name: 'Indian' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(panelId!)).toHaveAttribute('hidden');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
