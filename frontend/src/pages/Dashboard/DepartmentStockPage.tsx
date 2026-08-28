import React, { useEffect, useState } from 'react';
import { Card, Spinner } from '@ury/ui';
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
    } catch (err) {
      onError('Unable to capture wastage for this issue authorization.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-end">
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Wasted Qty
        <input
          aria-label="Wasted quantity"
          type="number"
          min="0"
          step="any"
          value={wastedQty}
          onChange={(event) => setWastedQty(event.target.value)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          required
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Reason
        <select
          aria-label="Reason category"
          value={reasonCategory}
          onChange={(event) => setReasonCategory(event.target.value as WastageReasonCategory)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        >
          {WASTAGE_REASON_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs font-medium text-gray-600">
        Notes (optional)
        <input
          aria-label="Reason notes"
          type="text"
          value={reasonNotes}
          onChange={(event) => setReasonNotes(event.target.value)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Submit Wastage
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
        >
          Cancel
        </button>
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
      } catch (err) {
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
    } catch (err) {
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
        <select
          aria-label="Required component"
          value={componentItem}
          onChange={(event) => handleComponentChange(event.target.value)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          disabled={componentOptions.length === 0}
          required
        >
          <option value="">Select component</option>
          {componentOptions.map((option) => (
            <option key={option.component_item} value={option.component_item}>
              {option.component_item_name || option.component_item}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Requested Qty
        <input
          aria-label="Requested quantity"
          type="number"
          min="0"
          step="any"
          value={requestedQty}
          onChange={(event) => setRequestedQty(event.target.value)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
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
        <button
          type="submit"
          disabled={submitting || !planName || !componentItem}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Request Authorization
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
        >
          Cancel
        </button>
      </div>
      {planError && <p className="w-full text-xs font-normal text-red-600">{planError}</p>}
    </form>
  );
};

const DepartmentStockContent: React.FC = () => {
  const { activeBranchId, branches } = useBranchContext();
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
  const [captureFor, setCaptureFor] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);

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
      } catch (err) {
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
    setCaptureFor(null);
    setShowRequestForm(false);
    setRefreshToken((token) => token + 1);
  };

  const handleApprove = async (wastageName: string) => {
    setActionError(null);
    try {
      await departmentStockService.approveWastage(wastageName);
      refresh();
    } catch (err) {
      setActionError('Unable to approve this wastage record.');
    }
  };

  const handleReject = async (wastageName: string) => {
    setActionError(null);
    try {
      await departmentStockService.rejectWastage(wastageName);
      refresh();
    } catch (err) {
      setActionError('Unable to reject this wastage record.');
    }
  };

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
          {actionError && (
            <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</Card>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-gray-700">Issue Authorizations</h2>
              {canCapture && !showRequestForm && (
                <button
                  type="button"
                  onClick={() => setShowRequestForm(true)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Request Authorization
                </button>
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

            {authorizations.length === 0 ? (
              <Card className="mt-2 p-8 text-center text-sm text-gray-500">
                No issue authorizations found for this department and date range.
              </Card>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Component</th>
                        <th className="px-4 py-3 text-right">Authorized Qty</th>
                        <th className="px-4 py-3 text-right" title="Authorized quantity still available to draw against this plan">Remaining Entitlement</th>
                        <th className="px-4 py-3">Status</th>
                        {canCapture && <th className="px-4 py-3">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {authorizations.map((row) => (
                        <React.Fragment key={row.name}>
                          <tr>
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
                            {canCapture && (
                              <td className="px-4 py-3">
                                {row.status === 'Authorized' && captureFor !== row.name && (
                                  <button
                                    type="button"
                                    onClick={() => setCaptureFor(row.name)}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                                  >
                                    Capture Wastage
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                          {captureFor === row.name && (
                            <tr>
                              <td colSpan={canCapture ? 6 : 5} className="px-4 pb-3">
                                <CaptureWastageForm
                                  authorization={row}
                                  onCancel={() => setCaptureFor(null)}
                                  onSuccess={refresh}
                                  onError={setActionError}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-700">Wastage</h2>
            {wastageRows.length === 0 ? (
              <Card className="p-8 text-center text-sm text-gray-500">
                No wastage records found for this department and date range.
              </Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Component</th>
                        <th className="px-4 py-3 text-right">Wasted Qty</th>
                        <th className="px-4 py-3">Status</th>
                        {canApprove && <th className="px-4 py-3">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {wastageRows.map((row) => (
                        <tr key={row.name}>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.component_item}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatQty(row.wasted_qty)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                row.status === 'Authorized'
                                  ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
                                  : row.status === 'Rejected'
                                    ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'
                                    : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700'
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                          {canApprove && (
                            <td className="px-4 py-3">
                              {row.status === 'Draft' && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(row.name)}
                                    className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(row.name)}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-700">
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
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
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
