import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, History, Lock, Save, Search, Send, X } from 'lucide-react';
import { Button, Card, Input, Spinner } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { useAuth } from '../../store/useAuth';
import {
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  ComparableHistoryItem,
  ComparableHistoryResponse,
  getSalesPlanDraftQuantities,
  salesPlanService,
  SalesPlanItem,
  saveSalesPlanDraftQuantities,
} from '../../services/salesPlan';

type PlanStatus =
  | 'Draft'
  | 'Proposed'
  | 'Submitted for Approval'
  | 'Approved'
  | 'Locked for Production'
  | 'Superseded/Cancelled';

const LIFECYCLE_STEPS: { key: string; label: string; matches: PlanStatus[] }[] = [
  { key: 'draft', label: 'Draft', matches: ['Draft'] },
  { key: 'review', label: 'Review', matches: ['Proposed', 'Submitted for Approval'] },
  { key: 'approval', label: 'Approval', matches: ['Approved'] },
  { key: 'production', label: 'Ready for Production', matches: ['Locked for Production'] },
];

// Each entry describes the single next-action button shown for a given
// status: what it says, which status it transitions to, and whether the
// action is restricted to manager/approval-capable users. This intentionally
// surfaces only one obvious next step at a time rather than every possible
// transition, per product direction.
const NEXT_ACTION: Partial<Record<PlanStatus, { label: string; targetState: PlanStatus; icon: React.ElementType; managerOnly?: boolean }>> = {
  Draft: { label: 'Submit for Review', targetState: 'Proposed', icon: Send },
  Proposed: { label: 'Submit for Approval', targetState: 'Submitted for Approval', icon: Send },
  'Submitted for Approval': { label: 'Approve', targetState: 'Approved', icon: CheckCircle2, managerOnly: true },
  Approved: { label: 'Lock for Production', targetState: 'Locked for Production', icon: Lock },
};

const getToday = () => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

const formatQty = (value: number) => {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const getVariance = (item: SalesPlanItem) => item.planned_qty - item.average_qty;

interface HistoryModalProps {
  item: ComparableHistoryItem | null;
  onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ item, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (item) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close history" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div>
            <h2 id="history-modal-title" className="text-lg font-semibold text-gray-900">{item.item_name || item.item_code}</h2>
            <p className="mt-1 text-sm text-gray-500">Comparable weekday sales history</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close history details">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Average</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{formatQty(item.average_qty)} {item.stock_uom}</p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Sample Days</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{item.sample_days}</p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Production Unit</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{item.production_unit || 'Unassigned'}</p>
            </div>
          </div>

          {item.history.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              No prior comparable weekday sales found for this item.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Net Qty</th>
                    <th className="px-4 py-3 text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {item.history.map((day) => (
                    <tr key={day.date}>
                      <td className="px-4 py-3 font-medium text-gray-900">{day.label || day.date}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatQty(day.qty)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{day.invoices ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface LifecycleStepperProps {
  status: PlanStatus | null;
}

const LifecycleStepper: React.FC<LifecycleStepperProps> = ({ status }) => {
  const activeIndex = status ? LIFECYCLE_STEPS.findIndex((step) => step.matches.includes(status)) : -1;
  const isTerminalOther = status === 'Superseded/Cancelled';

  return (
    <div className="flex items-center gap-2" aria-label="Sales Plan status">
      {LIFECYCLE_STEPS.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = activeIndex >= 0 && index < activeIndex;
        return (
          <React.Fragment key={step.key}>
            {index > 0 && (
              <div className={`h-px w-6 shrink-0 ${isComplete || isActive ? 'bg-primary' : 'bg-gray-200'}`} />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : isComplete
                    ? 'border-gray-200 bg-gray-50 text-gray-500'
                    : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              {step.label}
            </div>
          </React.Fragment>
        );
      })}
      {isTerminalOther && (
        <span className="ml-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
          Superseded/Cancelled
        </span>
      )}
    </div>
  );
};

export const SalesPlanPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const { isManager } = useAuth();
  const [planDate, setPlanDate] = useState(getToday);
  const [items, setItems] = useState<SalesPlanItem[]>([]);
  const [historyScope, setHistoryScope] = useState<Pick<ComparableHistoryResponse, 'branch' | 'company' | 'plan_date'> | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ComparableHistoryItem | null>(null);

  const draftKey = useMemo(() => {
    if (!historyScope) return null;

    return buildSalesPlanDraftKey({
      branch: historyScope.branch,
      company: historyScope.company,
      plan_date: historyScope.plan_date,
    });
  }, [historyScope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTransitionError(null);
    setHistoryScope(null);
    setPlanName(null);
    setPlanStatus(null);

    if (!activeBranchId || activeBranchId === 'all') {
      // Sales Plan is inherently branch-scoped -- there is no meaningful
      // "all branches" plan. Fail closed with a clear, actionable message
      // instead of calling the API and surfacing its generic error.
      setItems([]);
      setError('Select a specific branch above to view or edit its Sales Plan.');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const history = await salesPlanService.getComparableHistory({
          branch: activeBranchId,
          plan_date: planDate,
        });
        if (cancelled) return;

        const nextHistoryScope = {
          branch: history.branch,
          company: history.company,
          plan_date: history.plan_date,
        };
        setHistoryScope(nextHistoryScope);

        const savedQuantities = getSalesPlanDraftQuantities(buildSalesPlanDraftKey(nextHistoryScope));
        const draft = buildSalesPlanDraft(history, savedQuantities);
        setItems(draft.items);

        if (nextHistoryScope.branch) {
          try {
            const status = await salesPlanService.getPlanStatus({
              branch: nextHistoryScope.branch,
              plan_date: nextHistoryScope.plan_date,
            });
            if (!cancelled) {
              setPlanName(status.name);
              setPlanStatus((status.status as PlanStatus) || null);
            }
          } catch {
            // Non-fatal: the plan may not have been saved yet, so there is
            // no status to show. The stepper simply defaults to Draft.
          }
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError('Unable to load comparable history for this plan.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, planDate]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => {
      return [item.item_code, item.item_name, item.department, item.production_unit]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [items, query]);

  const groupedItems = useMemo(() => {
    return filteredItems.reduce<Record<string, SalesPlanItem[]>>((acc, item) => {
      const department = item.department || 'Ungrouped';
      if (!acc[department]) acc[department] = [];
      acc[department].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const totalPlannedQty = items.reduce((total, item) => total + item.planned_qty, 0);
  const totalHistoryQty = items.reduce((total, item) => total + item.average_qty, 0);

  const updatePlannedQty = (itemCode: string, qty: number) => {
    setItems((currentItems) => currentItems.map((item) => (
      item.item_code === itemCode ? { ...item, planned_qty: Math.max(0, qty) } : item
    )));
  };

  const saveDraft = async () => {
    setSaving(true);
    // Immediate/offline fallback -- gives instant UI feedback even if the
    // HTTP save below fails or is slow.
    saveSalesPlanDraftQuantities(draftKey, items);

    if (!historyScope?.branch || !historyScope?.plan_date) {
      setSaving(false);
      return;
    }

    try {
      const result = await salesPlanService.saveDraft({
        plan_date: historyScope.plan_date,
        branch: historyScope.branch,
        company: historyScope.company,
        items: items.map((item) => ({ item_code: item.item_code, qty: item.planned_qty })),
      });
      setPlanName(result.name);
      setPlanStatus((result.status as PlanStatus) || 'Draft');
    } catch (err) {
      setError('Unable to save this Sales Plan draft.');
    } finally {
      setSaving(false);
    }
  };

  const currentAction = planStatus ? NEXT_ACTION[planStatus] : undefined;
  // Draft plans that have never been saved to the backend don't have a name
  // yet, so there is nothing to transition -- the manager must save first.
  const canTransition = Boolean(currentAction && planName);
  const actionBlockedByRole = Boolean(currentAction?.managerOnly && !isManager);

  const runTransition = async () => {
    if (!planName || !currentAction) return;
    setTransitionError(null);
    setTransitioning(true);
    try {
      const result = await salesPlanService.transitionPlan({
        name: planName,
        target_state: currentAction.targetState,
      });
      setPlanStatus((result.status as PlanStatus) || currentAction.targetState);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setTransitionError(
        message && /permitted|permission/i.test(message)
          ? "You don't have permission to make this change to the Sales Plan."
          : 'Unable to update this Sales Plan. Please try again.'
      );
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-gray-200 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sales Plan</h1>
            <p className="mt-1 text-sm text-gray-500">
              We've suggested quantities based on similar days. Adjust anything you expect to be different, then submit the plan for approval.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                aria-label="Plan date"
                type="date"
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
                className="pl-9"
              />
            </label>
            <Button onClick={saveDraft} disabled={loading || saving || !draftKey} variant="secondary" className="gap-2">
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </Button>
            {currentAction && (
              <Button
                onClick={runTransition}
                disabled={!canTransition || transitioning || actionBlockedByRole}
                title={actionBlockedByRole ? 'Only managers can approve a Sales Plan.' : undefined}
                className="gap-2"
              >
                <currentAction.icon className="h-4 w-4" />
                <span>{transitioning ? 'Updating...' : currentAction.label}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <LifecycleStepper status={planStatus} />
          {actionBlockedByRole && (
            <p className="text-xs text-gray-500">Only managers can approve this plan.</p>
          )}
        </div>

        {transitionError && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{transitionError}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-gray-500">Planned Qty</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{formatQty(totalPlannedQty)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-gray-500">History Avg</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{formatQty(totalHistoryQty)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-gray-500">Items</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{items.length}</p>
        </Card>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search item, department, or production unit"
          className="h-8 flex-1 border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>
      ) : filteredItems.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-500">No comparable history items found for this plan date.</Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedItems).map(([department, departmentItems]) => (
            <div key={department} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                <h2 className="text-sm font-semibold tracking-wide text-gray-700">{department}</h2>
                <span className="text-xs font-medium text-gray-500">
                  {formatQty(departmentItems.reduce((total, item) => total + item.planned_qty, 0))} planned
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-gray-100 bg-white text-xs font-semibold text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Item</th>
                      <th className="px-5 py-3">History Insight</th>
                      <th className="px-5 py-3">Production Unit</th>
                      <th className="px-5 py-3 text-right">Plan</th>
                      <th className="px-5 py-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {departmentItems.map((item) => {
                      const variance = getVariance(item);
                      return (
                        <tr key={item.item_code} className="hover:bg-gray-50">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-gray-900">{item.item_name || item.item_code}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{item.item_code}</p>
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryItem(item)}
                              className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-left text-primary hover:bg-blue-50"
                            >
                              <History className="h-4 w-4" />
                              <span>
                                Last {item.sample_days} comparable days avg {formatQty(item.average_qty)} {item.stock_uom}
                              </span>
                            </button>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{item.production_unit || 'Unassigned'}</td>
                          <td className="px-5 py-4">
                            <Input
                              aria-label={`Plan quantity for ${item.item_name || item.item_code}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.planned_qty}
                              onChange={(event) => updatePlannedQty(item.item_code, Number(event.target.value))}
                              className="ml-auto w-28 text-right"
                            />
                          </td>
                          <td className={`px-5 py-4 text-right font-semibold ${variance < 0 ? 'text-orange-600' : 'text-green-700'}`}>
                            {variance > 0 ? '+' : ''}{formatQty(variance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <HistoryModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />
    </div>
  );
};

export default SalesPlanPage;
