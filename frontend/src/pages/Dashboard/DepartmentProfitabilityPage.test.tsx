import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('@ury/core', () => ({
  getLoggedUser: vi.fn(),
  getUserRoles: vi.fn(),
  call: vi.fn(),
}));

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranch: { id: 'URY Branch' },
    selectedBranch: 'URY Branch',
  }),
}));

vi.mock('../../services/departmentProfitability', () => ({
  departmentProfitabilityService: {
    getDepartmentProfitability: vi.fn(),
    getPlanVsActual: vi.fn(),
  },
}));

vi.mock('../../services/departmentStock', () => ({
  departmentStockService: {
    listDepartments: vi.fn(),
  },
}));

import { call, getLoggedUser, getUserRoles } from '@ury/core';
import { departmentProfitabilityService } from '../../services/departmentProfitability';
import { departmentStockService } from '../../services/departmentStock';
import { DepartmentProfitabilityPage } from './DepartmentProfitabilityPage';

const mockedCall = vi.mocked(call);
const mockedGetLoggedUser = vi.mocked(getLoggedUser);
const mockedGetUserRoles = vi.mocked(getUserRoles);
const mockedGetProfitability = vi.mocked(departmentProfitabilityService.getDepartmentProfitability);
const mockedGetPlanVsActual = vi.mocked(departmentProfitabilityService.getPlanVsActual);
const mockedListDepartments = vi.mocked(departmentStockService.listDepartments);

const populatedProfitability = {
  company: 'URY Co',
  branch: 'URY Branch',
  service_date_or_period: '2026-08-28',
  department: 'Kitchen',
  rows: [
    {
      company: 'URY Co',
      branch: 'URY Branch',
      service_date_or_period: '2026-08-28',
      department: 'Kitchen',
      item_or_component: 'Burger',
      source_document: 'POS-INV-001',
      net_revenue: 500,
      posted_cost: 100,
      theoretical_cost: 90,
      posted_gross_profit: 400,
      theoretical_gross_profit: 410,
      variance: 10,
    },
  ],
};

const populatedProfitabilityNoCost = {
  ...populatedProfitability,
  rows: [
    {
      company: 'URY Co',
      branch: 'URY Branch',
      service_date_or_period: '2026-08-28',
      department: 'Kitchen',
      item_or_component: 'Burger',
      source_document: 'POS-INV-001',
      net_revenue: 500,
      // no cost/profit keys -- matches what the server actually sends for
      // a quantity-only tier.
    },
  ],
};

const emptyPlan = { company: 'URY Co', branch: 'URY Branch', service_date_or_period: '2026-08-28', rows: [] };

// The real-world shape today: no fulfilment Stock Entry has ever been
// posted, so `compute_variance` returns `posted_cost=None` for every row,
// and every row carries `reason: "UNATTRIBUTED_COST"`.
const provisionalProfitability = {
  ...populatedProfitability,
  reason: 'UNATTRIBUTED_COST',
  provisional: true,
  rows: [
    {
      company: 'URY Co',
      branch: 'URY Branch',
      service_date_or_period: '2026-08-28',
      department: 'Kitchen',
      item_or_component: 'Burger',
      source_document: 'POS-INV-001',
      net_revenue: 500,
      theoretical_cost: 90,
      theoretical_gross_profit: 410,
      reason: 'UNATTRIBUTED_COST',
      provisional: true,
    },
  ],
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCall.mockResolvedValue({ message: { company: 'URY Co' } });
  mockedListDepartments.mockResolvedValue([{ name: 'Kitchen', department_name: 'Kitchen' }]);
});

describe('DepartmentProfitabilityPage', () => {
  it('renders a loading state before roles resolve', async () => {
    mockedGetLoggedUser.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DepartmentProfitabilityPage />);
    expect(screen.getByTestId('profitability-loading')).toBeInTheDocument();
  });

  it('renders an empty state when there are no rows', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue({ ...populatedProfitability, rows: [] });
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-empty')).toBeInTheDocument());
  });

  it('renders a populated state with cost columns for an authorized role', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue(populatedProfitability);
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-table')).toBeInTheDocument());
    const table = within(screen.getByTestId('profitability-table'));
    expect(table.getByText('Burger')).toBeInTheDocument();
    expect(table.getByText('Posted Cost')).toBeInTheDocument();
    expect(table.getByText('Variance')).toBeInTheDocument();
  });

  it('hides cost/profit columns entirely for a quantity-only role (Chef)', async () => {
    mockedGetLoggedUser.mockResolvedValue('chef@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Chef'], full_name: 'Chef User' });
    mockedGetProfitability.mockResolvedValue(populatedProfitabilityNoCost);
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-table')).toBeInTheDocument());
    const table = within(screen.getByTestId('profitability-table'));
    expect(table.getByText('Burger')).toBeInTheDocument();
    // Cost/profit column headers must not be in the DOM at all for this role,
    // scoped to the profitability table (the separate plan-vs-actual table
    // has its own unrelated "Variance" column).
    expect(table.queryByText('Posted Cost')).not.toBeInTheDocument();
    expect(table.queryByText('Theoretical Cost')).not.toBeInTheDocument();
    expect(table.queryByText('Posted GP')).not.toBeInTheDocument();
    expect(table.queryByText('Theoretical GP')).not.toBeInTheDocument();
    expect(table.queryByText('Variance')).not.toBeInTheDocument();
  });

  it('translates the report-level reason code instead of showing it raw', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue(provisionalProfitability);
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-reason')).toBeInTheDocument());
    expect(screen.getByTestId('profitability-reason')).toHaveTextContent(
      'Theoretical cost only — no stock has been posted to ERPNext for this item yet.',
    );
    expect(screen.queryByText('UNATTRIBUTED_COST')).not.toBeInTheDocument();
  });

  it('shows a translated per-row Reason column when a row carries one', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue(provisionalProfitability);
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-table')).toBeInTheDocument());
    const table = within(screen.getByTestId('profitability-table'));
    expect(table.getByText('Reason')).toBeInTheDocument();
    // The translated sentence appears twice in this fixture: once in the
    // report-level banner (every row shares the same reason) and once in
    // the row's own Reason cell -- both are expected, not a duplicate bug.
    expect(
      table.getAllByText('Theoretical cost only — no stock has been posted to ERPNext for this item yet.'),
    ).toHaveLength(2);
  });

  it('omits the Reason column entirely when no row carries one', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue(populatedProfitability);
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-table')).toBeInTheDocument());
    expect(within(screen.getByTestId('profitability-table')).queryByText('Reason')).not.toBeInTheDocument();
  });

  it('falls back to the raw code for a reason not in the translation map', async () => {
    mockedGetLoggedUser.mockResolvedValue('finance@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Finance'], full_name: 'Finance User' });
    mockedGetProfitability.mockResolvedValue({ ...populatedProfitability, reason: 'SOME_FUTURE_CODE' });
    mockedGetPlanVsActual.mockResolvedValue(emptyPlan);

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-reason')).toBeInTheDocument());
    expect(screen.getByTestId('profitability-reason')).toHaveTextContent('SOME_FUTURE_CODE');
  });

  it('denies access outright for Cashier/Captain roles without calling the backend', async () => {
    mockedGetLoggedUser.mockResolvedValue('cashier@ury.test');
    mockedGetUserRoles.mockResolvedValue({ roles: ['Cashier'], full_name: 'Cashier User' });

    render(<DepartmentProfitabilityPage />);

    await waitFor(() => expect(screen.getByTestId('profitability-denied')).toBeInTheDocument());
    expect(mockedGetProfitability).not.toHaveBeenCalled();
    expect(mockedGetPlanVsActual).not.toHaveBeenCalled();
  });
});
