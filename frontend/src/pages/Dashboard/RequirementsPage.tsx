import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  AttentionFeed,
  Badge,
  Card,
  DataTable,
  DataTableColumn,
  InlineEditCell,
  Input,
  KpiStrip,
  Spinner,
  numericCellClass,
} from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { departmentStockService, PlanComponentDemand } from '../../services/departmentStock';
import { buildSalesPlanDraftKey, getSalesPlanDraftQuantities, salesPlanService, saveSalesPlanDraftQuantities } from '../../services/salesPlan';

/**
 * Real data used here:
 *  - `departmentStockService.getActivePlan` -> the approved/locked Sales
 *    Plan's frozen per-component demand vector (`PlanComponentDemand[]`).
 *    This is the only source for "Materials to issue" -- required quantity
 *    per component/department. There is NO stock-on-hand join anywhere in
 *    this codebase (confirmed by searching every service under
 *    `frontend/src/services/` for stock_on_hand/actual_qty/available_qty/
 *    on_hand/bin fields), so "In store", "Cover", and the KPI strip's
 *    "Covered by stock" / "Short" / "Material value" / "To purchase" figures
 *    cannot be computed. They are shown as "Not available" with an honest
 *    hint rather than fabricated numbers, and the Shortfalls feed states the
 *    limitation instead of inventing which components are short.
 *  - `salesPlanService.getPlan(planName)` -> the same approved plan's raw
 *    `items` child table (item_code/qty/department/production_unit/
 *    stock_uom) is used for "Production targets". Quantities are
 *    inline-editable via `InlineEditCell`, and edits are persisted with the
 *    exact same localStorage draft mechanism `SalesPlanPage.tsx` uses
 *    (`buildSalesPlanDraftKey` + `saveSalesPlanDraftQuantities` /
 *    `getSalesPlanDraftQuantities`), so a quantity tweaked here shows back up
 *    on the Sales Plan page for the same branch/date.
 */

interface RawSalesPlanItem {
  item_code: string;
  qty: number;
  stock_uom?: string;
  department?: string;
  production_unit?: string;
}

interface RawSalesPlanDoc {
  name: string;
  company?: string;
  branch?: string;
  plan_date?: string;
  items?: RawSalesPlanItem[];
}

interface ProductionTargetRow {
  item_code: string;
  qty: number;
  stock_uom?: string;
  department?: string;
  production_unit?: string;
}

const getToday = () => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

const formatQty = (value: number, uom?: string) => {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(3);
  return uom ? `${formatted} ${uom}` : formatted;
};

export const RequirementsPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [requirementsDate, setRequirementsDate] = useState(getToday);
  const [demandVector, setDemandVector] = useState<PlanComponentDemand[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionTargetRow[]>([]);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [planCompany, setPlanCompany] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const draftKey = useMemo(() => {
    if (!activeBranchId || activeBranchId === 'all' || !planCompany || !requirementsDate) return null;
    return buildSalesPlanDraftKey({ branch: activeBranchId, company: planCompany, plan_date: requirementsDate });
  }, [activeBranchId, planCompany, requirementsDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlanName(null);
    setPlanStatus(null);
    setPlanCompany(undefined);
    setDemandVector([]);
    setProductionItems([]);

    if (!activeBranchId || activeBranchId === 'all') {
      // Requirements are derived from a single branch's approved Sales
      // Plan -- there is no meaningful "all branches" view. Fail closed
      // with an actionable message instead of calling the API.
      setError('Select a specific branch above to view its Requirements.');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const activePlan = await departmentStockService.getActivePlan(activeBranchId, requirementsDate);
        if (cancelled) return;

        if (!activePlan) {
          setError('No approved Sales Plan found for this branch and date. Requirements are only available once a plan is approved.');
          setLoading(false);
          return;
        }

        setPlanName(activePlan.name);
        setPlanStatus(activePlan.status);
        setDemandVector(activePlan.demandVector);

        const rawPlan = (await salesPlanService.getPlan(activePlan.name)) as unknown as RawSalesPlanDoc;
        if (cancelled) return;

        setPlanCompany(rawPlan.company);

        const savedQuantities = getSalesPlanDraftQuantities(
          buildSalesPlanDraftKey({
            branch: activeBranchId,
            company: rawPlan.company,
            plan_date: requirementsDate,
          }),
        );

        const items = Array.isArray(rawPlan.items) ? rawPlan.items : [];
        setProductionItems(
          items.map((item) => ({
            item_code: item.item_code,
            qty: Number.isFinite(savedQuantities[item.item_code]) ? savedQuantities[item.item_code] : Number(item.qty ?? 0),
            stock_uom: item.stock_uom,
            department: item.department,
            production_unit: item.production_unit,
          })),
        );
      } catch {
        if (!cancelled) {
          setError('Unable to load Requirements for this branch and date.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, requirementsDate]);

  const departmentCount = useMemo(
    () => new Set(demandVector.map((row) => row.department).filter(Boolean)).size,
    [demandVector],
  );

  const persistProductionQuantities = (nextItems: ProductionTargetRow[]) => {
    if (!draftKey) return;
    saveSalesPlanDraftQuantities(
      draftKey,
      nextItems.map((item) => ({ item_code: item.item_code, planned_qty: item.qty })),
    );
  };

  const updateProductionQty = (itemCode: string, rawValue: string) => {
    const nextQty = Math.max(0, Number(rawValue) || 0);
    setProductionItems((current) => {
      const next = current.map((item) => (item.item_code === itemCode ? { ...item, qty: nextQty } : item));
      return next;
    });
  };

  const commitProductionQty = (itemCode: string, rawValue: string) => {
    const nextQty = Math.max(0, Number(rawValue) || 0);
    setProductionItems((current) => {
      const next = current.map((item) => (item.item_code === itemCode ? { ...item, qty: nextQty } : item));
      persistProductionQuantities(next);
      return next;
    });
  };

  const materialsColumns: DataTableColumn<PlanComponentDemand>[] = [
    { key: 'component_item', header: 'Material', render: (row) => (
      <div>
        <p className="font-semibold text-foreground">{row.component_item_name || row.component_item}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{row.component_item}</p>
      </div>
    ) },
    { key: 'department', header: 'Department', render: (row) => row.department || '—' },
    {
      key: 'required_qty',
      header: 'Required',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{formatQty(row.required_qty, row.stock_uom)}</span>,
    },
    {
      key: 'in_store',
      header: 'In store',
      align: 'right',
      render: () => (
        <Badge variant="secondary" size="sm" title="No stock-on-hand data source exists yet">
          Not available
        </Badge>
      ),
    },
  ];

  const productionColumns: DataTableColumn<ProductionTargetRow>[] = [
    { key: 'item_code', header: 'Item', render: (row) => <span className="font-semibold text-foreground">{row.item_code}</span> },
    {
      key: 'department',
      header: 'Department',
      render: (row) => [row.department, row.production_unit].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      render: (row) => (
        <InlineEditCell
          aria-label={`Production target quantity for ${row.item_code}`}
          value={row.qty}
          type="number"
          min="0"
          step="0.001"
          onChange={(value) => updateProductionQty(row.item_code, value)}
          onCommit={(value) => commitProductionQty(row.item_code, value)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Requirements</h1>
            <p className="mt-1 text-sm text-text-tertiary">
              Materials and production targets derived from the approved Sales Plan.
              {planName && (
                <span className="ml-1 text-text-tertiary">
                  Plan {planName}{planStatus ? ` · ${planStatus}` : ''}
                </span>
              )}
            </p>
          </div>
          <label className="relative block">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              aria-label="Requirements date"
              type="date"
              value={requirementsDate}
              onChange={(event) => setRequirementsDate(event.target.value)}
              className="pl-9"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      ) : (
        <>
          <KpiStrip
            items={[
              {
                label: 'Material value',
                value: 'Not available',
                hint: 'No cost data source for plan demand',
              },
              {
                label: 'Covered by stock',
                value: 'Not available',
                hint: 'No stock-on-hand data source',
              },
              {
                label: 'Short',
                value: 'Not available',
                hint: 'No stock-on-hand data source',
              },
              {
                label: 'To purchase',
                value: `${demandVector.length} line${demandVector.length === 1 ? '' : 's'}`,
                hint: `${departmentCount} department${departmentCount === 1 ? '' : 's'} · cost not available`,
              },
            ]}
          />

          <AttentionFeed
            title="Shortfalls"
            items={[
              {
                severity: 'info',
                title: 'Stock-on-hand data not available',
                detail: `This workspace has no stock-on-hand data source yet, so automatic shortfall detection is not possible. ${demandVector.length} required-quantity line${demandVector.length === 1 ? '' : 's'} below need manual verification against store stock.`,
              },
            ]}
          />

          <div>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
              Materials to issue <span className="ml-1 text-xs font-normal text-text-tertiary">{demandVector.length} lines</span>
            </h2>
            <DataTable
              columns={materialsColumns}
              rows={demandVector}
              emptyMessage="No component demand recorded on this plan yet."
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
              Production targets <span className="ml-1 text-xs font-normal text-text-tertiary">{productionItems.length} items</span>
            </h2>
            <DataTable
              columns={productionColumns}
              rows={productionItems}
              emptyMessage="No items recorded on this plan yet."
            />
          </div>
        </>
      )}
    </div>
  );
};

export default RequirementsPage;
