import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format, parseISO } from 'date-fns';
import SalesPlanPage from './SalesPlanPage';
import { salesPlanService } from '../../services/salesPlan';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'Kozhikode', activeBranch: { id: 'Kozhikode', name: 'Kozhikode Branch' } }),
}));

// useAuth's real implementation calls @ury/core's getLoggedUser()/getUserRoles(),
// which reject in this jsdom environment (no live Frappe session) and resolve to
// isManager: false, roles: []. Mocked here (mutable per-test via mockAuthState) so
// tests can exercise both the manager-only NEXT_ACTION gate and the
// "URY Sales Plan Controller"-only Return to Draft/Supersede-Cancel gate.
const mockAuthState: { isManager: boolean; roles: string[] } = { isManager: false, roles: [] };
vi.mock('../../store/useAuth', () => ({
  useAuth: () => ({ user: 'test@example.com', roles: mockAuthState.roles, fullName: 'Test User', isLoading: false, error: null, isManager: mockAuthState.isManager }),
}));

vi.mock('../../services/salesPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/salesPlan')>();
  return {
    ...actual,
    salesPlanService: {
      ...actual.salesPlanService,
      getComparableHistory: vi.fn(),
      searchBranchItems: vi.fn(),
      getPlanStatus: vi.fn(),
      transitionPlan: vi.fn(),
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

// Finds the numeric "Plan" input for a given item by its accessible label
// (`Plan quantity for <item name>`), restored via EditableDataTable's
// `getAriaLabel` on `editableColumn`.
const getPlanInputForRow = (itemName: string): HTMLInputElement => {
  return screen.getByLabelText(`Plan quantity for ${itemName}`) as HTMLInputElement;
};

describe('SalesPlanPage', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    mockAuthState.isManager = false;
    mockAuthState.roles = [];
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(historyResponse);
    vi.mocked(salesPlanService.searchBranchItems).mockResolvedValue([]);
    vi.mocked(salesPlanService.getPlanStatus).mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    cleanup();
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

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const addItemInput = screen.getByPlaceholderText('Search the item catalog by name or code');
    await userEvent.type(addItemInput, 'zero');

    const resultButton = await screen.findByRole('button', { name: /New Zero History Item/i });
    await userEvent.click(resultButton);

    // Zero-history items default planned_qty to 0, so the variance vs. a 0
    // average is 0 -- confirming it rendered as a full plan row, not gated.
    expect(getPlanInputForRow('New Zero History Item')).toHaveValue(0);
    // Selecting a result auto-closes the popover and returns focus to the toggle.
    expect(screen.queryByPlaceholderText('Search the item catalog by name or code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus();
  });

  it('closes the add-item popover on outside click and on Escape', async () => {
    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByPlaceholderText('Search the item catalog by name or code')).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(screen.queryByPlaceholderText('Search the item catalog by name or code')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByPlaceholderText('Search the item catalog by name or code')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText('Search the item catalog by name or code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus();
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

  // These three tests deliberately avoid fake timers -- combining
  // `vi.useFakeTimers()` with RTL's async `findBy*` queries (which poll via
  // real `setTimeout` internally) causes them to hang/time out. Instead they
  // derive expected labels from the real current date using the exact same
  // "site today" computation the page uses (`getToday()`'s timezone-adjusted
  // local date), so they remain deterministic regardless of when they run.
  const realToday = () => {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
  };

  it('shows a relative "Today" label paired with the absolute date and branch name', async () => {
    render(<SalesPlanPage />);

    await screen.findByText('Chicken Biryani');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Today');
    expect(heading).toHaveTextContent('Kozhikode Branch');
    expect(screen.queryByText('This date has already passed.')).not.toBeInTheDocument();
  });

  it('shows a relative "Tomorrow" label for the next day', async () => {
    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    const tomorrow = format(addDays(parseISO(realToday()), 1), 'yyyy-MM-dd');
    const dateInput = screen.getByLabelText('Plan date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: tomorrow } });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tomorrow');
    });
  });

  it('shows a weekday+date label (no relative word) and a past-date warning for a date further out', async () => {
    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    const pastDate = format(addDays(parseISO(realToday()), -10), 'yyyy-MM-dd');
    const expectedLabel = format(parseISO(pastDate), 'EEE, d MMM yyyy');
    const dateInput = screen.getByLabelText('Plan date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: pastDate } });

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).not.toHaveTextContent('Today');
      expect(heading).not.toHaveTextContent('Tomorrow');
      expect(heading).not.toHaveTextContent('Yesterday');
      expect(heading).toHaveTextContent(expectedLabel);
    });
    expect(screen.getByText('This date has already passed.')).toBeInTheDocument();
  });

  it('truncates a department table past 10 rows and toggles show all/fewer', async () => {
    const manyItems = {
      ...historyResponse,
      items: Array.from({ length: 14 }, (_, i) => ({
        item_code: `ITEM-${100 + i}`,
        item_name: `Item ${i}`,
        stock_uom: 'Nos',
        department: 'Indian',
        production_unit: 'Hot Kitchen',
        average_qty: 10,
        sample_days: 3,
        history: [],
      })),
    };
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(manyItems as any);

    render(<SalesPlanPage />);
    await screen.findByText('Item 0');

    expect(screen.queryByText('Item 9')).toBeInTheDocument();
    expect(screen.queryByText('Item 10')).not.toBeInTheDocument();

    const showAll = screen.getByRole('button', { name: 'Show all 14 rows' });
    await userEvent.click(showAll);

    expect(screen.getByText('Item 13')).toBeInTheDocument();
    const showFewer = screen.getByRole('button', { name: 'Show fewer' });
    await userEvent.click(showFewer);

    expect(screen.queryByText('Item 10')).not.toBeInTheDocument();
  });

  it('expands truncation and moves focus down when ArrowDown is pressed on the last visible row', async () => {
    const manyItems = {
      ...historyResponse,
      items: Array.from({ length: 14 }, (_, i) => ({
        item_code: `ITEM-${100 + i}`,
        item_name: `Item ${i}`,
        stock_uom: 'Nos',
        department: 'Indian',
        production_unit: 'Hot Kitchen',
        average_qty: 10,
        sample_days: 3,
        history: [],
      })),
    };
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(manyItems as any);

    render(<SalesPlanPage />);
    await screen.findByText('Item 0');
    expect(screen.queryByText('Item 10')).not.toBeInTheDocument();

    const lastVisibleInput = getPlanInputForRow('Item 9');
    lastVisibleInput.focus();
    await userEvent.keyboard('{ArrowDown}');

    await waitFor(() => {
      expect(screen.getByText('Item 10')).toBeInTheDocument();
    });
    expect(getPlanInputForRow('Item 10')).toHaveFocus();
  });

  it('shows department row count and an issue-count badge when it has blocked items', async () => {
    const withBlocked = {
      ...historyResponse,
      items: [
        ...historyResponse.items,
        { item_code: 'ITEM-900', item_name: 'Blocked Item', stock_uom: 'Nos', department: 'Indian', production_unit: 'Unassigned', average_qty: 5, sample_days: 3, history: [] },
      ],
    };
    vi.mocked(salesPlanService.getComparableHistory).mockResolvedValue(withBlocked as any);

    render(<SalesPlanPage />);
    await screen.findByText('Chicken Biryani');

    const indianToggle = screen.getByRole('button', { name: 'Indian' });
    const indianHeader = indianToggle.closest('div');
    expect(indianHeader).toHaveTextContent('2 items');
    expect(indianHeader).toHaveTextContent('1 issue');
  });

  describe('lifecycle stepper summary', () => {
    it('shows the next action for a Draft plan', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Draft' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      expect(await screen.findByText('Currently: Draft · Next: Submit for Review')).toBeInTheDocument();
    });

    it('marks a manager-only next action with (manager)', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Submitted for Approval' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      expect(await screen.findByText('Currently: Review · Next: Approve (manager)')).toBeInTheDocument();
    });

    it('hides Save Draft once the plan is past Draft -- items are editable only in Draft', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Submitted for Approval' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');
      await screen.findByText('Currently: Review · Next: Approve (manager)');

      expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    });

    it('hides Add item too once the plan is past Draft, same as Save Draft', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Submitted for Approval' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');
      await screen.findByText('Currently: Review · Next: Approve (manager)');

      expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    });

    it('starts a fresh Draft and explains why when the prior plan for this date was cancelled', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({
        name: null,
        status: null,
        superseded_plan: 'SP-OLD-CANCELLED',
      } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      expect(
        await screen.findByText("The previous plan for this branch and date (SP-OLD-CANCELLED) was cancelled. You're starting a new one below.")
      ).toBeInTheDocument();
      // A cancelled plan is a dead end with no path forward -- confirm the
      // page actually offers a fresh start rather than just explaining why
      // it's stuck: Save Draft/Add item must be available, same as any
      // other new Draft.
      expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    });

    it('shows Save Draft for a Draft plan', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Draft' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');
      await screen.findByText('Currently: Draft · Next: Submit for Review');

      expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    });

    it('hides Return to Draft/Supersede-Cancel for a user without the URY Sales Plan Controller role', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Submitted for Approval' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');
      await screen.findByText('Currently: Review · Next: Approve (manager)');

      expect(screen.queryByRole('button', { name: 'Return to Draft' })).not.toBeInTheDocument();
    });

    it('lets a URY Sales Plan Controller return a Proposed/Submitted plan to Draft with a reason', async () => {
      mockAuthState.roles = ['URY Sales Plan Controller'];
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Submitted for Approval' } as any);
      vi.mocked(salesPlanService.transitionPlan).mockResolvedValue({ name: 'PLAN-1', status: 'Draft' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');
      await screen.findByText('Currently: Review · Next: Approve (manager)');

      const returnButton = screen.getByRole('button', { name: 'Return to Draft' });
      // Reason is required client-side too: Confirm stays disabled until typed.
      await userEvent.click(returnButton);
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();

      await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'wrong branch selected');
      expect(confirmButton).not.toBeDisabled();

      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(salesPlanService.transitionPlan).toHaveBeenCalledWith({
          name: 'PLAN-1',
          target_state: 'Draft',
          reason: 'wrong branch selected',
        });
      });
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument());
      await screen.findByText('Currently: Draft · Next: Submit for Review');
    });

    it('surfaces the real backend error in the Return to Draft modal on failure', async () => {
      mockAuthState.roles = ['URY Sales Plan Controller'];
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Approved' } as any);
      vi.mocked(salesPlanService.transitionPlan).mockRejectedValue({
        exc_type: 'frappe.exceptions.ValidationError',
        _server_messages: JSON.stringify([
          JSON.stringify({ message: 'Cannot cancel PLAN-1: production has already been recorded against MTPL.' }),
        ]),
      });

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'branch closed for the day');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(
        await screen.findByText('Cannot cancel PLAN-1: production has already been recorded against MTPL.')
      ).toBeInTheDocument();
    });

    it('refuses to dismiss the modal via Escape while a transition is still in flight', async () => {
      mockAuthState.roles = ['URY Sales Plan Controller'];
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Approved' } as any);
      let resolveTransition: (value: any) => void = () => {};
      vi.mocked(salesPlanService.transitionPlan).mockReturnValue(
        new Promise((resolve) => {
          resolveTransition = resolve;
        }) as any
      );

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'branch closed for the day');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      // Request is now in flight ("Updating..."); Escape must not dismiss
      // the dialog and silently drop the eventual response/error.
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('textbox', { name: /reason/i })).toBeInTheDocument();

      resolveTransition({ name: 'PLAN-1', status: 'Superseded/Cancelled' });
      await waitFor(() => expect(screen.queryByRole('textbox', { name: /reason/i })).not.toBeInTheDocument());
    });

    it('shows the locked message with no Next for Locked for Production', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Locked for Production' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      const summary = await screen.findByText('Currently: Ready for Production · This plan is locked for production.');
      expect(summary).toBeInTheDocument();
      expect(summary).not.toHaveTextContent('Next:');
    });

    it('shows the cancelled message for Superseded/Cancelled', async () => {
      vi.mocked(salesPlanService.getPlanStatus).mockResolvedValue({ name: 'PLAN-1', status: 'Superseded/Cancelled' } as any);

      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      expect(
        await screen.findByText('Currently: Superseded/Cancelled · This plan has been superseded or cancelled.')
      ).toBeInTheDocument();
    });

    it('shows no summary line when status is null', async () => {
      render(<SalesPlanPage />);
      await screen.findByText('Chicken Biryani');

      expect(screen.queryByText(/^Currently:/)).not.toBeInTheDocument();
    });
  });
});

describe('describeSalesPlanApiError', () => {
  it('surfaces the real backend validation message from _server_messages', async () => {
    const { describeSalesPlanApiError } = await import('./SalesPlanPage');
    const err = {
      exc_type: 'frappe.exceptions.ValidationError',
      _server_messages: JSON.stringify([
        JSON.stringify({ message: 'BOM is required for manufactured Item Caesar Salad', title: 'Message', indicator: 'red' }),
      ]),
    };
    expect(describeSalesPlanApiError(err, 'Unable to update this Sales Plan. Please try again.')).toBe('BOM is required for manufactured Item Caesar Salad');
  });

  it('gives a fixed, friendly message for a permission error rather than the raw exception text', async () => {
    const { describeSalesPlanApiError } = await import('./SalesPlanPage');
    const err = {
      exc_type: 'frappe.exceptions.PermissionError',
      _server_messages: JSON.stringify([JSON.stringify({ message: 'Not permitted to change this Sales Plan' })]),
    };
    expect(describeSalesPlanApiError(err, 'Unable to update this Sales Plan. Please try again.')).toBe("You don't have permission to make this change to the Sales Plan.");
  });

  it('falls back to a generic message when there is nothing usable on the error', async () => {
    const { describeSalesPlanApiError } = await import('./SalesPlanPage');
    expect(describeSalesPlanApiError(new Error('Network Error'), 'Unable to update this Sales Plan. Please try again.')).toBe(
      'Unable to update this Sales Plan. Please try again.'
    );
    expect(describeSalesPlanApiError({}, 'Unable to update this Sales Plan. Please try again.')).toBe('Unable to update this Sales Plan. Please try again.');
  });

  it('falls back to the generic message instead of throwing on a malformed _server_messages payload', async () => {
    const { describeSalesPlanApiError } = await import('./SalesPlanPage');
    expect(describeSalesPlanApiError({ _server_messages: 'not-json' }, 'Unable to update this Sales Plan. Please try again.')).toBe(
      'Unable to update this Sales Plan. Please try again.'
    );
  });

  it('uses the caller-supplied fallback, not a fixed string, so Save Draft and Approve report failures distinctly', async () => {
    const { describeSalesPlanApiError } = await import('./SalesPlanPage');
    expect(describeSalesPlanApiError({}, 'Unable to save this Sales Plan draft.')).toBe(
      'Unable to save this Sales Plan draft.'
    );
  });
});
