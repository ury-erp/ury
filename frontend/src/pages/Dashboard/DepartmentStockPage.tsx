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
import {
  departmentStockService,
  DepartmentOption,
  IssueAuthorizationRow,
  PlanComponentDemand,
  StockMovementRow,
  WastageRow,
  WASTAGE_REASON_CATEGORIES,
  WastageReasonCategory,
} from '../../services/departmentStock';

/** Roles permitted to view department stock/issue read screens. Mirrors the
 * role strings used in the V3-31/V3-32/V3-33 backend permission checks and
 * doctype permission rows (`System Manager`, `Production Manager`). `Stock
 * Manager` is included per this task's ask; see the final report for a note
 * that the backend does not currently grant it any permission on these
 * doctypes. */
export const DEPARTMENT_STOCK_ALLOWED_ROLES = ['Production Manager', 'Stock Manager', 'System Manager'];

/** Roles permitted to capture a wastage record and request a new issue
 * authorization. Mirrors `ury.ury.api.ury_wastage.CAPTURE_ROLES`. */
const CAPTURE_ROLES = ['Production Manager', 'System Manager'];

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

/** Mirrors `StoreIssuePage.tsx`'s badge mapping for `URY Issue
 * Authorization.status`. */
const authorizationBadgeVariant = (status: string): 'success' | 'warning' | 'pending' | 'cancelled' => {
  const normalized = status.toLowerCase();
  if (normalized === 'authorized') return 'success';
  if (normalized === 'cancelled' || normalized === 'rejected') return 'cancelled';
  if (normalized === 'draft' || normalized === 'pending') return 'pending';
  return 'warning';
};

/** Mirrors `WastagePage.tsx`'s badge mapping for `URY Issue
 * Wastage.status`. */
const wastageBadgeVariant = (status: string): 'success' | 'danger' | 'pending' | 'secondary' => {
  if (status === 'Authorized') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Draft') return 'pending';
  return 'secondary';
};

/** `URY Stock Movement.movement_type` badge -- Transfer/Receipt/Return are
 * peers, not a status progression, so this uses neutral/informational
 * variants rather than success/danger semantics. */
const movementBadgeVariant = (movementType: StockMovementRow['movement_type']): 'info' | 'success' | 'secondary' => {
  if (movementType === 'Receipt') return 'success';
  if (movementType === 'Return') return 'secondary';
  return 'info';
};

/** A row is "fully issued" once nothing remains against its authorized
 * quantity. `remaining_after_qty` is the backend's own running entitlement
 * balance, so this reuses it rather than re-deriving issue state. Mirrors
 * `StoreIssuePage.tsx`. */
const isFullyIssued = (row: IssueAuthorizationRow) => row.remaining_after_qty <= 0;

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

interface CaptureWastageFormProps {
  authorization: IssueAuthorizationRow;
  onCancel: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const CaptureWastageForm: React.FC<CaptureWastageFormProps> = ({ authorization, onCancel, onSuccess, onError }) => {
  const [wastedQty, setWastedQty] = useState('');
  const [reasonCategory, setReasonCategory] = useState<WastageReasonCategory>(WASTAGE_REASON_CATEGORIES[0]);
  const [reasonNotes, setReasonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const qty = Number(wastedQty);
    if (!qty || qty <= 0) return;
    setSubmitting(true);
    try {
      await departmentStockService.captureWastage({
        issue_authorization: authorization.name,
        wasted_qty: qty,
        reason_category: reasonCategory,
        reason_notes: reasonNotes || undefined,
        branch: authorization.branch,
        company: authorization.company,
      });
      onSuccess();
    } catch {
      onError('Unable to capture wastage for this issue authorization.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Wasted Qty
        <Input
          aria-label="Wasted quantity"
          type="number"
          min="0"
          step="any"
          size="sm"
          value={wastedQty}
          onChange={(event) => setWastedQty(event.target.value)}
          className="mt-1"
          required
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Reason
        <Select
          aria-label="Reason category"
          size="sm"
          value={reasonCategory}
          onChange={(event) => setReasonCategory(event.target.value as WastageReasonCategory)}
          className="mt-1"
        >
          {WASTAGE_REASON_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Notes (optional)
        <Input
          aria-label="Reason notes"
          type="text"
          size="sm"
          value={reasonNotes}
          onChange={(event) => setReasonNotes(event.target.value)}
          className="mt-1"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          Submit Wastage
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

interface RequestAuthorizationFormProps {
  branch: string;
  department: string;
  departmentName: string;
  onCancel: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

/** Cascading Request Authorization form: Plan is auto-resolved for the
 * active branch/date (an amateur operator should never need to know or type
 * an internal Sales Plan document name), Department is inherited from the
 * page's already-selected department, and Component is a dropdown of what
 * that department's approved plan actually requires -- not a raw item code
 * field. Quantity is pre-filled from the plan's required quantity for the
 * chosen component but stays editable. See the final report for the
 * upstream data gap that leaves the Component dropdown empty until the
 * Sales Plan's frozen demand vector is actually populated. */
const RequestAuthorizationForm: React.FC<RequestAuthorizationFormProps> = ({
  branch,
  department,
  departmentName,
  onCancel,
  onSuccess,
  onError,
}) => {
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [componentOptions, setComponentOptions] = useState<PlanComponentDemand[]>([]);
  const [componentItem, setComponentItem] = useState('');
  const [requestedQty, setRequestedQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlan(true);
    setPlanError(null);
    setComponentOptions([]);
    setComponentItem('');
    setRequestedQty('');

    (async () => {
      try {
        const plan = await departmentStockService.getActivePlan(branch, getToday());
        if (cancelled) return;
        if (!plan) {
          setPlanName(null);
          setPlanStatus(null);
          setPlanError('No approved sales plan was found for this branch today.');
          return;
        }
        setPlanName(plan.name);
        setPlanStatus(plan.status);
        const forDepartment = plan.demandVector.filter((row) => row.department === department);
        setComponentOptions(forDepartment);
        if (forDepartment.length === 0) {
          setPlanError(
            'This plan has no required components recorded yet for this department, so there is nothing to request against.'
          );
        }
      } catch {
        if (!cancelled) {
          setPlanName(null);
          setPlanStatus(null);
          setPlanError('Unable to load the active sales plan for this branch.');
        }
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branch, department]);

  const selectedComponent = componentOptions.find((row) => row.component_item === componentItem);

  const handleComponentChange = (value: string) => {
    setComponentItem(value);
    const row = componentOptions.find((option) => option.component_item === value);
    setRequestedQty(row ? String(row.required_qty) : '');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const qty = Number(requestedQty);
    if (!planName || !department || !componentItem || !qty || qty <= 0) return;
    setSubmitting(true);
    try {
      await departmentStockService.createIssueAuthorization({
        plan: planName,
        department,
        component_item: componentItem,
        requested_qty: qty,
        branch: branch === 'all' ? undefined : branch,
      });
      onSuccess();
    } catch {
      onError('Unable to create issue authorization for this plan and component.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPlan) {
    return (
      <div className="mt-3 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 p-6">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-end sm:flex-wrap"
    >
      <div className="flex flex-col text-xs font-medium text-gray-600">
        Plan
        <span className="mt-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900">
          {planName || 'No active plan'}
          {planStatus ? ` (${planStatus})` : ''}
        </span>
      </div>
      <div className="flex flex-col text-xs font-medium text-gray-600">
        Department
        <span className="mt-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900">
          {departmentName}
        </span>
      </div>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Required Component
        <Select
          aria-label="Required component"
          size="sm"
          value={componentItem}
          onChange={(event) => handleComponentChange(event.target.value)}
          className="mt-1"
          disabled={componentOptions.length === 0}
          required
        >
          <option value="">Select component</option>
          {componentOptions.map((option) => (
            <option key={option.component_item} value={option.component_item}>
              {option.component_item_name || option.component_item}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Requested Qty
        <Input
          aria-label="Requested quantity"
          type="number"
          min="0"
          step="any"
          size="sm"
          value={requestedQty}
          onChange={(event) => setRequestedQty(event.target.value)}
          className="mt-1"
          disabled={!componentItem}
          required
        />
        {selectedComponent && (
          <span className="mt-1 text-xs font-normal text-gray-500">
            Suggested: {formatQty(selectedComponent.required_qty)} {selectedComponent.stock_uom || ''}
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting || !planName || !componentItem}>
          Request Authorization
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {planError && <p className="w-full text-xs font-normal text-red-600">{planError}</p>}
    </form>
  );
};

const DepartmentStockContent: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [department, setDepartment] = useState('');
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getToday);
  const [authorizations, setAuthorizations] = useState<IssueAuthorizationRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [wastageRows, setWastageRows] = useState<WastageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);

  const [selectedAuthorization, setSelectedAuthorization] = useState<IssueAuthorizationRow | null>(null);
  const [showCaptureForm, setShowCaptureForm] = useState(false);
  const [selectedWastage, setSelectedWastage] = useState<WastageRow | null>(null);
  const [wastageDrawerAction, setWastageDrawerAction] = useState<'approve' | 'reject' | null>(null);
  const [wastageDrawerBusy, setWastageDrawerBusy] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<StockMovementRow | null>(null);

  const canCapture = userRoles.some((role) => CAPTURE_ROLES.includes(role));
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
        console.error('Failed to load department stock user roles', e);
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
    if (!department) {
      setAuthorizations([]);
      setMovements([]);
      setWastageRows([]);
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
        const [authRows, movementRows, wastage] = await Promise.all([
          departmentStockService.listIssueAuthorizations(filters),
          departmentStockService.listStockMovements(filters),
          departmentStockService.listWastage(filters),
        ]);
        if (cancelled) return;
        setAuthorizations(authRows);
        setMovements(movementRows);
        setWastageRows(wastage);
      } catch {
        if (!cancelled) {
          setAuthorizations([]);
          setMovements([]);
          setWastageRows([]);
          setError('Unable to load department stock and issue authorization data.');
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
    setActionError(null);
    setShowRequestForm(false);
    setShowCaptureForm(false);
    setSelectedAuthorization(null);
    setWastageDrawerAction(null);
    setWastageDrawerBusy(false);
    setSelectedWastage(null);
    setRefreshToken((token) => token + 1);
  };

  const closeWastageDrawer = () => {
    setSelectedWastage(null);
    setWastageDrawerAction(null);
    setWastageDrawerBusy(false);
  };

  const handleWastageDrawerConfirm = async () => {
    if (!selectedWastage || !wastageDrawerAction) return;
    setActionError(null);
    setWastageDrawerBusy(true);
    try {
      if (wastageDrawerAction === 'approve') {
        await departmentStockService.approveWastage(selectedWastage.name);
      } else {
        await departmentStockService.rejectWastage(selectedWastage.name);
      }
      refresh();
    } catch {
      setActionError(
        wastageDrawerAction === 'approve'
          ? 'Unable to approve this wastage record.'
          : 'Unable to reject this wastage record.'
      );
      setWastageDrawerBusy(false);
    }
  };

  const departmentName = (dept: string) =>
    departmentOptions.find((opt) => opt.name === dept)?.department_name || dept;

  /**
   * KPI figures computed strictly from the three real datasets already
   * fetched for this department/date range -- no fabricated opening-value,
   * yield %, or "Supports" figures (those fields don't exist on
   * `IssueAuthorizationRow`, `WastageRow`, or `StockMovementRow`; see
   * `departmentStock.ts`). "Wastage Value" reuses `WastageRow.valuation_amount`,
   * the same real field `WastagePage.tsx`'s KPI strip uses.
   */
  const kpis = useMemo<KpiItemProps[]>(() => {
    const fullyIssuedCount = authorizations.filter(isFullyIssued).length;
    const totalWastageValue = wastageRows.reduce((sum, row) => sum + (row.valuation_amount ?? 0), 0);

    const items: KpiItemProps[] = [
      { label: 'Issue Lines', value: authorizations.length },
      { label: 'Fully Issued', value: fullyIssuedCount, tone: 'default' },
      { label: 'Wastage Entries', value: wastageRows.length, tone: wastageRows.length > 0 ? 'danger' : 'default' },
      { label: 'Wastage Value', value: `Rs. ${formatCurrency(totalWastageValue)}`, tone: 'danger' },
      { label: 'Stock Movements', value: movements.length },
    ];
    return items;
  }, [authorizations, wastageRows, movements]);

  const authorizationColumns: DataTableColumn<IssueAuthorizationRow>[] = [
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => <span className="font-medium text-gray-900">{row.plan}</span>,
    },
    {
      key: 'component_item',
      header: 'Component',
      render: (row) => row.component_item_name || row.component_item,
    },
    {
      key: 'authorized_qty',
      header: 'Authorized Qty',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {formatQty(row.authorized_qty)} {row.stock_uom}
        </span>
      ),
    },
    {
      key: 'remaining_after_qty',
      header: 'Remaining Entitlement',
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
      render: (row) => <Badge variant={authorizationBadgeVariant(row.status)}>{row.status}</Badge>,
    },
  ];

  const wastageColumns: DataTableColumn<WastageRow>[] = [
    {
      key: 'component_item',
      header: 'Component',
      render: (row) => <span className="font-medium text-gray-900">{row.component_item}</span>,
    },
    {
      key: 'wasted_qty',
      header: 'Wasted Qty',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{formatQty(row.wasted_qty)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={wastageBadgeVariant(row.status)}>{row.status}</Badge>,
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

  const movementColumns: DataTableColumn<StockMovementRow>[] = [
    {
      key: 'movement_type',
      header: 'Type',
      render: (row) => <Badge variant={movementBadgeVariant(row.movement_type)}>{row.movement_type}</Badge>,
    },
    {
      key: 'component_item',
      header: 'Component',
      render: (row) => <span className="font-medium text-gray-900">{row.component_item}</span>,
    },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {formatQty(row.qty)} {row.stock_uom}
        </span>
      ),
    },
    {
      key: 'from_location',
      header: 'From',
      render: (row) => row.from_location || '-',
    },
    {
      key: 'to_location',
      header: 'To',
      render: (row) => row.to_location || '-',
    },
    {
      key: 'posting_datetime',
      header: 'Posted',
      render: (row) => row.posting_datetime || '-',
    },
  ];

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
            <Select
              aria-label="Department"
              size="sm"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="mt-1"
            >
              <option value="">Select department</option>
              {departmentOptions.map((dept) => (
                <option key={dept.name} value={dept.name}>
                  {dept.department_name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col text-xs font-medium text-gray-600">
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
          <label className="flex flex-col text-xs font-medium text-gray-600">
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

      {!department ? (
        <Card className="p-10 text-center text-sm text-gray-500">Select a department to view its data.</Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>
      ) : (
        <>
          <KpiStrip items={kpis} />

          {actionError && (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</Card>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-gray-700">Issue Authorizations</h2>
              {canCapture && !showRequestForm && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowRequestForm(true)}>
                  Request Authorization
                </Button>
              )}
            </div>

            {showRequestForm && (
              <RequestAuthorizationForm
                branch={activeBranchId}
                department={department}
                departmentName={
                  departmentOptions.find((opt) => opt.name === department)?.department_name || department
                }
                onCancel={() => setShowRequestForm(false)}
                onSuccess={refresh}
                onError={setActionError}
              />
            )}

            <div className="mt-2">
              <DataTable
                columns={authorizationColumns}
                rows={authorizations}
                isLoading={loading}
                emptyMessage="No issue authorizations found for this department and date range."
                onRowClick={(row) => {
                  setSelectedAuthorization(row);
                  setShowCaptureForm(false);
                }}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-700">Wastage</h2>
            <DataTable
              columns={wastageColumns}
              rows={wastageRows}
              isLoading={loading}
              emptyMessage="No wastage records found for this department and date range."
              onRowClick={(row) => {
                setSelectedWastage(row);
                setWastageDrawerAction(null);
              }}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-700">Related Stock Movements</h2>
            <DataTable
              columns={movementColumns}
              rows={movements}
              isLoading={loading}
              emptyMessage="No transfers, receipts, or returns found for this department and date range."
              onRowClick={setSelectedMovement}
            />
          </section>
        </>
      )}

      <Drawer
        open={selectedAuthorization !== null}
        onClose={() => {
          setSelectedAuthorization(null);
          setShowCaptureForm(false);
        }}
        title={selectedAuthorization ? selectedAuthorization.component_item_name || selectedAuthorization.component_item : 'Issue authorization'}
        footer={
          selectedAuthorization && canCapture && selectedAuthorization.status === 'Authorized' && !showCaptureForm ? (
            <Button type="button" size="sm" onClick={() => setShowCaptureForm(true)}>
              Capture Wastage
            </Button>
          ) : undefined
        }
      >
        {selectedAuthorization && (
          <>
            <DrawerSectionLabel>Details</DrawerSectionLabel>
            <KeyValueRow label="Plan" value={selectedAuthorization.plan} />
            <KeyValueRow label="Department" value={departmentName(selectedAuthorization.department)} />
            <KeyValueRow
              label="Component"
              value={selectedAuthorization.component_item_name || selectedAuthorization.component_item}
            />
            <KeyValueRow
              label="Status"
              value={<Badge variant={authorizationBadgeVariant(selectedAuthorization.status)}>{selectedAuthorization.status}</Badge>}
            />
            <KeyValueRow
              label="Required qty"
              value={`${formatQty(selectedAuthorization.required_qty)} ${selectedAuthorization.stock_uom || ''}`}
            />
            <KeyValueRow
              label="Authorized qty"
              value={`${formatQty(selectedAuthorization.authorized_qty)} ${selectedAuthorization.stock_uom || ''}`}
            />
            <KeyValueRow
              label="Remaining entitlement"
              value={`${formatQty(selectedAuthorization.remaining_after_qty)} ${selectedAuthorization.stock_uom || ''}`}
            />
            {selectedAuthorization.production_unit && (
              <KeyValueRow label="Production unit" value={selectedAuthorization.production_unit} />
            )}
            {selectedAuthorization.branch && <KeyValueRow label="Branch" value={selectedAuthorization.branch} />}
            {selectedAuthorization.company && <KeyValueRow label="Company" value={selectedAuthorization.company} />}
            {selectedAuthorization.creation && <KeyValueRow label="Created" value={selectedAuthorization.creation} />}

            {showCaptureForm && (
              <>
                <DrawerSectionLabel>Capture Wastage</DrawerSectionLabel>
                <CaptureWastageForm
                  authorization={selectedAuthorization}
                  onCancel={() => setShowCaptureForm(false)}
                  onSuccess={refresh}
                  onError={setActionError}
                />
              </>
            )}
          </>
        )}
      </Drawer>

      <Drawer
        open={selectedWastage !== null}
        onClose={closeWastageDrawer}
        title={selectedWastage ? selectedWastage.component_item : 'Wastage entry'}
        footer={
          selectedWastage && canApprove && selectedWastage.status === 'Draft' ? (
            wastageDrawerAction ? (
              <>
                <span className="mr-auto self-center text-xs text-gray-600">
                  {wastageDrawerAction === 'approve' ? 'Approve this entry?' : 'Reject this entry?'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setWastageDrawerAction(null)}
                  disabled={wastageDrawerBusy}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleWastageDrawerConfirm} disabled={wastageDrawerBusy}>
                  Confirm
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => setWastageDrawerAction('reject')}>
                  Reject
                </Button>
                <Button type="button" size="sm" onClick={() => setWastageDrawerAction('approve')}>
                  Approve
                </Button>
              </>
            )
          ) : undefined
        }
      >
        {selectedWastage && (
          <>
            <DrawerSectionLabel>Details</DrawerSectionLabel>
            <KeyValueRow label="Component" value={selectedWastage.component_item} />
            <KeyValueRow label="Department" value={departmentName(selectedWastage.department)} />
            <KeyValueRow label="Wasted qty" value={formatQty(selectedWastage.wasted_qty)} />
            <KeyValueRow
              label="Status"
              value={<Badge variant={wastageBadgeVariant(selectedWastage.status)}>{selectedWastage.status}</Badge>}
            />
            {selectedWastage.branch !== undefined && <KeyValueRow label="Branch" value={selectedWastage.branch} />}
            {selectedWastage.company !== undefined && <KeyValueRow label="Company" value={selectedWastage.company} />}
            {selectedWastage.valuation_rate !== undefined && (
              <KeyValueRow label="Valuation rate" value={`Rs. ${formatCurrency(selectedWastage.valuation_rate)}`} />
            )}
            {selectedWastage.valuation_amount !== undefined && (
              <KeyValueRow label="Valuation amount" value={`Rs. ${formatCurrency(selectedWastage.valuation_amount)}`} />
            )}
          </>
        )}
      </Drawer>

      <Drawer
        open={selectedMovement !== null}
        onClose={() => setSelectedMovement(null)}
        title={selectedMovement ? selectedMovement.component_item : 'Stock movement'}
      >
        {selectedMovement && (
          <>
            <DrawerSectionLabel>Details</DrawerSectionLabel>
            <KeyValueRow
              label="Type"
              value={<Badge variant={movementBadgeVariant(selectedMovement.movement_type)}>{selectedMovement.movement_type}</Badge>}
            />
            <KeyValueRow label="Component" value={selectedMovement.component_item} />
            <KeyValueRow label="Department" value={departmentName(selectedMovement.department)} />
            <KeyValueRow
              label="Qty"
              value={`${formatQty(selectedMovement.qty)} ${selectedMovement.stock_uom || ''}`}
            />
            <KeyValueRow label="From" value={selectedMovement.from_location || '-'} />
            <KeyValueRow label="To" value={selectedMovement.to_location || '-'} />
            <KeyValueRow label="Posted" value={selectedMovement.posting_datetime || '-'} />
            <KeyValueRow label="Issue authorization" value={selectedMovement.issue_authorization} />
            {selectedMovement.branch && <KeyValueRow label="Branch" value={selectedMovement.branch} />}
            {selectedMovement.company && <KeyValueRow label="Company" value={selectedMovement.company} />}
          </>
        )}
      </Drawer>
    </div>
  );
};

export const DepartmentStockPage: React.FC = () => (
  <DepartmentStockRoleGate>
    <DepartmentStockContent />
  </DepartmentStockRoleGate>
);

export default DepartmentStockPage;
