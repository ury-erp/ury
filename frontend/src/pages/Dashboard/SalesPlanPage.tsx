import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CheckCircle2, Factory, History, ListFilter, Lock, Play, Plus, RotateCcw, Save, Search, Send, X } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AttentionItem, Badge, Button, Card, ConfirmDialog, DataTable, DatePicker, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EditableDataTable, Input, KpiStrip, Page, PageHeader, Section, Select, Spinner, Textarea, messageToPlainText, showToast, type DataTableColumn } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { useAuth } from '../../store/useAuth';
import { ItemDetailModal } from '../../components/sales-plan/ItemDetailModal';
import {
  addManualItemToDraft,
  BranchItemSearchResult,
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  ComparableHistoryItem,
  ComparableHistoryResponse,
  getSalesPlanDraftQuantities,
  mergeSavedPlanRows,
  salesPlanService,
  type SalesPlanDocRow,
  type DepartmentProductionPlanState,
  type SalesPlanProductionStatesResponse,
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

/**
 * Pull the real, actionable reason out of a failed Sales Plan API call
 * (transition_plan(), save_draft(), or any other ury_sales_plan.py
 * endpoint).
 *
 * `call` (@ury/core, backed by frappe-js-sdk) does NOT throw a real `Error`
 * on an API failure -- it throws the plain object `getFrappeError()` builds,
 * which spreads the raw Frappe error response (`exc_type`, `exception`,
 * `_server_messages`, etc.) onto a `message` field that is only ever the
 * SDK's own generic fallback string ("There was an error."), never the
 * backend's actual frappe.throw() text. Both call sites that used to catch
 * these errors checked `err instanceof Error` (or ignored `err` entirely),
 * which is always false for this shape -- so every failure, validation AND
 * permission errors alike, landed on the same hardcoded generic string,
 * discarding messages like "BOM is required for manufactured Item X" or
 * "Sales Plan X is already Y and can no longer be saved as a draft" that are
 * genuinely actionable for whoever hit them. `_server_messages` (a
 * JSON-encoded array of JSON-encoded {message, title, indicator} objects --
 * see frappe/frappe/__init__.py's msgprint) is where frappe.throw()'s actual
 * text lives; other pages in this app (e.g. Pos/lib/aggregator-api.ts)
 * already parse it the same way.
 */
export function describeSalesPlanApiError(err: unknown, fallback: string): string {
  const anyErr = err as { exc_type?: string; _server_messages?: string } | null | undefined;

  if (anyErr?.exc_type === 'frappe.exceptions.PermissionError') {
    return "You don't have permission to make this change to the Sales Plan.";
  }

  if (anyErr?._server_messages) {
    try {
      const messages = JSON.parse(anyErr._server_messages) as string[];
      const first = JSON.parse(messages[0]) as { message?: string };
      if (first?.message) {
        // Frappe wraps field/doctype names in <strong>; strip to plain text
        // for toast and any remaining inline setState paths.
        return messageToPlainText(first.message);
      }
    } catch {
      // Malformed/unexpected shape -- fall through to the generic message
      // below rather than surfacing a raw JSON parse error to the user.
    }
  }

  return fallback;
}

// D12 -- label/badge lookups for the two independent Production Plan state
// axes rendered per department. Kept as flat maps (rather than a switch) so
// a badge is one lookup, and so link_state and execution_state can never
// accidentally be rendered from the same map.
const LINK_STATE_LABEL: Record<DepartmentProductionPlanState['link_state'], string> = {
  none: 'No Production Plan',
  live: 'Production Plan',
  stale: 'Stale (Sales Plan changed)',
  ineligible: 'Not eligible yet',
};

const LINK_STATE_BADGE: Record<DepartmentProductionPlanState['link_state'], 'default' | 'tagAccent' | 'tagWarning'> = {
  none: 'default',
  live: 'tagAccent',
  stale: 'tagWarning',
  ineligible: 'default',
};

type ExecutionState = NonNullable<DepartmentProductionPlanState['execution_state']>;

const EXECUTION_STATE_LABEL: Record<ExecutionState, string> = {
  awaiting_materials: 'Awaiting Materials',
  ready: 'Ready for Production',
  processing: 'Processing',
  completed: 'Production Completed',
  failed: 'Production Failed',
};

const EXECUTION_STATE_BADGE: Record<ExecutionState, 'tagWarning' | 'tagAccent' | 'tagSuccess' | 'tagDestructive'> = {
  awaiting_materials: 'tagWarning',
  ready: 'tagAccent',
  processing: 'tagAccent',
  completed: 'tagSuccess',
  failed: 'tagDestructive',
};

/** ERPNext Production Plan.status → badge tone for the primary manufacturing signal. */
const ERPNEXT_STATUS_BADGE: Record<string, 'default' | 'tagAccent' | 'tagWarning' | 'tagSuccess' | 'tagDestructive'> = {
  Draft: 'default',
  Submitted: 'tagAccent',
  'Not Started': 'tagAccent',
  'Material Requested': 'tagWarning',
  'In Process': 'tagAccent',
  Completed: 'tagSuccess',
  Closed: 'default',
  Cancelled: 'tagDestructive',
};

const PREPARE_POLL_INTERVAL_MS = 4000;
const CAN_PREPARE_EXECUTION: ExecutionState[] = ['awaiting_materials', 'ready', 'failed'];

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

// Backward actions that require a reason (Return to Draft, Supersede/Cancel).
// These require the URY Sales Plan Controller role and a non-empty reason string.
const BACKWARD_ACTIONS: Partial<Record<PlanStatus, { label: string; targetState: PlanStatus; icon: React.ElementType; destructive?: boolean }>> = {
  Proposed: { label: 'Return to Draft', targetState: 'Draft', icon: RotateCcw },
  'Submitted for Approval': { label: 'Return to Draft', targetState: 'Draft', icon: RotateCcw },
  // Display label is just "Cancel" -- "Supersede/Cancel" is the backend
  // Workflow's internal action name (ury/fixtures/workflow.json), not
  // something a user needs to see; targetState is what actually drives the
  // API call, independent of this label.
  Approved: { label: 'Cancel', targetState: 'Superseded/Cancelled', icon: X, destructive: true },
  'Locked for Production': { label: 'Cancel', targetState: 'Superseded/Cancelled', icon: X, destructive: true },
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

const cssSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

// Row-count threshold beyond which a department's table is truncated to a
// "Show all" toggle instead of rendering every row up front.
const ROW_TRUNCATE_LIMIT = 10;

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
      <div className="relative z-[101] w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted px-6 py-4">
          <div>
            <h2 id="history-modal-title" className="text-lg font-semibold text-foreground">{item.item_name || item.item_code}</h2>
            <p className="mt-1 text-sm text-text-tertiary">Comparable weekday sales history</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close history details">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-text-tertiary">Average</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatQty(item.average_qty)} {item.stock_uom}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-text-tertiary">Sample Days</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{item.sample_days}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-text-tertiary">Production Unit</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{item.production_unit || 'Unassigned'}</p>
            </div>
          </div>

          {item.history.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-text-tertiary">
              No prior comparable weekday sales found for this item.
            </div>
          ) : (
            (() => {
              const historyColumns: DataTableColumn<typeof item.history[0]>[] = [
                { key: 'date', header: 'Date', render: (row) => row.label || row.date },
                { key: 'qty', header: 'Net Qty', align: 'right', render: (row) => formatQty(row.qty) },
                { key: 'invoices', header: 'Invoices', align: 'right', render: (row) => row.invoices ?? '-' },
              ];
              return <DataTable columns={historyColumns} rows={item.history} emptyMessage="No history found." />;
            })()
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

  // Text summary shown under the pill row, kept in sync with the same
  // NEXT_ACTION map that drives the actual action button elsewhere in this
  // file, so the copy never drifts from what the button actually does.
  let summary: string | null = null;
  if (status) {
    const currentLabel = isTerminalOther ? status : LIFECYCLE_STEPS[activeIndex]?.label ?? status;
    const nextAction = NEXT_ACTION[status];
    let nextPart: string;
    if (nextAction) {
      nextPart = ` · Next: ${nextAction.label}${nextAction.managerOnly ? ' (manager)' : ''}`;
    } else if (status === 'Locked for Production') {
      nextPart = ' · This plan is locked for production.';
    } else if (isTerminalOther) {
      nextPart = ' · This plan has been superseded or cancelled.';
    } else {
      nextPart = '';
    }
    summary = `Currently: ${currentLabel}${nextPart}`;
  }

  const manyStepsCount = LIFECYCLE_STEPS.length > 5;

  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-y-2">
      {isTerminalOther ? (
        <div className="flex items-center gap-2" role="list" aria-label="Sales Plan status">
          <div role="listitem" className="flex items-center gap-2" title="Superseded/Cancelled">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
              <X className="h-3.5 w-3.5" />
            </span>
            <span className="text-[13px] font-semibold text-destructive">Superseded/Cancelled</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center" role="list" aria-label="Sales Plan status">
          {LIFECYCLE_STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isComplete = activeIndex >= 0 && index < activeIndex;
            const isUpcoming = !isActive && !isComplete;
            return (
              <React.Fragment key={step.key}>
                {index > 0 && (
                  <div
                    role="presentation"
                    className={`mx-1 h-0.5 min-w-[16px] max-w-[56px] flex-1 ${index <= activeIndex ? 'bg-primary' : 'bg-border'}`}
                  />
                )}
                <div
                  role="listitem"
                  className="flex flex-none items-center gap-1.5"
                  title={step.label}
                >
                  <span
                    aria-current={isActive ? 'step' : undefined}
                    className={
                      isComplete
                        ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white'
                        : isActive
                          ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card text-primary'
                          : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-text-tertiary'
                    }
                  >
                    {isComplete ? <Check className="h-3.5 w-3.5" /> : <span className="text-[11px] font-semibold">{index + 1}</span>}
                  </span>
                  <span
                    className={
                      manyStepsCount && !isActive
                        ? `hidden text-[13px] sm:inline ${isComplete ? 'text-text-secondary' : 'text-text-tertiary'}`
                        : isActive
                          ? 'text-[13px] font-semibold text-foreground'
                          : isComplete
                            ? 'text-[13px] text-text-secondary'
                            : 'text-[13px] text-text-tertiary'
                    }
                  >
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {summary && (
        <p className="text-xs text-text-tertiary" aria-live="polite">
          {summary}
        </p>
      )}
    </div>
  );
};

export const SalesPlanPage: React.FC = () => {
  const { activeBranchId, activeBranch } = useBranchContext();
  const { isManager, roles } = useAuth();
  const [planDate, setPlanDate] = useState(getToday);
  // Tracks the "site today" used for the relative date label. Recomputed on
  // tab focus/visibility so a tab left open overnight doesn't keep showing a
  // stale "Today" -- kept in sync with `getToday()`'s own timezone-adjustment
  // logic since that's the only notion of "today" this codebase has.
  const [todayString, setTodayString] = useState(getToday);
  const [items, setItems] = useState<SalesPlanItem[]>([]);
  const [historyScope, setHistoryScope] = useState<Pick<ComparableHistoryResponse, 'branch' | 'company' | 'plan_date'> | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  // Per-department Production Plan states (D12): the whole
  // get_sales_plan_production_states response, plus which single
  // department's "Open" action is currently in flight (createAll is a
  // separate, page-level busy flag since it isn't scoped to one department).
  const [ppStates, setPpStates] = useState<SalesPlanProductionStatesResponse | null>(null);
  const [ppCreateBusy, setPpCreateBusy] = useState(false);
  const [ppOpenBusyDepartment, setPpOpenBusyDepartment] = useState<string | null>(null);
  const [ppPrepareBusyDepartment, setPpPrepareBusyDepartment] = useState<string | null>(null);
  // Prepare Production confirmation — ConfirmDialog instead of window.confirm.
  const [prepareConfirmDepartment, setPrepareConfirmDepartment] = useState<string | null>(null);
  // Name of a prior Superseded/Cancelled plan for the current branch+date,
  // when that's why planStatus/planName are null and a fresh Draft is
  // starting instead -- see get_plan_status()'s docstring for why a
  // cancelled plan is deliberately excluded from being "the" active plan.
  const [supersededPlanName, setSupersededPlanName] = useState<string | null>(null);
  const [enforcementMode, setEnforcementMode] = useState<'Hard' | 'Soft' | 'Alert'>('Hard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [backwardActionOpen, setBackwardActionOpen] = useState(false);
  const [backwardActionReason, setBackwardActionReason] = useState('');
  const [backwardActionError, setBackwardActionError] = useState<string | null>(null);
  const [backwardActionTransitioning, setBackwardActionTransitioning] = useState(false);
  const [currentBackwardAction, setCurrentBackwardAction] = useState<{ label: string; targetState: PlanStatus; destructive?: boolean } | null>(null);
  const [csvImportWarning, setCsvImportWarning] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ComparableHistoryItem | null>(null);
  const [selectedItemDetailCode, setSelectedItemDetailCode] = useState<string | null>(null);
  const [highlightedItemCode, setHighlightedItemCode] = useState<string | null>(null);

  // Catalog search to add an item to the plan regardless of comparable history.
  const [addItemQuery, setAddItemQuery] = useState('');
  const [addItemResults, setAddItemResults] = useState<BranchItemSearchResult[]>([]);
  const [addItemLoading, setAddItemLoading] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const addItemPopoverRef = useRef<HTMLDivElement | null>(null);
  const addItemButtonRef = useRef<HTMLButtonElement | null>(null);
  const addItemInputRef = useRef<HTMLInputElement | null>(null);

  // "Needs Attention" accordion — collapsed by default.
  const [attentionExpanded, setAttentionExpanded] = useState(false);

  // Per-department inline filter + collapse state, keyed by department name.
  const [departmentFilters, setDepartmentFilters] = useState<Record<string, string>>({});
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({});
  const departmentToggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Row-count truncation state, independent of the whole-group collapse
  // above: a department can be expanded (visible) yet still truncated to the
  // first ROW_TRUNCATE_LIMIT rows.
  const [truncationExpanded, setTruncationExpanded] = useState<Record<string, boolean>>({});
  const departmentGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const departmentContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // aria-label of the input to focus once a department's truncation state
  // has just expanded in response to onBoundaryReached('down') below.
  const pendingFocusAriaLabelRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const refreshToday = () => setTodayString(getToday());
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  }, []);

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
    setSupersededPlanName(null);

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
              setEnforcementMode((status.enforcement_mode as 'Hard' | 'Soft' | 'Alert') || 'Hard');
              setSupersededPlanName(status.superseded_plan || null);
            }

            // Once a plan exists, the plan -- not comparable history -- is
            // what says which items are being produced and how many. History
            // only ever supplied the suggestion. A plan can legitimately hold
            // rows history knows nothing about, and a branch with an empty
            // history window returns no suggestions at all while its plan is
            // full; in both cases the grid would otherwise render empty, and
            // with it every department section and Production Plan panel keyed
            // off the item list.
            if (status.name && !cancelled) {
              try {
                const planDoc = await salesPlanService.getPlan(status.name);
                const planRows = (planDoc?.items as SalesPlanDocRow[] | undefined) || [];
                if (!cancelled && planRows.length) {
                  setItems((current) => mergeSavedPlanRows(current, planRows));
                }
              } catch (planErr) {
                // Non-fatal: the history-derived view is still usable, and
                // the plan's own status/actions have already been set above.
                console.warn('Unable to load saved Sales Plan rows', planErr);
              }
            }
          } catch (statusErr) {
            // A missing/unsaved plan is expected and non-fatal (the stepper
            // simply defaults to Draft). A permission error is not, and must
            // not be swallowed silently -- otherwise a user who lacks read
            // access to URY Sales Plan sees no status and no Approve/Review
            // action ever renders, with no indication why.
            const message = statusErr instanceof Error ? statusErr.message : String(statusErr);
            if (!cancelled && /permission|not permitted|forbidden/i.test(message)) {
              setTransitionError('You do not have permission to view this plan\'s approval status.');
            }
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

  // Real, backend-derived blockers: an item with no production unit assigned
  // can't be routed for prep, and an item with zero comparable sample days
  // has no history to base the suggested quantity on -- both come straight
  // off the comparable-history response, nothing fabricated here.
  const blockedItems = useMemo(() => {
    const blocked = items.filter((item) => item.production_unit === 'Unassigned' || item.sample_days === 0);
    // Blocking-severity items (missing production unit) surface before
    // warning-severity ones (no comparable history) so the most actionable
    // gaps show up first when the accordion opens.
    return [...blocked].sort((a, b) => {
      const aBlocking = a.production_unit === 'Unassigned' ? 0 : 1;
      const bBlocking = b.production_unit === 'Unassigned' ? 0 : 1;
      return aBlocking - bBlocking;
    });
  }, [items]);

  // Debounced catalog search -- searches ANY item for this branch, regardless
  // of whether it has comparable history, so zero-history items can be added.
  useEffect(() => {
    if (!addItemOpen || !historyScope?.branch) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAddItemLoading(true);
      try {
        const results = await salesPlanService.searchBranchItems({
          branch: historyScope.branch!,
          company: historyScope.company,
          query: addItemQuery,
        });
        if (!cancelled) setAddItemResults(results);
      } catch (err) {
        if (!cancelled) setAddItemResults([]);
      } finally {
        if (!cancelled) setAddItemLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addItemQuery, addItemOpen, historyScope?.branch, historyScope?.company]);

  const closeAddItem = () => {
    setAddItemOpen(false);
    addItemButtonRef.current?.focus();
  };

  const handleAddManualItem = (result: BranchItemSearchResult) => {
    setItems((currentItems) => addManualItemToDraft(currentItems, result));
    setAddItemQuery('');
    setAddItemResults([]);
    closeAddItem();
  };

  // Close the "Add item" popover on outside click or Escape -- closing is
  // implicit via these two triggers plus selecting a result, so there is no
  // explicit "Close" control inside the popover itself.
  useEffect(() => {
    if (!addItemOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (addItemPopoverRef.current && !addItemPopoverRef.current.contains(event.target as Node)) {
        setAddItemOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAddItem();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addItemOpen]);

  useEffect(() => {
    if (addItemOpen) addItemInputRef.current?.focus();
  }, [addItemOpen]);

  const toggleDepartmentCollapsed = (department: string) => {
    setCollapsedDepartments((current) => {
      const next = { ...current, [department]: !current[department] };
      // If the group is about to collapse while a cell inside it holds
      // focus, move focus to the department's own toggle button rather than
      // leaving it stranded on a now-hidden element.
      if (next[department]) {
        const toggleEl = departmentToggleRefs.current[department];
        if (toggleEl && toggleEl.contains(document.activeElement) === false) {
          const active = document.activeElement;
          const container = document.getElementById(`department-panel-${cssSafeId(department)}`);
          if (container && active && container.contains(active)) {
            toggleEl.focus();
          }
        }
      }
      return next;
    });
  };

  const focusItemRow = (itemCode: string) => {
    // Resolve to the row's stable `_rowKey` (not item_code, which two rows can
    // share) for both the visual highlight and locating the DOM node to
    // scroll to -- `rowRefs` isn't populated by EditableDataTable, so we
    // locate the rendered qty input by its aria-label instead.
    const match = items.find((item) => item.item_code === itemCode);
    if (!match) return;
    setHighlightedItemCode(match._rowKey);
    const input = document.querySelector<HTMLElement>(
      `[aria-label="Plan quantity for ${(match.item_name || match.item_code).replace(/"/g, '\\"')}"]`
    );
    input?.closest('tr')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      setHighlightedItemCode((current) => (current === match._rowKey ? null : current));
    }, 2000);
  };

  const updatePlannedQty = (rowKey: string, qty: number) => {
    setItems((currentItems) => currentItems.map((item) => (
      item._rowKey === rowKey ? { ...item, planned_qty: Math.max(0, qty) } : item
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
        enforcement_mode: enforcementMode,
      });
      setPlanName(result.name);
      setPlanStatus((result.status as PlanStatus) || 'Draft');
    } catch (err) {
      showToast.error(describeSalesPlanApiError(err, 'Unable to save this Sales Plan draft.'));
    } finally {
      setSaving(false);
    }
  };

  const branchName = activeBranch?.name || activeBranchId;

  const dayDiffFromToday = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(planDate), parseISO(todayString));
    } catch {
      return 0;
    }
  }, [planDate, todayString]);

  const relativeDateLabel = dayDiffFromToday === 0 ? 'Today' : dayDiffFromToday === 1 ? 'Tomorrow' : dayDiffFromToday === -1 ? 'Yesterday' : null;
  const absoluteDateLabel = useMemo(() => {
    try {
      return format(parseISO(planDate), 'EEE, d MMM yyyy');
    } catch {
      return planDate;
    }
  }, [planDate]);
  const dateHeading = relativeDateLabel ? `${relativeDateLabel} · ${absoluteDateLabel}` : absoluteDateLabel;
  const isPastPlanDate = dayDiffFromToday < 0;

  const blockedItemCodes = useMemo(() => new Set(blockedItems.map((item) => item.item_code)), [blockedItems]);

  const jumpToDepartment = (department: string) => {
    setCollapsedDepartments((current) => (current[department] ? { ...current, [department]: false } : current));
    requestAnimationFrame(() => {
      departmentGroupRefs.current[department]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // When a department's table is truncated to ROW_TRUNCATE_LIMIT rows,
  // EditableDataTable's keyboard nav is scoped to exactly the (truncated)
  // `rows` it was given, so ArrowDown on the last rendered row calls
  // `onBoundaryReached('down')` instead of moving focus. When that happens
  // while truncated, expand the department and focus the next row (by its
  // stable aria-label) once it renders.
  const handleBoundaryReached = (
    department: string,
    isTruncated: boolean,
    nextRowAriaLabel: string | undefined
  ) => (direction: 'up' | 'down') => {
    if (direction !== 'down' || !isTruncated || !nextRowAriaLabel) return;
    pendingFocusAriaLabelRef.current[department] = nextRowAriaLabel;
    setTruncationExpanded((current) => ({ ...current, [department]: true }));
  };

  useEffect(() => {
    Object.entries(pendingFocusAriaLabelRef.current).forEach(([department, ariaLabel]) => {
      if (!truncationExpanded[department]) return;
      const container = departmentContainerRefs.current[department];
      if (!container) return;
      const input = container.querySelector<HTMLInputElement>(`[aria-label="${CSS.escape(ariaLabel)}"]`);
      input?.focus();
      delete pendingFocusAriaLabelRef.current[department];
    });
  }, [truncationExpanded]);

  const currentAction = planStatus ? NEXT_ACTION[planStatus] : undefined;
  const currentBackwardActionDef = planStatus ? BACKWARD_ACTIONS[planStatus] : undefined;
  // Mirrors validate_plan_has_demand() in ury/ury/api/ury_sales_plan.py: the
  // server refuses the Draft -> Proposed hop on a plan that states no
  // quantity anywhere, so don't offer a button whose only outcome is that
  // error. Scoped to that one hop for the same reason the backend guard is --
  // a plan zeroed out AFTER it started circulating is a different problem,
  // and silently disabling its Lock button is the wrong way to raise it.
  const blockedAsEmptyPlan = currentAction?.targetState === 'Proposed' && totalPlannedQty <= 0;
  // Draft plans that have never been saved to the backend don't have a name
  // yet, so there is nothing to transition -- the manager must save first.
  const canTransition = Boolean(currentAction && planName) && !blockedAsEmptyPlan;
  const canShowBackwardAction = Boolean(currentBackwardActionDef && planName && roles.includes('URY Sales Plan Controller'));
  const actionBlockedByRole = Boolean(currentAction?.managerOnly && !isManager);
  // Items (and by extension the plan's item list itself) are editable only
  // in Draft -- Save Draft, "Add item", bulk-set, and CSV import all gate on
  // this. `planStatus === null` covers a plan that hasn't been saved yet at
  // all, which is still a fresh Draft in effect.
  const isEditable = planStatus === null || planStatus === 'Draft';

  const refreshProductionPlanStates = async (name: string) => {
    try {
      const states = await salesPlanService.getProductionPlanStates(name);
      setPpStates(states);
    } catch {
      setPpStates(null);
    }
  };

  useEffect(() => {
    if (!planName || (planStatus !== 'Approved' && planStatus !== 'Locked for Production')) {
      setPpStates(null);
      return;
    }
    let cancelled = false;
    salesPlanService
      .getProductionPlanStates(planName)
      .then((states) => { if (!cancelled) setPpStates(states); })
      .catch(() => { if (!cancelled) setPpStates(null); });
    return () => { cancelled = true; };
  }, [planName, planStatus]);

  // Poll while any department Prepare job is Processing so ERPNext status and
  // URY execution_state refresh without leaving the Sales Plan page.
  const anyDepartmentProcessing = useMemo(
    () => (ppStates?.production_plans ?? []).some((row) => row.execution_state === 'processing'),
    [ppStates],
  );

  useEffect(() => {
    if (!planName || !anyDepartmentProcessing) return;
    const timer = window.setInterval(() => {
      refreshProductionPlanStates(planName);
    }, PREPARE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [planName, anyDepartmentProcessing]);

  // D12's known backend limitation: get_sales_plan_production_states only
  // ever lists departments that already have a live Production Plan, so a
  // department present in groupedItems but absent here has no plan at all.
  // Derive that as link_state 'none' (or 'ineligible', from the top-level
  // `eligible` flag) here, rather than duplicating any compiler logic --
  // the backend explicitly hands this derivation to the frontend (see
  // get_sales_plan_production_states's docstring).
  const ppStatesByDepartment = useMemo(() => {
    const map: Record<string, DepartmentProductionPlanState> = {};
    for (const row of ppStates?.production_plans ?? []) {
      map[row.department] = row;
    }
    return map;
  }, [ppStates]);

  const getDepartmentProductionState = (department: string): DepartmentProductionPlanState | null => {
    if (!ppStates) return null;
    const existing = ppStatesByDepartment[department];
    if (existing) return existing;
    return {
      department,
      link_state: ppStates.eligible ? 'none' : 'ineligible',
      can_create: ppStates.eligible && ppStates.can_create,
      can_open: false,
      blockers: [],
    };
  };

  // Departments (from groupedItems) that have no live Production Plan yet --
  // used to decide whether the header-level "Create Production Plans"
  // control has anything to do.
  const departmentsWithoutLivePlan = useMemo(() => {
    if (!ppStates?.eligible) return [];
    return Object.keys(groupedItems).filter((department) => {
      const state = ppStatesByDepartment[department];
      return !state || state.link_state === 'none' || state.link_state === 'stale';
    });
  }, [groupedItems, ppStates, ppStatesByDepartment]);

  const createAllProductionPlans = async () => {
    if (!planName) return;
    setPpCreateBusy(true);
    try {
      await salesPlanService.createDepartmentProductionPlans(planName);
      await refreshProductionPlanStates(planName);
    } catch (err) {
      showToast.error(describeSalesPlanApiError(err, 'Unable to create Production Plans for this Sales Plan.'));
    } finally {
      setPpCreateBusy(false);
    }
  };

  const openDepartmentProductionPlan = async (department: string) => {
    if (!planName) return;
    setPpOpenBusyDepartment(department);
    try {
      const result = await salesPlanService.openDepartmentProductionPlan(planName, department);
      window.location.assign(`/app/production-plan/${encodeURIComponent(result.name)}`);
    } catch (err) {
      showToast.error(describeSalesPlanApiError(err, `Unable to open the Production Plan for ${department}.`));
    } finally {
      setPpOpenBusyDepartment(null);
    }
  };

  const requestPrepareDepartmentProduction = (department: string) => {
    if (!planName) return;
    const state = getDepartmentProductionState(department);
    if (!state?.production_plan || state.docstatus !== 1) return;
    setPrepareConfirmDepartment(department);
  };

  const confirmPrepareDepartmentProduction = async () => {
    if (!planName || !prepareConfirmDepartment) return;
    const department = prepareConfirmDepartment;
    const state = getDepartmentProductionState(department);
    const productionPlan = state?.production_plan;
    if (!productionPlan || state?.docstatus !== 1) {
      setPrepareConfirmDepartment(null);
      return;
    }

    setPpPrepareBusyDepartment(department);
    try {
      const result = await salesPlanService.prepareProduction(productionPlan);
      if (result.status === 'blocked') {
        const messages = (result.blockers ?? [])
          .map((b) => b.message || b.type || 'Blocked')
          .join('\n');
        showToast.error(messages || 'Prepare Production is blocked until materials are available.');
      } else if (result.status === 'already_processing') {
        showToast.error('Prepare Production is already running for this department.');
      } else {
        showToast.success('Prepare Production started.');
      }
      setPrepareConfirmDepartment(null);
      await refreshProductionPlanStates(planName);
    } catch (err) {
      showToast.error(describeSalesPlanApiError(err, `Unable to prepare production for ${department}.`));
    } finally {
      setPpPrepareBusyDepartment(null);
    }
  };

  // Extracted so it can render in BOTH the sticky department-jump bar (the
  // normal case) and the "no comparable history items" empty state -- the
  // zero-history case is exactly what Scope §1 (catalog item-add) exists
  // for, so the control that unblocks it must not disappear right when it's
  // needed most.
  const renderAddItemControl = () => {
    if (!isEditable) return null;
    return (
      <div className="relative" ref={addItemPopoverRef}>
        <Button
          ref={addItemButtonRef}
          type="button"
          variant="secondary"
          size="compactSm"
          className="gap-2"
          onClick={() => setAddItemOpen((current) => !current)}
          aria-expanded={addItemOpen}
        >
          <Plus className="h-4 w-4" />
          <span>Add item</span>
        </Button>
        {addItemOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-[380px] rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
              <input
                ref={addItemInputRef}
                id="add-item-search"
                aria-label="Add item to plan"
                value={addItemQuery}
                onChange={(event) => setAddItemQuery(event.target.value)}
                placeholder="Search the item catalog by name or code"
                className="h-8 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-text-tertiary"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {addItemLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner className="h-4 w-4 text-primary" />
                </div>
              ) : addItemResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-tertiary">No matching items found.</p>
              ) : (
                <ul>
                  {addItemResults.map((result) => (
                    <li key={result.item_code}>
                      <button
                        type="button"
                        onClick={() => handleAddManualItem(result)}
                        className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left text-sm hover:bg-primary-tint"
                      >
                        <span className="font-medium text-foreground">{result.item_name || result.item_code}</span>
                        <span className="text-xs text-text-tertiary">
                          {result.item_code}
                          {result.department ? ` · ${result.department}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

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
      showToast.error(
        describeSalesPlanApiError(err, 'Unable to update this Sales Plan. Please try again.')
      );
    } finally {
      setTransitioning(false);
    }
  };

  const openBackwardActionModal = (action: { label: string; targetState: PlanStatus; destructive?: boolean }) => {
    setCurrentBackwardAction(action);
    setBackwardActionOpen(true);
    setBackwardActionReason('');
    setBackwardActionError(null);
  };

  const closeBackwardActionModal = () => {
    setBackwardActionOpen(false);
    setBackwardActionReason('');
    setBackwardActionError(null);
    setCurrentBackwardAction(null);
  };

  const runBackwardTransition = async () => {
    if (!planName || !currentBackwardAction) {
      // planName can clear out from under an open modal if the branch/date
      // changes while it's open (e.g. via keyboard, bypassing the
      // outside-click dismissal a mouse interaction would have triggered
      // first) -- surface that instead of silently doing nothing.
      setBackwardActionError('This plan is no longer available. Close this dialog and try again.');
      return;
    }
    const reasonTrimmed = backwardActionReason.trim();
    if (!reasonTrimmed) {
      setBackwardActionError('Reason is required for this action.');
      return;
    }
    setBackwardActionError(null);
    setBackwardActionTransitioning(true);
    try {
      const cancelledPlanName = planName;
      const result = await salesPlanService.transitionPlan({
        name: planName,
        target_state: currentBackwardAction.targetState,
        reason: reasonTrimmed,
      });
      const nextStatus = (result.status as PlanStatus) || currentBackwardAction.targetState;
      // Superseded/Cancelled is terminal in the Workflow -- there is no Amend
      // or reopen. Match get_plan_status after a reload: drop the dead plan
      // and open a fresh editable Draft for the same branch+date, keeping the
      // on-screen rows so Save Draft can create the new document from them.
      if (nextStatus === 'Superseded/Cancelled') {
        setPlanName(null);
        setPlanStatus(null);
        setSupersededPlanName(cancelledPlanName);
        setPpStates(null);
      } else {
        setPlanStatus(nextStatus);
      }
      closeBackwardActionModal();
    } catch (err) {
      const fallbackMessage = currentBackwardAction.destructive
        ? `Unable to cancel this Sales Plan. Please try again.`
        : `Unable to return this Sales Plan to Draft. Please try again.`;
      showToast.error(describeSalesPlanApiError(err, fallbackMessage));
    } finally {
      setBackwardActionTransitioning(false);
    }
  };

  // Outside-click/Escape dismissal, focus trap, initial focus, focus
  // restore-on-close, and body scroll lock are all handled by
  // Dialog/DialogContent (@ury/ui) itself -- see its own onOpenChange guard
  // below for why dismissal is refused while a request is in flight.

  return (
    <Page>
      <PageHeader
        bleed
        title={`Sales Plan — ${dateHeading} · ${branchName}`}
        description="We've suggested quantities based on similar days. Adjust anything you expect to be different, then submit the plan for approval."
        actions={
          <>
            <DatePicker
              id="plan-date"
              aria-label="Plan date"
              value={planDate}
              onChange={(_id, next) => setPlanDate(next)}
              className="w-[180px]"
            />
            {isEditable && (
              <Select
                aria-label="Enforcement Mode"
                title="Hard: block order placement once plan_remaining hits 0. Soft: allow the order, over-plan status is computable from committed_qty + fulfilled_qty > qty. Alert: allow the order and notify branch-scoped Production Manager/URY Manager recipients when the plan is exceeded."
                value={enforcementMode}
                onChange={(event) => setEnforcementMode(event.target.value as 'Hard' | 'Soft' | 'Alert')}
                disabled={loading || saving}
                className="w-[130px]"
              >
                <option value="Hard">Hard</option>
                <option value="Soft">Soft</option>
                <option value="Alert">Alert</option>
              </Select>
            )}
            {isEditable && (
              <Button onClick={saveDraft} disabled={loading || saving || !draftKey} variant="chrome" className="gap-2">
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Draft'}</span>
              </Button>
            )}
            {currentAction && (
              <Button
                onClick={runTransition}
                disabled={!canTransition || transitioning || actionBlockedByRole}
                title={
                  actionBlockedByRole
                    ? 'Only managers can approve a Sales Plan.'
                    : blockedAsEmptyPlan
                      ? 'Set a quantity on at least one item before submitting this plan for review.'
                      : undefined
                }
                className="gap-2"
              >
                <currentAction.icon className="h-4 w-4" />
                <span>{transitioning ? 'Updating...' : currentAction.label}</span>
              </Button>
            )}
            {/*
              One Production Plan per department, not per Sales Plan (see
              PLAN.md's "Frontend" section and D14) -- this header control
              creates every department's plan in one call
              (createDepartmentProductionPlans is idempotent per department),
              and each department's own "Open Production Plan" action lives
              in its groupedItems header below. There is no header-level
              "Open" here any more: which plan to open is inherently a
              per-department question once a Sales Plan can own several.
            */}
            {ppStates?.eligible && ppStates.can_create && departmentsWithoutLivePlan.length > 0 && (
              <Button
                onClick={createAllProductionPlans}
                disabled={ppCreateBusy}
                variant="secondary"
                size="compactLg"
                className="gap-2"
              >
                <Factory className="h-4 w-4" />
                <span>
                  {ppCreateBusy
                    ? 'Creating...'
                    : `Create Production Plans (${departmentsWithoutLivePlan.length})`}
                </span>
              </Button>
            )}
            {canShowBackwardAction && currentBackwardActionDef && (
              <Button
                onClick={() => openBackwardActionModal(currentBackwardActionDef)}
                disabled={backwardActionTransitioning}
                variant="secondary"
                className={`gap-2 ${currentBackwardActionDef.destructive ? 'text-destructive' : ''}`}
              >
                <currentBackwardActionDef.icon className="h-4 w-4" />
                <span>{currentBackwardActionDef.label}</span>
              </Button>
            )}
          </>
        }
        footer={
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <LifecycleStepper status={planStatus} />
              {actionBlockedByRole && (
                <p className="text-xs text-text-tertiary">Only managers can approve this plan.</p>
              )}
            </div>

            {transitionError && (
              <p className="mt-3 rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">{transitionError}</p>
            )}
            {!planStatus && supersededPlanName && (
              <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-text-tertiary">
                The previous plan for this branch and date ({supersededPlanName}) was cancelled. You're starting a new one below.
              </p>
            )}
          </>
        }
      >
        {isPastPlanDate && (
          <p className="mt-1 text-xs font-medium text-warning">This date has already passed.</p>
        )}
      </PageHeader>

      <Section>
        <KpiStrip
          items={[
          { label: 'Planned Qty', value: formatQty(totalPlannedQty) },
          { label: 'History Avg', value: formatQty(totalHistoryQty) },
          { label: 'Items', value: items.length },
          ...(blockedItems.length > 0
            ? [{ label: 'Blocked', value: blockedItems.length, tone: 'warning' as const }]
            : []),
        ]}
        />
      </Section>

      {!loading && !error && blockedItems.length > 0 && (
        <Section>
          <Card padding="none" variant="outlined" className="overflow-hidden rounded-[9px] border shadow-none">
            <button
              type="button"
              onClick={() => setAttentionExpanded((current) => !current)}
              aria-expanded={attentionExpanded}
              aria-controls="needs-attention-panel"
              className="flex w-full items-center justify-between gap-2 px-3 py-[9px] text-left hover:bg-muted/60"
            >
              <span className="flex items-center gap-2">
                {attentionExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <span className="text-[12.5px] font-semibold text-foreground">Needs Attention</span>
                <Badge variant="secondary" size="sm">
                  {blockedItems.length}
                </Badge>
              </span>
            </button>
            <div id="needs-attention-panel" hidden={!attentionExpanded}>
              <div className="divide-y divide-border border-t border-border">
                {blockedItems.map((item) => {
                  const missingProductionUnit = item.production_unit === 'Unassigned';
                  return (
                    <AttentionItem
                      key={item.item_code}
                      severity={missingProductionUnit ? 'blocking' : 'warning'}
                      title={item.item_name || item.item_code}
                      detail={
                        missingProductionUnit
                          ? 'No production unit assigned'
                          : 'No comparable sales history for this weekday'
                      }
                      action={{
                        label: 'View item',
                        onClick: () => {
                          setSelectedItemDetailCode(item.item_code);
                        },
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </Card>
        </Section>
      )}

      <Section>
        <label className="relative mb-4 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            aria-label="Search item, department, or production unit"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item, department, or production unit"
            className="w-full border-border-strong pl-9"
          />
        </label>
      </Section>

      {loading ? (
        <Section>
          <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Spinner className="h-8 w-8 text-primary" />
          </div>
        </Section>
      ) : error ? (
        <Section>
          <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
        </Section>
      ) : filteredItems.length === 0 ? (
        <Section>
          {isEditable && <div className="mb-3 flex justify-end">{renderAddItemControl()}</div>}
          <Card className="p-10 text-center text-sm text-text-tertiary">
            No comparable history items found for this plan date. Items with no sales history don't show up as a
            suggestion, but you can still add any catalog item directly using "Add item" above.
          </Card>
        </Section>
      ) : (
        <Section>
          {(Object.keys(groupedItems).length > 1 || isEditable) && (
            <div className="sticky -top-6 z-20 -mx-6 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-6 py-2 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                {Object.keys(groupedItems).length > 1 && (
                  <>
                    <span className="flex shrink-0 items-center gap-1 pr-1 text-xs font-medium text-text-tertiary">
                      <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
                      Jump to:
                    </span>
                    {Object.keys(groupedItems).map((department) => (
                      <button
                        key={department}
                        type="button"
                        aria-label={`Jump to ${department}`}
                        onClick={() => jumpToDepartment(department)}
                        className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-primary-tint"
                      >
                        {department}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {renderAddItemControl()}
            </div>
          )}
          <div className="space-y-5">
          {Object.entries(groupedItems).map(([department, departmentItems]) => {
            const safeId = cssSafeId(department);
            // Collapsed groups default to open (absence of an entry means expanded).
            const isCollapsed = Boolean(collapsedDepartments[department]);
            const deptFilter = (departmentFilters[department] || '').trim().toLowerCase();
            const visibleDepartmentItems = deptFilter
              ? departmentItems.filter((item) => {
                  return [item.item_code, item.item_name, item.production_unit]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(deptFilter));
                })
              : departmentItems;

            const isTruncationExpanded = Boolean(truncationExpanded[department]);
            const isTruncated = !isTruncationExpanded && visibleDepartmentItems.length > ROW_TRUNCATE_LIMIT;
            const shownDepartmentItems = isTruncated
              ? visibleDepartmentItems.slice(0, ROW_TRUNCATE_LIMIT)
              : visibleDepartmentItems;
            const departmentIssueCount = departmentItems.filter((item) => blockedItemCodes.has(item.item_code)).length;
            const productionState = getDepartmentProductionState(department);

            // Next row (in the full filtered set) after the last currently
            // rendered row -- used to focus the newly-revealed row when
            // truncation auto-expands via onBoundaryReached('down').
            const nextRowAfterTruncation = visibleDepartmentItems[shownDepartmentItems.length];
            const nextRowAriaLabel = nextRowAfterTruncation
              ? `Plan quantity for ${nextRowAfterTruncation.item_name || nextRowAfterTruncation.item_code}`
              : undefined;

            // Column order: Item / History Insight / Production Unit / Plan
            // (inserted via editableColumnIndex below) / Variance.
            const departmentColumns: DataTableColumn<SalesPlanItem>[] = [
              {
                key: 'item_code',
                header: 'Item',
                render: (row) => (
                  <button
                    type="button"
                    onClick={() => setSelectedItemDetailCode(row.item_code)}
                    className="rounded-md px-1 py-0.5 text-left hover:bg-primary-tint"
                    aria-label={`View details for ${row.item_name || row.item_code}`}
                  >
                    <p className="font-semibold text-foreground">{row.item_name || row.item_code}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{row.item_code}</p>
                  </button>
                ),
              },
              {
                key: 'average_qty',
                header: 'History Insight',
                render: (row) => (
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryItem(row)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-left text-primary hover:bg-primary-tint"
                  >
                    <History className="h-4 w-4" />
                    <span>
                      Last {row.sample_days} comparable days avg {formatQty(row.average_qty)} {row.stock_uom}
                    </span>
                  </button>
                ),
              },
              {
                key: 'production_unit',
                header: 'Production Unit',
                render: (row) => <span className="text-muted-foreground">{row.production_unit || 'Unassigned'}</span>,
              },
              {
                key: 'variance',
                header: 'Variance',
                align: 'right',
                render: (row) => {
                  const variance = getVariance(row);
                  return (
                    <span className={`font-semibold ${variance < 0 ? 'text-warning' : 'text-success'}`}>
                      {variance > 0 ? '+' : ''}{formatQty(variance)}
                    </span>
                  );
                },
              },
            ];

            return (
              <div
                key={department}
                ref={(el) => {
                  departmentGroupRefs.current[department] = el;
                }}
                className="overflow-hidden rounded-lg border"
              >
                <div className="flex items-center justify-between border-b border-hair bg-muted/50 px-[14px] py-[7px]">
                  <button
                    type="button"
                    ref={(el) => {
                      departmentToggleRefs.current[department] = el;
                    }}
                    onClick={() => toggleDepartmentCollapsed(department)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`department-panel-${safeId}`}
                    className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground"
                  >
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    <span className="text-sm font-semibold text-foreground">{department}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-tertiary">
                      {departmentItems.length} item{departmentItems.length === 1 ? '' : 's'}
                    </span>
                    {departmentIssueCount > 0 && (
                      <Badge size="tag" variant="tagWarning">
                        {departmentIssueCount} issue{departmentIssueCount === 1 ? '' : 's'}
                      </Badge>
                    )}
                    <span className="text-xs font-medium text-text-tertiary">
                      {formatQty(departmentItems.reduce((total, item) => total + item.planned_qty, 0))} planned
                    </span>
                  </div>
                </div>
                {productionState && productionState.link_state !== 'ineligible' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-[14px] py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-muted-foreground">
                        Production Plan:{' '}
                        {productionState.production_plan || <span className="text-text-tertiary">Not created</span>}
                      </span>
                      {productionState.status && (
                        <Badge
                          size="tag"
                          variant={ERPNEXT_STATUS_BADGE[productionState.status] ?? 'default'}
                        >
                          {productionState.status}
                        </Badge>
                      )}
                      <Badge size="tag" variant={LINK_STATE_BADGE[productionState.link_state]}>
                        {LINK_STATE_LABEL[productionState.link_state]}
                      </Badge>
                      {productionState.execution_state &&
                        (productionState.execution_state === 'processing' ||
                          productionState.execution_state === 'failed' ||
                          productionState.execution_state === 'awaiting_materials') && (
                        <Badge size="tag" variant={EXECUTION_STATE_BADGE[productionState.execution_state]}>
                          {EXECUTION_STATE_LABEL[productionState.execution_state]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {productionState.docstatus === 1 &&
                        productionState.execution_state &&
                        CAN_PREPARE_EXECUTION.includes(productionState.execution_state) && (
                          <Button
                            onClick={() => requestPrepareDepartmentProduction(department)}
                            disabled={
                              ppPrepareBusyDepartment === department ||
                              productionState.execution_state === 'processing'
                            }
                            variant="default"
                            size="compactSm"
                            className="gap-2"
                          >
                            <Play className="h-3.5 w-3.5" />
                            <span>
                              {ppPrepareBusyDepartment === department
                                ? 'Preparing...'
                                : 'Prepare Production'}
                            </span>
                          </Button>
                        )}
                      {productionState.execution_state === 'processing' && (
                        <span className="text-xs text-muted-foreground">Processing…</span>
                      )}
                      {productionState.can_open && (
                        <Button
                          onClick={() => openDepartmentProductionPlan(department)}
                          disabled={ppOpenBusyDepartment === department}
                          variant="secondary"
                          size="compactSm"
                          className="gap-2"
                        >
                          <Factory className="h-3.5 w-3.5" />
                          <span>{ppOpenBusyDepartment === department ? 'Opening...' : 'Open Production Plan'}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {productionState && (productionState.blockers?.length ?? 0) > 0 && (
                  <div className="border-b border-hair bg-warning-tint px-[14px] py-2">
                    <ul className="space-y-1 text-xs text-warning">
                      {productionState.blockers!.map((blocker, index) => (
                        <li key={`${department}-blocker-${index}`}>
                          {blocker.message || `${blocker.type || 'Blocker'}${blocker.item_code ? `: ${blocker.item_code}` : ''}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div
                  id={`department-panel-${safeId}`}
                  hidden={isCollapsed}
                  ref={(el) => {
                    departmentContainerRefs.current[department] = el;
                  }}
                >
                  <div className="space-y-2 px-[14px] py-2">
                    {csvImportWarning && (
                      <p className="rounded-md border border-warning-tint-border bg-warning-tint px-3 py-2 text-sm text-warning" role="alert">
                        {csvImportWarning}
                      </p>
                    )}
                    <EditableDataTable
                      className="rounded-none border-0"
                      toolbarLeft={
                        <Input
                          aria-label={`Filter items in ${department}`}
                          placeholder={`Filter ${department} items`}
                          value={departmentFilters[department] || ''}
                          onChange={(event) =>
                            setDepartmentFilters((current) => ({ ...current, [department]: event.target.value }))
                          }
                          size="compact"
                          className="max-w-xs"
                        />
                      }
                      columns={departmentColumns}
                      rows={shownDepartmentItems}
                      // `dataRows` is the full filtered (but not truncated) set for
                      // this department, so CSV export/import and bulk-set operate
                      // on everything the user has filtered to, not just what is
                      // currently rendered on screen.
                      dataRows={visibleDepartmentItems}
                      // `_rowKey` (not item_code) is the row identity: two Sales
                      // Plan Item rows can legitimately share the same item_code,
                      // and item_code alone would let one edit/bulk-set/CSV import
                      // mutate both rows at once.
                      rowKey={(row) => row._rowKey}
                      editableColumn={{
                        key: 'planned_qty',
                        header: 'Plan',
                        align: 'right',
                        min: 0,
                        step: 0.01,
                        getValue: (row) => row.planned_qty,
                        onChange: (row, value) => updatePlannedQty(row._rowKey, value),
                        getAriaLabel: (row) => `Plan quantity for ${row.item_name || row.item_code}`,
                      }}
                      editableColumnIndex={3}
                      csvContextColumns={[
                        { header: 'Item Code', get: (row) => row.item_code },
                        { header: 'Item Name', get: (row) => row.item_name || '' },
                      ]}
                      emptyMessage="No items for this department."
                      rowTone={(row) => (row._rowKey === highlightedItemCode ? 'selected' : undefined)}
                      bulkSet={{
                        label: 'Set all to 0',
                        value: 0,
                        onApply: (rows, value) => {
                          rows.forEach((row) => updatePlannedQty(row._rowKey, value));
                        },
                      }}
                      csv={{
                        filename: `${safeId}-sales-plan.csv`,
                        onImport: (result) => {
                          result.updated.forEach(({ rowKey, values }) => {
                            const qty = Number(values.planned_qty);
                            if (Number.isFinite(qty)) updatePlannedQty(rowKey, qty);
                          });
                          setCsvImportWarning(
                            result.unmatched.length > 0
                              ? `${result.unmatched.length} row(s) in the imported file didn't match any item in this plan and were skipped.`
                              : null
                          );
                        },
                      }}
                      onBoundaryReached={handleBoundaryReached(department, isTruncated, nextRowAriaLabel)}
                    />
                    {visibleDepartmentItems.length > ROW_TRUNCATE_LIMIT && (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setTruncationExpanded((current) => ({ ...current, [department]: !current[department] }))
                          }
                        >
                          {isTruncationExpanded ? 'Show fewer' : `Show all ${visibleDepartmentItems.length} rows`}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </Section>
      )}

      <HistoryModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />
      <ItemDetailModal
        itemCode={selectedItemDetailCode}
        onClose={() => {
          if (selectedItemDetailCode) focusItemRow(selectedItemDetailCode);
          setSelectedItemDetailCode(null);
        }}
      />

      <Dialog
        open={backwardActionOpen && Boolean(currentBackwardAction)}
        // Refuse to close while a request is in flight -- Escape and the
        // overlay click both route through here, so without this guard
        // either one could dismiss the modal mid-request, discarding the
        // eventual response (including a real backend error) into state
        // nothing renders anymore. The Cancel/Confirm buttons already
        // disable themselves the same way; this is the same rule applied to
        // Dialog's own dismissal paths.
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !backwardActionTransitioning) closeBackwardActionModal();
        }}
        closeOnEscape={!backwardActionTransitioning}
      >
        <DialogContent onClose={backwardActionTransitioning ? undefined : closeBackwardActionModal}>
          {currentBackwardAction && (
            <>
              <DialogHeader>
                <DialogTitle>{currentBackwardAction.label}</DialogTitle>
                <p className="text-sm text-text-tertiary">{planName || 'Sales Plan'}</p>
              </DialogHeader>
              <div className="px-6">
                <label htmlFor="backward-action-reason" className="mb-2 block text-sm font-medium text-foreground">
                  Reason for {currentBackwardAction.label.toLowerCase()}
                </label>
                <Textarea
                  id="backward-action-reason"
                  value={backwardActionReason}
                  onChange={(event) => setBackwardActionReason(event.target.value)}
                  placeholder="Please explain why you are performing this action..."
                  className="h-24 resize-none"
                  disabled={backwardActionTransitioning}
                />
                {backwardActionError && (
                  <div className="mt-4 rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">
                    {backwardActionError}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeBackwardActionModal}
                  disabled={backwardActionTransitioning}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={runBackwardTransition}
                  disabled={backwardActionTransitioning || backwardActionReason.trim().length === 0}
                  className={currentBackwardAction.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
                >
                  {/* Deliberately NOT reusing currentBackwardAction.label here --
                      that's also the text of the button that opened this modal,
                      so while the modal is open both would carry the identical
                      accessible name ("Return to Draft"/"Supersede/Cancel"),
                      ambiguous for screen readers and for anything selecting by
                      role+name. */}
                  {backwardActionTransitioning ? 'Updating...' : 'Confirm'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={prepareConfirmDepartment !== null}
        onOpenChange={(open) => {
          if (!open && !ppPrepareBusyDepartment) setPrepareConfirmDepartment(null);
        }}
        title="Prepare Production?"
        description={(() => {
          if (!prepareConfirmDepartment) return '';
          const plan = getDepartmentProductionState(prepareConfirmDepartment)?.production_plan;
          const planSuffix = plan ? ` (${plan})` : '';
          return (
            `This will validate stock, transfer materials from Store, create Work Orders, and post ` +
            `Manufacture Stock Entries for ${prepareConfirmDepartment}${planSuffix}. Submitting a Manufacture ` +
            `Stock Entry declares that physical production is complete. Continue?`
          );
        })()}
        cancelLabel="Cancel"
        confirmLabel="Prepare Production"
        loadingLabel="Preparing…"
        isSubmitting={ppPrepareBusyDepartment === prepareConfirmDepartment && prepareConfirmDepartment !== null}
        onConfirm={confirmPrepareDepartmentProduction}
      />
    </Page>
  );
};

export default SalesPlanPage;
