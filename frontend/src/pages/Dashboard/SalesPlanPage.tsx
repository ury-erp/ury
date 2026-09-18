import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronUp, CheckCircle2, History, ListFilter, Lock, Plus, Save, Search, Send, X } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AttentionFeed, Badge, Button, Card, DataTable, EditableDataTable, Input, KpiStrip, Page, Section, Spinner, type DataTableColumn } from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { useAuth } from '../../store/useAuth';
import {
  addManualItemToDraft,
  BranchItemSearchResult,
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

interface BomItemRow {
  item_code: string;
  item_name?: string;
  qty?: number;
  uom?: string;
}

interface ItemDetailDoc {
  item_code: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  description?: string;
}

interface ItemDetailModalProps {
  itemCode: string | null;
  onClose: () => void;
}

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ itemCode, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<ItemDetailDoc | null>(null);
  const [bomName, setBomName] = useState<string | null>(null);
  const [bomItems, setBomItems] = useState<BomItemRow[]>([]);
  const [bomChecked, setBomChecked] = useState(false);
  const [bomError, setBomError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (itemCode) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [itemCode, onClose]);

  useEffect(() => {
    if (!itemCode) {
      setItem(null);
      setError(null);
      setBomName(null);
      setBomItems([]);
      setBomChecked(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setItem(null);
    setBomName(null);
    setBomItems([]);
    setBomChecked(false);

    (async () => {
      try {
        const itemRes = await call<any>('frappe.client.get', {
          doctype: 'Item',
          name: itemCode,
        });
        const itemDoc = itemRes?.message || itemRes;
        if (cancelled) return;
        setItem({
          item_code: itemDoc?.item_code || itemCode,
          item_name: itemDoc?.item_name,
          item_group: itemDoc?.item_group,
          stock_uom: itemDoc?.stock_uom,
          description: itemDoc?.description,
        });
      } catch (err) {
        if (!cancelled) setError('Unable to load item details.');
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const bomListRes = await call<any>('frappe.client.get_list', {
          doctype: 'BOM',
          filters: [['item', '=', itemCode], ['docstatus', '=', 1], ['is_active', '=', 1]],
          fields: ['name', 'is_active', 'is_default'],
          order_by: 'is_default desc, is_active desc, modified desc',
          limit_page_length: 1,
        });
        if (cancelled) return;
        const boms = Array.isArray(bomListRes?.message) ? bomListRes.message : (Array.isArray(bomListRes) ? bomListRes : []);
        const bestBom = boms[0];
        if (!bestBom?.name) {
          setBomChecked(true);
          return;
        }

        try {
          const bomDocRes = await call<any>('frappe.client.get', {
            doctype: 'BOM',
            name: bestBom.name,
          });
          if (cancelled) return;
          const bomDoc = bomDocRes?.message || bomDocRes;
          setBomName(bomDoc?.name || bestBom.name);
          const rows: BomItemRow[] = Array.isArray(bomDoc?.items)
            ? bomDoc.items.map((row: any) => ({
                item_code: row.item_code || '',
                item_name: row.item_name,
                qty: row.qty !== undefined ? Number(row.qty) : undefined,
                uom: row.uom || row.stock_uom,
              }))
            : [];
          setBomItems(rows);
          setBomChecked(true);
        } catch (err) {
          if (cancelled) return;
          setBomName(bestBom.name);
          setBomError(true);
          setBomChecked(true);
        }
      } catch (err) {
        if (!cancelled) setBomChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemCode]);

  if (!itemCode) return null;

  const bomColumns: DataTableColumn<BomItemRow>[] = [
    { key: 'item_code', header: 'Item Code', render: (row) => row.item_code },
    { key: 'item_name', header: 'Item Name', render: (row) => row.item_name || '-' },
    { key: 'qty', header: 'Qty', align: 'right', render: (row) => (row.qty !== undefined ? formatQty(row.qty) : '-') },
    { key: 'uom', header: 'UOM', render: (row) => row.uom || '-' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="item-detail-modal-title">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close item detail" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted px-6 py-4">
          <div>
            <h2 id="item-detail-modal-title" className="text-lg font-semibold text-foreground">
              {item?.item_name || itemCode}
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">Item detail and recipe (BOM)</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close item details">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">{error}</div>
          ) : (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Item Code</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.item_code || itemCode}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Item Group</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.item_group || 'Unassigned'}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Stock UOM</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.stock_uom || '-'}</p>
                </div>
              </div>

              <h3 className="mb-2 text-sm font-semibold text-foreground">Recipe (BOM){bomName ? ` — ${bomName}` : ''}</h3>
              {!bomChecked ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="h-5 w-5 text-primary" />
                </div>
              ) : !bomName ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-text-tertiary">
                  No BOM configured for this item.
                </div>
              ) : bomError ? (
                <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">
                  Unable to load the recipe for this item.
                </div>
              ) : bomItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-text-tertiary">
                  This BOM has no ingredient lines.
                </div>
              ) : (
                <DataTable columns={bomColumns} rows={bomItems} emptyMessage="No BOM ingredients found." />
              )}
            </>
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
                    className={`mx-1 h-0.5 min-w-[16px] max-w-[56px] flex-1 ${index <= activeIndex ? 'bg-primary' : 'bg-border-strong'}`}
                  />
                )}
                <div
                  role="listitem"
                  className="flex flex-1 items-center gap-1.5"
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
  const { isManager } = useAuth();
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
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

  // "Needs Attention" collapse-by-default state.
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
    // gaps show up first in the collapsed 3-item preview.
    return [...blocked].sort((a, b) => {
      const aBlocking = a.production_unit === 'Unassigned' ? 0 : 1;
      const bBlocking = b.production_unit === 'Unassigned' ? 0 : 1;
      return aBlocking - bBlocking;
    });
  }, [items]);

  const visibleBlockedItems = attentionExpanded ? blockedItems : blockedItems.slice(0, 3);

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
      });
      setPlanName(result.name);
      setPlanStatus((result.status as PlanStatus) || 'Draft');
    } catch (err) {
      setError('Unable to save this Sales Plan draft.');
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
    <Page>
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Sales Plan — {dateHeading} · {branchName}
            </h1>
            <p className="mt-1 text-sm text-text-tertiary">
              We've suggested quantities based on similar days. Adjust anything you expect to be different, then submit the plan for approval.
            </p>
            {isPastPlanDate && (
              <p className="mt-1 text-xs font-medium text-warning">This date has already passed.</p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                aria-label="Plan date"
                type="date"
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
                className="pl-9"
              />
            </label>
            <div className="relative" ref={addItemPopoverRef}>
              <Button
                ref={addItemButtonRef}
                type="button"
                variant="secondary"
                size="compactLg"
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
            <Button onClick={saveDraft} disabled={loading || saving || !draftKey} variant="chrome" size="compactLg" className="gap-2">
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </Button>
            {currentAction && (
              <Button
                onClick={runTransition}
                disabled={!canTransition || transitioning || actionBlockedByRole}
                title={actionBlockedByRole ? 'Only managers can approve a Sales Plan.' : undefined}
                size="compactLg"
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
            <p className="text-xs text-text-tertiary">Only managers can approve this plan.</p>
          )}
        </div>

        {transitionError && (
          <p className="mt-3 rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">{transitionError}</p>
        )}
      </div>

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
          <AttentionFeed
          title="Needs Attention"
          items={visibleBlockedItems.map((item) => {
            const missingProductionUnit = item.production_unit === 'Unassigned';
            return {
              severity: missingProductionUnit ? 'blocking' : 'warning',
              title: item.item_name || item.item_code,
              detail: missingProductionUnit
                ? 'No production unit assigned'
                : 'No comparable sales history for this weekday',
              action: {
                label: 'View item',
                onClick: () => {
                  setSelectedItemDetailCode(item.item_code);
                },
              },
            };
          })}
          />
          {blockedItems.length > 3 && (
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAttentionExpanded((current) => !current)}
                className="gap-1"
              >
                {attentionExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>Collapse</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>{`Show all (${blockedItems.length})`}</span>
                  </>
                )}
              </Button>
            </div>
          )}
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
          <Card className="p-10 text-center text-sm text-text-tertiary">No comparable history items found for this plan date.</Card>
        </Section>
      ) : (
        <Section>
          {Object.keys(groupedItems).length > 1 && (
            <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-1 py-2 backdrop-blur">
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
                  <div>
                    <p className="font-semibold text-foreground">{row.item_name || row.item_code}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{row.item_code}</p>
                  </div>
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
                className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-border bg-muted px-5 py-3">
                  <button
                    type="button"
                    ref={(el) => {
                      departmentToggleRefs.current[department] = el;
                    }}
                    onClick={() => toggleDepartmentCollapsed(department)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`department-panel-${safeId}`}
                    className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground"
                  >
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    <span>{department}</span>
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
                <div
                  id={`department-panel-${safeId}`}
                  hidden={isCollapsed}
                  ref={(el) => {
                    departmentContainerRefs.current[department] = el;
                  }}
                >
                  <div className="px-5 py-3">
                    {csvImportWarning && (
                      <p className="mb-2 rounded-md border border-warning-tint-border bg-warning-tint px-3 py-2 text-sm text-warning" role="alert">
                        {csvImportWarning}
                      </p>
                    )}
                    <EditableDataTable
                      toolbarLeft={
                        <Input
                          aria-label={`Filter items in ${department}`}
                          placeholder={`Filter ${department} items`}
                          value={departmentFilters[department] || ''}
                          onChange={(event) =>
                            setDepartmentFilters((current) => ({ ...current, [department]: event.target.value }))
                          }
                          className="h-8 max-w-xs text-sm"
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
                          size="sm"
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
    </Page>
  );
};

export default SalesPlanPage;
