import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Factory, Play, Save, Send } from 'lucide-react';
import { Badge, Button, DataTable, EditableDataTable, type DataTableColumn } from '@ury/ui';
import type { ChefDepartment, ChefQueueItem, ProductionPolicy } from '../../services/chefProduction';
import {
  ERPNEXT_STATUS_BADGE,
  EXECUTION_STATE_BADGE,
  EXECUTION_STATE_LABEL,
  LINK_STATE_BADGE,
  LINK_STATE_LABEL,
  describeBlocker,
  downloadCsv,
  fileSlug,
} from '../../components/production/productionStatus';
import { formatQty } from './format';
import { __ } from '../../i18n';

export interface DepartmentPlanCardProps {
  department: ChefDepartment;
  planDate: string;
  collapsed: boolean;
  busyAction: 'save' | 'submit' | 'prepare' | null;
  onToggle: () => void;
  onOpenRawMaterials: () => void;
  onSaveQuantities: (rows: Array<{ row_name: string | null; item_code: string; production_qty: number }>) => Promise<boolean>;
  onSubmit: () => void;
  onPrepare: () => void;
  registerRef?: (el: HTMLDivElement | null) => void;
}

const cssSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, '-');

/** Item Production Configuration policy, as shown on the Policy column and in the CSV. */
const POLICY_LABEL: Record<ProductionPolicy, string> = {
  PRE_PRODUCED: 'Pre-produced',
  MADE_TO_ORDER: 'Made to Order',
  DIRECT_RETAIL: 'Direct Retail',
  BUNDLE: 'Bundle',
};

const policyLabel = (policy: ProductionPolicy | null) => (policy ? POLICY_LABEL[policy] ?? policy : '');

/**
 * One department Production Plan: header with plan status and actions, then
 * its items. Same card structure as the Sales Plan page's department group.
 * Production Qty is editable only while the plan is Draft (`can_edit`, from
 * the server); edits are held locally until "Save quantities".
 */
export function DepartmentPlanCard({
  department: dept,
  planDate,
  collapsed,
  busyAction,
  onToggle,
  onOpenRawMaterials,
  onSaveQuantities,
  onSubmit,
  onPrepare,
  registerRef,
}: DepartmentPlanCardProps) {
  const safeId = cssSafeId(dept.department);
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});

  // Drop local edits whenever the server copy changes (save, refresh, poll).
  const serverKey = useMemo(
    () => `${dept.production_plan}|${dept.items.map((row) => `${row.row_key}:${row.production_qty}`).join(',')}`,
    [dept.production_plan, dept.items],
  );
  useEffect(() => setDraftQty({}), [serverKey]);

  const changedRows = useMemo(
    () =>
      dept.items
        .filter((row) => row.row_key in draftQty && draftQty[row.row_key] !== row.production_qty)
        .map((row) => ({ row_name: row.row_name, item_code: row.item_code, production_qty: draftQty[row.row_key] })),
    [dept.items, draftQty],
  );
  // A plan row needs a quantity above 0 (ERPNext). A sub-assembly may be 0 when stock covers it.
  const isInvalidQty = (row: ChefQueueItem, qty: number) => (row.derived_qty ? qty < 0 : !(qty > 0));
  const hasInvalidDraft = dept.items.some((row) => row.row_key in draftQty && isInvalidQty(row, draftQty[row.row_key]));

  const productionQtyOf = (row: ChefQueueItem) =>
    row.row_key in draftQty ? draftQty[row.row_key] : row.production_qty;

  const isSubmitted = dept.docstatus === 1;

  const itemColumn: DataTableColumn<ChefQueueItem> = {
    key: 'item',
    header: __('Item'),
    width: '26%',
    render: (row) => (
      <div className="min-w-0">
        <div className="font-medium text-foreground">{row.item_name}</div>
        <div className="text-xs text-text-tertiary">{row.item_code}</div>
      </div>
    ),
  };

  const policyColumn: DataTableColumn<ChefQueueItem> = {
    key: 'production_policy',
    header: __('Policy'),
    width: '14%',
    render: (row) => <span className="text-muted-foreground">{__(policyLabel(row.production_policy)) || '—'}</span>,
  };

  const plannedColumn: DataTableColumn<ChefQueueItem> = {
    key: 'planned_qty',
    header: __('Planned Qty'),
    align: 'right',
    width: '12%',
    render: (row) => (
      <span>
        {formatQty(row.planned_qty)} <span className="text-xs text-text-tertiary">{row.stock_uom}</span>
      </span>
    ),
  };

  const historyColumn: DataTableColumn<ChefQueueItem> = {
    key: 'last_weekday_qty',
    header: __('Previous Production Qty'),
    align: 'right',
    width: '18%',
    render: (row) =>
      row.last_weekday_qty === null ? (
        <span className="text-xs text-text-tertiary">{__('No history')}</span>
      ) : (
        formatQty(row.last_weekday_qty)
      ),
  };

  const productionColumn: DataTableColumn<ChefQueueItem> = {
    key: 'production_qty',
    header: __('Production Qty'),
    align: 'right',
    width: '16%',
    render: (row) => <span className="font-semibold">{formatQty(row.production_qty)}</span>,
  };

  const producedColumn: DataTableColumn<ChefQueueItem> = {
    key: 'produced_qty',
    header: __('Produced Qty'),
    align: 'right',
    width: '14%',
    render: (row) => (
      <span className={row.produced_qty && row.produced_qty >= row.production_qty ? 'font-semibold text-success' : ''}>
        {formatQty(row.produced_qty)}
      </span>
    ),
  };

  const downloadItems = () => {
    downloadCsv(
      `${fileSlug(dept.department)}-${planDate}-production.csv`,
      dept.items,
      [
        { header: __('Item Code'), get: (row) => row.item_code },
        { header: __('Item Name'), get: (row) => row.item_name },
        { header: __('Policy'), get: (row) => policyLabel(row.production_policy) },
        { header: __('UOM'), get: (row) => row.stock_uom },
        { header: __('Planned Qty'), get: (row) => row.planned_qty },
        { header: __('Production Qty'), get: (row) => productionQtyOf(row) },
        { header: __('Previous Production Qty'), get: (row) => row.last_weekday_qty },
        ...(isSubmitted ? [{ header: __('Produced Qty'), get: (row: ChefQueueItem) => row.produced_qty }] : []),
      ],
    );
  };

  const save = async () => {
    if (changedRows.length === 0 || hasInvalidDraft) return;
    await onSaveQuantities(changedRows);
  };

  return (
    <div ref={registerRef} className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b border-hair bg-muted/50 px-[14px] py-[7px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={`chef-department-panel-${safeId}`}
          className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          <span className="text-sm font-semibold text-foreground">{dept.department}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-tertiary">
            {dept.totals.items === 1 ? __('1 item') : __('{0} items', [dept.totals.items])}
          </span>
          <span className="text-xs font-medium text-text-tertiary">
            {formatQty(dept.totals.production_qty)} {__('to produce')}
          </span>
        </div>
      </div>

      {dept.production_plan ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-[14px] py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">
              {__('Production Plan:')}{' '}
              <a
                href={`/app/production-plan/${encodeURIComponent(dept.production_plan)}`}
                className="text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {dept.production_plan}
              </a>
            </span>
            {dept.erpnext_status && (
              <Badge size="tag" variant={ERPNEXT_STATUS_BADGE[dept.erpnext_status] ?? 'default'}>
                {dept.erpnext_status}
              </Badge>
            )}
            {dept.link_state === 'stale' && (
              <Badge size="tag" variant={LINK_STATE_BADGE.stale}>
                {LINK_STATE_LABEL.stale}
              </Badge>
            )}
            {isSubmitted && dept.execution_state && (
              <Badge size="tag" variant={EXECUTION_STATE_BADGE[dept.execution_state]}>
                {EXECUTION_STATE_LABEL[dept.execution_state]}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={downloadItems} variant="secondary" size="compactSm" className="gap-2" disabled={dept.items.length === 0}>
              <Download className="h-3.5 w-3.5" />
              <span>{__('Download items')}</span>
            </Button>
            <Button onClick={onOpenRawMaterials} variant="secondary" size="compactSm" className="gap-2">
              <Factory className="h-3.5 w-3.5" />
              <span>{__('Raw materials')}</span>
            </Button>
            {dept.can_edit && changedRows.length > 0 && (
              <Button
                onClick={save}
                disabled={busyAction !== null || hasInvalidDraft}
                variant="secondary"
                size="compactSm"
                className="gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{busyAction === 'save' ? __('Saving...') : __('Save quantities')}</span>
              </Button>
            )}
            {dept.can_submit && (
              <Button
                onClick={onSubmit}
                disabled={busyAction !== null || changedRows.length > 0}
                title={changedRows.length > 0 ? __('Save quantities before submitting') : undefined}
                size="compactSm"
                className="gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{busyAction === 'submit' ? __('Submitting...') : __('Submit plan')}</span>
              </Button>
            )}
            {dept.can_prepare && (
              <Button onClick={onPrepare} disabled={busyAction !== null} size="compactSm" className="gap-2">
                <Play className="h-3.5 w-3.5" />
                <span>{busyAction === 'prepare' ? __('Preparing...') : __('Prepare Production')}</span>
              </Button>
            )}
            {dept.execution_state === 'processing' && (
              <span className="text-xs text-muted-foreground">{__('Processing…')}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="border-b border-hair px-[14px] py-2 text-xs text-muted-foreground">
          {__('No Production Plan yet. It is created once the Sales Plan is Locked for Production.')}
        </div>
      )}

      {dept.blockers.length > 0 && (
        <div className="border-b border-hair bg-warning-tint px-[14px] py-2">
          <ul className="space-y-1 text-xs text-warning">
            {dept.blockers.map((blocker, index) => (
              <li key={`${safeId}-blocker-${index}`}>{describeBlocker(blocker)}</li>
            ))}
          </ul>
        </div>
      )}

      <div id={`chef-department-panel-${safeId}`} hidden={collapsed}>
        {dept.production_plan && (
          <div className="px-[14px] py-2">
            {dept.can_edit ? (
              <>
                <EditableDataTable
                  className="rounded-none border-0"
                  columns={[itemColumn, policyColumn, plannedColumn, historyColumn]}
                  rows={dept.items}
                  rowKey={(row) => row.row_key}
                  editableColumn={{
                    key: 'production_qty',
                    header: __('Production Qty'),
                    align: 'right',
                    width: '16%',
                    min: 0,
                    step: 0.01,
                    getValue: productionQtyOf,
                    onChange: (row, value) => setDraftQty((current) => ({ ...current, [row.row_key]: value })),
                    getAriaLabel: (row) => __('Production quantity for {0}', [row.item_name || row.item_code]),
                  }}
                  editableColumnIndex={3}
                  rowTone={(row) =>
                    row.row_key in draftQty && isInvalidQty(row, draftQty[row.row_key]) ? 'danger' : undefined
                  }
                  emptyMessage={__('No items in this Production Plan.')}
                />
                {hasInvalidDraft && (
                  <p className="pt-2 text-xs text-destructive" role="alert">
                    {__('Production quantity must be greater than 0 (a sub-assembly may be 0 when stock covers it).')}
                  </p>
                )}
              </>
            ) : (
              <DataTable
                className="rounded-none border-0"
                columns={[
                  itemColumn,
                  policyColumn,
                  plannedColumn,
                  productionColumn,
                  historyColumn,
                  ...(isSubmitted ? [producedColumn] : []),
                ]}
                rows={dept.items}
                emptyMessage={__('No items in this Production Plan.')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
