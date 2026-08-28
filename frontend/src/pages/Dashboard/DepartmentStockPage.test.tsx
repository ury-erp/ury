import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DepartmentStockPage from './DepartmentStockPage';
import { departmentStockService } from '../../services/departmentStock';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
    branches: [{ id: 'Kozhikode', name: 'Kozhikode', department: 'Indian' }],
  }),
}));

vi.mock('../../services/departmentStock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/departmentStock')>();
  return {
    ...actual,
    departmentStockService: {
      listDepartments: vi.fn().mockResolvedValue([
        { name: 'Indian', department_name: 'Indian' },
      ]),
      listIssueAuthorizations: vi.fn(),
      listStockMovements: vi.fn(),
    },
  };
});

const mockGetLoggedUser = vi.fn();
const mockGetUserRoles = vi.fn();

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getLoggedUser: (...args: unknown[]) => mockGetLoggedUser(...args),
    getUserRoles: (...args: unknown[]) => mockGetUserRoles(...args),
  };
});

const authorizationRows = [
  {
    name: 'IA-0001',
    plan: 'PLAN-0001',
    department: 'Indian',
    component_item: 'RAW-CHICKEN',
    component_item_name: 'Chicken (Raw)',
    branch: 'Kozhikode',
    status: 'Authorized',
    required_qty: 100,
    authorized_qty: 60,
    remaining_after_qty: 40,
    stock_uom: 'Kg',
  },
];

const movementRows = [
  {
    name: 'SM-0001',
    issue_authorization: 'IA-0001',
    movement_type: 'Transfer' as const,
    department: 'Indian',
    component_item: 'RAW-CHICKEN',
    branch: 'Kozhikode',
    qty: 30,
    stock_uom: 'Kg',
    from_location: 'Central Store',
    to_location: 'Indian',
    posting_datetime: '2026-08-28 10:00:00',
  },
];

const grantAccess = () => {
  mockGetLoggedUser.mockResolvedValue('manager@ury.test');
  mockGetUserRoles.mockResolvedValue({ roles: ['Production Manager'], full_name: 'Test Manager' });
};

describe('DepartmentStockPage', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(departmentStockService.listIssueAuthorizations).mockResolvedValue(authorizationRows as any);
    vi.mocked(departmentStockService.listStockMovements).mockResolvedValue(movementRows as any);
    mockGetLoggedUser.mockReset();
    mockGetUserRoles.mockReset();
  });

  it('denies access for a role outside the allowed set', async () => {
    mockGetLoggedUser.mockResolvedValue('cashier@ury.test');
    mockGetUserRoles.mockResolvedValue({ roles: ['URY Cashier'], full_name: 'Cashier' });

    render(<DepartmentStockPage />);

    expect(await screen.findByTestId('department-stock-access-denied')).toBeInTheDocument();
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
  });

  it('shows a loading state while the role check resolves', async () => {
    let resolveRoles: (value: { roles: string[]; full_name: string }) => void = () => {};
    mockGetLoggedUser.mockResolvedValue('manager@ury.test');
    mockGetUserRoles.mockReturnValue(
      new Promise((resolve) => {
        resolveRoles = resolve;
      }),
    );

    render(<DepartmentStockPage />);

    expect(screen.getByTestId('department-stock-role-loading')).toBeInTheDocument();

    resolveRoles({ roles: ['System Manager'], full_name: 'Sys Manager' });
    await waitFor(() => expect(screen.queryByTestId('department-stock-role-loading')).not.toBeInTheDocument());
  });

  it('renders a populated table of issue authorizations and stock movements once a department is chosen', async () => {
    grantAccess();
    render(<DepartmentStockPage />);

    await userEvent.selectOptions(await screen.findByLabelText('Department'), 'Indian');

    expect(await screen.findByText('PLAN-0001')).toBeInTheDocument();
    expect(screen.getByText('Chicken (Raw)')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '40 Kg')).toBeInTheDocument();
    expect(screen.getByText('Transfer')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '30 Kg')).toBeInTheDocument();
  });

  it('shows empty states when no data is returned for the selected department', async () => {
    grantAccess();
    vi.mocked(departmentStockService.listIssueAuthorizations).mockResolvedValue([]);
    vi.mocked(departmentStockService.listStockMovements).mockResolvedValue([]);

    render(<DepartmentStockPage />);

    await userEvent.selectOptions(await screen.findByLabelText('Department'), 'Indian');

    expect(
      await screen.findByText('No issue authorizations found for this department and date range.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No transfers, receipts, or returns found for this department and date range.'),
    ).toBeInTheDocument();
  });

  it('renders no mutation controls (create/approve/authorize/transfer buttons)', async () => {
    grantAccess();
    render(<DepartmentStockPage />);

    await userEvent.selectOptions(await screen.findByLabelText('Department'), 'Indian');
    await screen.findByText('PLAN-0001');

    const buttons = screen.queryAllByRole('button');
    const mutationLabelPattern = /create|approve|authorize|transfer|receive|return|save|submit|issue/i;
    const mutationButtons = buttons.filter((button) => mutationLabelPattern.test(button.textContent || ''));
    expect(mutationButtons).toHaveLength(0);
  });
});
