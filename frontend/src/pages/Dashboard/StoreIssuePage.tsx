import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, DataTable, KpiStrip, Spinner, numericCellClass } from '@ury/ui';
import type { DataTableColumn } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import {
  departmentStockService,
  DepartmentOption,
  IssueAuthorizationRow,
} from '../../services/departmentStock';

const getDefaultFromDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const getToday = () => new Date().toISOString().slice(0, 10);

const formatQty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/**
 * A row is "fully issued" once nothing remains against its authorized
 * quantity. `remaining_after_qty` is the backend's own running entitlement
 * balance, so this reuses it rather than re-deriving issue state.
 */
const isFullyIssued = (row: IssueAuthorizationRow) => row.remaining_after_qty <= 0;

/**
 * `IssueAuthorizationRow` has no separate "issued qty" field -- only
 * `authorized_qty` (what was authorized) and `remaining_after_qty` (what's
 * still left to draw). "Issued so far" is the difference between the two,
 * computed here rather than fabricated as a distinct backend field.
 */
const issuedQty = (row: IssueAuthorizationRow) =>
  Math.max(0, row.authorized_qty - row.remaining_after_qty);

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'pending' | 'cancelled' => {
  const normalized = status.toLowerCase();
  if (normalized === 'authorized') return 'success';
  if (normalized === 'cancelled' || normalized === 'rejected') return 'cancelled';
  if (normalized === 'draft' || normalized === 'pending') return 'pending';
  return 'warning';
};

const StoreIssueContent: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getToday);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [rows, setRows] = useState<IssueAuthorizationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeBranchId || activeBranchId === 'all') {
      setDepartmentOptions([]);
      return;
    }
    departmentStockService
      .listDepartments(activeBranchId)
      .then((options) => {
        if (!cancelled) setDepartmentOptions(options);
      })
      .catch(() => {
        if (!cancelled) setDepartmentOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all' || departmentOptions.length === 0) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const perDepartment = await Promise.all(
          departmentOptions.map((option) =>
            departmentStockService.listIssueAuthorizations({
              branch: activeBranchId,
              department: option.name,
              from_date: fromDate,
              to_date: toDate,
            })
          )
        );
        if (cancelled) return;
        setRows(perDepartment.flat());
      } catch {
        if (!cancelled) {
          setRows([]);
          setError('Unable to load store issue data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, departmentOptions, fromDate, toDate]);

  const kpiItems = useMemo(() => {
    const fullyIssuedCount = rows.filter(isFullyIssued).length;
    const departmentsWithRows = new Set(rows.map((row) => row.department));
    return [
      { label: 'Lines Authorised', value: rows.length },
      { label: 'Fully Issued', value: fullyIssuedCount },
      { label: 'Departments Covered', value: departmentsWithRows.size },
    ];
  }, [rows]);

  const departmentChips = useMemo(() => {
    const byDepartment = new Map<string, { name: string; total: number; issued: number }>();
    rows.forEach((row) => {
      const label =
        departmentOptions.find((option) => option.name === row.department)?.department_name ||
        row.department;
      const existing = byDepartment.get(row.department) || { name: label, total: 0, issued: 0 };
      existing.total += 1;
      if (isFullyIssued(row)) existing.issued += 1;
      byDepartment.set(row.department, existing);
    });
    return Array.from(byDepartment.entries()).map(([department, summary]) => ({ department, ...summary }));
  }, [rows, departmentOptions]);

  const columns: DataTableColumn<IssueAuthorizationRow>[] = [
    {
      key: 'component_item',
      header: 'Material',
      render: (row) => (
        <span className="font-medium text-foreground">{row.component_item_name || row.component_item}</span>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) =>
        departmentOptions.find((option) => option.name === row.department)?.department_name || row.department,
    },
    {
      key: 'authorized_qty',
      header: 'Authorised Qty',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {formatQty(row.authorized_qty)} {row.stock_uom}
        </span>
      ),
    },
    {
      key: 'issued_qty',
      header: 'Issued Qty',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {formatQty(issuedQty(row))} {row.stock_uom}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {formatQty(row.remaining_after_qty)} {row.stock_uom}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'view',
      header: '',
      render: (row) => (
        <Link
          to="/department-stock"
          className="text-xs font-semibold text-primary hover:underline"
          title={`Open ${row.department} in Department Stock`}
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Store Issue</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Read-only view of issue authorizations across every department for this branch and date range.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            From
            <input
              aria-label="From date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            To
            <input
              aria-label="To date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        </div>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Card className="p-10 text-center text-sm text-text-tertiary">Select a branch to view store issue data.</Card>
      ) : error ? (
        <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      ) : (
        <>
          <KpiStrip items={kpiItems} />

          {departmentChips.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="store-issue-department-chips">
              {departmentChips.map((chip) => (
                <Badge key={chip.department} variant={chip.issued === chip.total ? 'success' : 'pending'}>
                  {chip.name}: {chip.issued}/{chip.total} issued
                </Badge>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
              <Spinner className="h-8 w-8 text-primary" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              emptyMessage="No issue authorizations found for this branch and date range."
            />
          )}
        </>
      )}
    </div>
  );
};

export const StoreIssuePage: React.FC = () => <StoreIssueContent />;

export default StoreIssuePage;
