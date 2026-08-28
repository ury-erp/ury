import React, { useEffect, useState } from 'react';
import { Card, Spinner } from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import {
  departmentStockService,
  DepartmentOption,
  IssueAuthorizationRow,
  StockMovementRow,
} from '../../services/departmentStock';

/** Roles permitted to view department stock/issue read screens. Mirrors the
 * role strings used in the V3-31/V3-32/V3-33 backend permission checks and
 * doctype permission rows (`System Manager`, `Production Manager`). `Stock
 * Manager` is included per this task's ask; see the final report for a note
 * that the backend does not currently grant it any permission on these
 * doctypes. */
export const DEPARTMENT_STOCK_ALLOWED_ROLES = ['Production Manager', 'Stock Manager', 'System Manager'];

const getDefaultFromDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const getToday = () => new Date().toISOString().slice(0, 10);

const formatQty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

interface DepartmentStockRoleGateProps {
  children: React.ReactNode;
}

/** Isolated role gate for this screen. Distinct from the app-wide
 * `RoleGuard` (which only recognizes the `URY Manager` role), since this
 * read-only screen has its own, narrower allowed-role set. */
export const DepartmentStockRoleGate: React.FC<DepartmentStockRoleGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getLoggedUser();
        if (!userId) {
          if (!cancelled) setStatus('denied');
          return;
        }
        const { roles } = await getUserRoles(userId);
        const allowed = (roles || []).some((role) => DEPARTMENT_STOCK_ALLOWED_ROLES.includes(role));
        if (!cancelled) setStatus(allowed ? 'allowed' : 'denied');
      } catch (e) {
        console.error('Failed to check department stock access role', e);
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16" data-testid="department-stock-role-loading">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <Card className="w-full max-w-md p-6 text-center" data-testid="department-stock-access-denied">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-600">
          You need the Production Manager, Stock Manager, or System Manager role to view this section.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
};

const DepartmentStockContent: React.FC = () => {
  const { activeBranchId, branches } = useBranchContext();
  const [department, setDepartment] = useState('');
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getToday);
  const [authorizations, setAuthorizations] = useState<IssueAuthorizationRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!activeBranchId || activeBranchId === 'all') {
      setDepartmentOptions([]);
      return;
    }
    departmentStockService
      .listDepartments(activeBranchId)
      .then((rows) => {
        if (!cancelled) setDepartmentOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setDepartmentOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  useEffect(() => {
    if (!department) {
      setAuthorizations([]);
      setMovements([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const filters = {
          branch: activeBranchId,
          department,
          from_date: fromDate,
          to_date: toDate,
        };
        const [authRows, movementRows] = await Promise.all([
          departmentStockService.listIssueAuthorizations(filters),
          departmentStockService.listStockMovements(filters),
        ]);
        if (cancelled) return;
        setAuthorizations(authRows);
        setMovements(movementRows);
      } catch (err) {
        if (!cancelled) {
          setAuthorizations([]);
          setMovements([]);
          setError('Unable to load department stock and issue authorization data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, department, fromDate, toDate]);

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-gray-200 px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-gray-900">Department Stock &amp; Issue Authorizations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Read-only view of authorized issue quantities, remaining entitlement, and related stock movements
          for a department.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-gray-600">
            Department
            <select
              aria-label="Department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="">Select department</option>
              {departmentOptions.map((dept) => (
                <option key={dept.name} value={dept.name}>
                  {dept.department_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-gray-600">
            From
            <input
              aria-label="From date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-gray-600">
            To
            <input
              aria-label="To date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
        </div>
      </div>

      {!department ? (
        <Card className="p-10 text-center text-sm text-gray-500">Select a department to view its data.</Card>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
              Issue Authorizations
            </h2>
            {authorizations.length === 0 ? (
              <Card className="p-8 text-center text-sm text-gray-500">
                No issue authorizations found for this department and date range.
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Component</th>
                        <th className="px-4 py-3 text-right">Authorized Qty</th>
                        <th className="px-4 py-3 text-right">Remaining Entitlement</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {authorizations.map((row) => (
                        <tr key={row.name}>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.plan}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {row.component_item_name || row.component_item}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatQty(row.authorized_qty)} {row.stock_uom}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatQty(row.remaining_after_qty)} {row.stock_uom}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
              Related Stock Movements
            </h2>
            {movements.length === 0 ? (
              <Card className="p-8 text-center text-sm text-gray-500">
                No transfers, receipts, or returns found for this department and date range.
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Component</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3">From</th>
                        <th className="px-4 py-3">To</th>
                        <th className="px-4 py-3">Posted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {movements.map((row) => (
                        <tr key={row.name}>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.movement_type}</td>
                          <td className="px-4 py-3 text-gray-700">{row.component_item}</td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {formatQty(row.qty)} {row.stock_uom}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{row.from_location}</td>
                          <td className="px-4 py-3 text-gray-600">{row.to_location}</td>
                          <td className="px-4 py-3 text-gray-600">{row.posting_datetime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export const DepartmentStockPage: React.FC = () => (
  <DepartmentStockRoleGate>
    <DepartmentStockContent />
  </DepartmentStockRoleGate>
);

export default DepartmentStockPage;
