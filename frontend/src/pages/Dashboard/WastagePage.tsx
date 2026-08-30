import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DataTableColumn,
  Drawer,
  DrawerSectionLabel,
  Input,
  KeyValueRow,
  KpiItemProps,
  KpiStrip,
  Select,
  Spinner,
  numericCellClass,
} from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { departmentStockService, DepartmentOption, WastageRow } from '../../services/departmentStock';

/** Roles permitted to view wastage records. Mirrors
 * `DEPARTMENT_STOCK_ALLOWED_ROLES` in `DepartmentStockPage.tsx`, since
 * `URY Issue Wastage` shares its permission model with the department
 * stock/issue authorization screens. */
export const WASTAGE_ALLOWED_ROLES = ['Production Manager', 'Stock Manager', 'System Manager'];

/** Roles permitted to approve/reject a captured wastage record. Mirrors
 * `ury.ury.api.ury_wastage.APPROVE_ROLES`. */
const APPROVE_ROLES = ['Stock Manager', 'System Manager'];

const getDefaultFromDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const getToday = () => new Date().toISOString().slice(0, 10);

const formatQty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface WastageRoleGateProps {
  children: React.ReactNode;
}

/** Isolated role gate for this screen, matching `DepartmentStockRoleGate`'s
 * pattern: distinct from the app-wide `RoleGuard` (which only recognizes the
 * `URY Manager` role). */
export const WastageRoleGate: React.FC<WastageRoleGateProps> = ({ children }) => {
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
        const allowed = (roles || []).some((role) => WASTAGE_ALLOWED_ROLES.includes(role));
        if (!cancelled) setStatus(allowed ? 'allowed' : 'denied');
      } catch (e) {
        console.error('Failed to check wastage access role', e);
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16" data-testid="wastage-role-loading">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <Card className="w-full max-w-md p-6 text-center" data-testid="wastage-access-denied">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">
          You need the Production Manager, Stock Manager, or System Manager role to view this section.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
};

const statusBadgeVariant = (status: string): 'success' | 'danger' | 'pending' | 'secondary' => {
  if (status === 'Authorized') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Draft') return 'pending';
  return 'secondary';
};

const WastageContent: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [department, setDepartment] = useState('');
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getToday);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [wastageRows, setWastageRows] = useState<WastageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedRow, setSelectedRow] = useState<WastageRow | null>(null);
  const [drawerAction, setDrawerAction] = useState<'approve' | 'reject' | null>(null);
  const [drawerActionBusy, setDrawerActionBusy] = useState(false);

  const canApprove = userRoles.some((role) => APPROVE_ROLES.includes(role));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getLoggedUser();
        if (!userId) return;
        const { roles } = await getUserRoles(userId);
        if (!cancelled) setUserRoles(roles || []);
      } catch (e) {
        console.error('Failed to load wastage user roles', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!activeBranchId || activeBranchId === 'all') {
      setWastageRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rows = await departmentStockService.listWastage({
          branch: activeBranchId,
          department,
          from_date: fromDate,
          to_date: toDate,
        });
        if (!cancelled) setWastageRows(rows);
      } catch {
        if (!cancelled) {
          setWastageRows([]);
          setError('Unable to load wastage data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, department, fromDate, toDate, refreshToken]);

  const refresh = () => {
    setRefreshToken((token) => token + 1);
  };

  const closeDrawer = () => {
    setSelectedRow(null);
    setDrawerAction(null);
    setDrawerActionBusy(false);
  };

  const openDrawer = (row: WastageRow) => {
    setDrawerAction(null);
    setSelectedRow(row);
  };

  const handleDrawerConfirm = async () => {
    if (!selectedRow || !drawerAction) return;
    setActionError(null);
    setDrawerActionBusy(true);
    try {
      if (drawerAction === 'approve') {
        await departmentStockService.approveWastage(selectedRow.name);
      } else {
        await departmentStockService.rejectWastage(selectedRow.name);
      }
      closeDrawer();
      refresh();
    } catch {
      setActionError(
        drawerAction === 'approve' ? 'Unable to approve this wastage record.' : 'Unable to reject this wastage record.'
      );
      setDrawerActionBusy(false);
    }
  };

  const departmentName = (dept: string) =>
    departmentOptions.find((d) => d.name === dept)?.department_name || dept;

  /**
   * KPI figures computed strictly from `listWastage()`'s real rows. The
   * `URY Issue Wastage` backend list endpoint
   * (`ury.ury.api.ury_wastage.list_wastage`) does not currently return a
   * `creation`/timestamp, `stock_uom`, `reason_category`, `owner`, or
   * `issue_authorization` field -- only `name`, `component_item`,
   * `wasted_qty`, `status`, `department`, `branch`, `company`,
   * `valuation_rate`, and `valuation_amount`. So "largest cause" and
   * "highest department" below use what's actually returned: department is
   * present, but reason category is not, so a cause breakdown is omitted
   * rather than fabricated. A "% of sales" stat was also considered per the
   * task brief, but no real daily sales figure is available from any
   * existing service in this frontend (there is no `uryDashboardService`
   * module), so it is omitted too.
   */
  const kpis = useMemo<KpiItemProps[]>(() => {
    const totalValue = wastageRows.reduce((sum, row) => sum + (row.valuation_amount ?? 0), 0);
    const entryCount = wastageRows.length;

    const byDepartment = new Map<string, number>();
    for (const row of wastageRows) {
      const key = row.department || 'Unknown';
      byDepartment.set(key, (byDepartment.get(key) ?? 0) + (row.valuation_amount ?? 0));
    }
    let highestDepartment: { name: string; value: number } | null = null;
    for (const [name, value] of byDepartment) {
      if (!highestDepartment || value > highestDepartment.value) {
        highestDepartment = { name, value };
      }
    }

    const items: KpiItemProps[] = [
      {
        label: "Total Wastage Value",
        value: `Rs. ${formatCurrency(totalValue)}`,
        tone: 'danger',
      },
      {
        label: 'Entries',
        value: entryCount,
        tone: 'default',
      },
      {
        label: 'Highest Department',
        value: highestDepartment ? highestDepartment.name : 'N/A',
        hint: highestDepartment ? `Rs. ${formatCurrency(highestDepartment.value)}` : undefined,
        tone: 'warning',
      },
    ];
    return items;
  }, [wastageRows]);

  const columns: DataTableColumn<WastageRow>[] = [
    {
      key: 'component_item',
      header: 'Item',
      render: (row) => <span className="font-medium text-foreground">{row.component_item}</span>,
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => departmentName(row.department),
    },
    {
      key: 'wasted_qty',
      header: 'Qty',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{formatQty(row.wasted_qty)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'valuation_amount',
      header: 'Value',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {row.valuation_amount !== undefined ? `Rs. ${formatCurrency(row.valuation_amount)}` : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Wastage</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Read-only view of captured wastage entries and their approval status for a branch and date range.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            Department
            <Select
              aria-label="Department"
              size="sm"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="mt-1"
            >
              <option value="">All departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept.name} value={dept.name}>
                  {dept.department_name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            From
            <Input
              aria-label="From date"
              type="date"
              size="sm"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            To
            <Input
              aria-label="To date"
              type="date"
              size="sm"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1"
            />
          </label>
        </div>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Card className="p-10 text-center text-sm text-text-tertiary">Select a branch to view wastage data.</Card>
      ) : (
        <>
          <KpiStrip items={kpis} />

          {actionError && <Card className="border-destructive bg-destructive-tint p-4 text-sm text-destructive">{actionError}</Card>}

          {error ? (
            <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
          ) : (
            <DataTable
              columns={columns}
              rows={wastageRows}
              isLoading={loading}
              emptyMessage="No wastage records found for this branch, department, and date range."
              onRowClick={openDrawer}
            />
          )}
        </>
      )}

      <Drawer
        open={selectedRow !== null}
        onClose={closeDrawer}
        title={selectedRow ? selectedRow.component_item : 'Wastage entry'}
        footer={
          selectedRow && canApprove && selectedRow.status === 'Draft' ? (
            drawerAction ? (
              <>
                <span className="mr-auto self-center text-xs text-muted-foreground">
                  {drawerAction === 'approve' ? 'Approve this entry?' : 'Reject this entry?'}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setDrawerAction(null)} disabled={drawerActionBusy}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleDrawerConfirm} disabled={drawerActionBusy}>
                  Confirm
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => setDrawerAction('reject')}>
                  Reject
                </Button>
                <Button type="button" size="sm" onClick={() => setDrawerAction('approve')}>
                  Approve
                </Button>
              </>
            )
          ) : undefined
        }
      >
        {selectedRow && (
          <>
            <DrawerSectionLabel>Details</DrawerSectionLabel>
            <KeyValueRow label="Item" value={selectedRow.component_item} />
            <KeyValueRow label="Department" value={departmentName(selectedRow.department)} />
            <KeyValueRow label="Wasted qty" value={formatQty(selectedRow.wasted_qty)} />
            <KeyValueRow
              label="Status"
              value={<Badge variant={statusBadgeVariant(selectedRow.status)}>{selectedRow.status}</Badge>}
            />
            {selectedRow.branch !== undefined && <KeyValueRow label="Branch" value={selectedRow.branch} />}
            {selectedRow.company !== undefined && <KeyValueRow label="Company" value={selectedRow.company} />}
            {selectedRow.valuation_rate !== undefined && (
              <KeyValueRow label="Valuation rate" value={`Rs. ${formatCurrency(selectedRow.valuation_rate)}`} />
            )}
            {selectedRow.valuation_amount !== undefined && (
              <KeyValueRow label="Valuation amount" value={`Rs. ${formatCurrency(selectedRow.valuation_amount)}`} />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export const WastagePage: React.FC = () => (
  <WastageRoleGate>
    <WastageContent />
  </WastageRoleGate>
);

export default WastagePage;
