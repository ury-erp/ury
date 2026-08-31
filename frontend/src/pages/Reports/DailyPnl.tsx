import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { Card, CardContent, CardHeader, CardTitle, StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, TrendingUp, TrendingDown, Percent, AlertTriangle, ChevronDown } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';
import { DatePicker } from '../../components/setup/DatePicker';
import { SearchableSelect } from '../../components/common/SearchableSelect';

interface MissingPriceSection {
  label: string;
  items: string[];
}

interface SummaryRow {
  key: string;
  label: string;
  amount: number;
  percent: number;
}

interface BreakupRow {
  label: string;
  amount: number;
  percent: number;
}

interface CostOfGoodsRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  qty: number;
  buying_price: number;
  amount: number;
}

interface DailyPnlData {
  exists: boolean;
  name?: string;
  branch: string;
  date: string;
  remarks?: string | null;
  missing_prices?: MissingPriceSection[];
  summary?: SummaryRow[];
  direct_expenses_breakup?: BreakupRow[];
  employee_costs_breakup?: BreakupRow[];
  indirect_expenses_breakup?: BreakupRow[];
  cost_of_goods?: CostOfGoodsRow[];
}

const costOfGoodsColumns: DataTableColumn<CostOfGoodsRow>[] = [
  { key: 'item_name', header: 'Item', render: (r) => r.item_name || r.item_code },
  { key: 'item_group', header: 'Group', render: (r) => r.item_group || '—' },
  { key: 'qty', header: 'Qty' },
  { key: 'buying_price', header: 'Buying Price', render: (r) => formatCurrency(r.buying_price), align: 'right' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
];

function MissingPricesWarning({ sections }: { sections: MissingPriceSection[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-left"
      >
        <span className="flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Buying price not set for {totalItems} item{totalItems === 1 ? '' : 's'} — Cost of Goods may be
          understated
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200 pt-3">
          {sections.map((s) => (
            <div key={s.label}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5">
                {s.label} ({s.items.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.items.map((item) => (
                  <span key={item} className="px-2 py-0.5 rounded bg-amber-100 text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-amber-700">
            Update these item prices, then submit the document again for accurate Cost of Goods.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One row of the P&L waterfall. `variant` controls visual weight:
 * - 'line'      plain revenue/expense line item
 * - 'nested'    a breakup child-table row, indented under its parent total
 * - 'subtotal'  a running total (Direct Expenses / Employee Cost) — bold,
 *               not highlighted, sits directly above its own breakup
 * - 'highlight' a headline subtotal (Net Sales / Gross Profit / Total
 *               Indirect Expenses / Net Profit) — bold with a tinted
 *               background and top border, mirroring the desk print-view's
 *               highlighted subtotal rows
 */
function WaterfallRow({
  label,
  amount,
  percent,
  variant = 'line',
}: {
  label: string;
  amount: number;
  percent?: number;
  variant?: 'line' | 'nested' | 'subtotal' | 'highlight';
}) {
  const isHighlight = variant === 'highlight';
  const isSubtotal = variant === 'subtotal' || isHighlight;
  return (
    <div
      className={
        'flex items-center justify-between gap-3 text-sm px-2 py-1.5 ' +
        (variant === 'nested' ? 'pl-8 text-muted-foreground' : '') +
        (isHighlight
          ? ' mt-1 rounded-sm bg-muted/60 border-t border-b border-border font-semibold'
          : ' border-b last:border-0 border-border/60')
      }
    >
      <span className={isSubtotal ? 'font-semibold text-foreground' : undefined}>{label}</span>
      <span className={isSubtotal ? 'font-semibold text-foreground' : 'font-medium'}>
        {formatCurrency(amount)}
        {percent !== undefined && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({Number(percent).toFixed(1)}%)
          </span>
        )}
      </span>
    </div>
  );
}

export function DailyPnl() {
  const { branches } = useBranchContext();
  const [branch, setBranch] = useState<string>('');
  const [date, setDate] = useState<string>(() => toApiDate(new Date()));
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [data, setData] = useState<DailyPnlData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branch && branches.length > 0) {
      setBranch(branches[0].id);
    }
  }, [branches, branch]);

  useEffect(() => {
    if (!branch) return;
    call<{ message: string[] }>('ury.ury.report_api.financial.get_daily_pnl_dates', { branch })
      .then((res) => {
        const dates = res.message ?? (res as unknown as string[]) ?? [];
        setAvailableDates(dates);
        if (dates.length > 0 && !dates.includes(date)) {
          setDate(dates[0]);
        }
      })
      .catch(() => setAvailableDates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const fetchData = useCallback(async () => {
    if (!branch || !date) return;
    setIsLoading(true);
    try {
      setError(null);
      const res = await call<{ message: DailyPnlData }>('ury.ury.report_api.financial.get_daily_pnl', {
        branch,
        date,
      });
      setData(res.message ?? (res as unknown as DailyPnlData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [branch, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summaryMap = new Map((data?.summary ?? []).map((r) => [r.key, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daily P&amp;L</h1>
          <p className="text-sm text-muted-foreground">Full daily profit &amp; loss breakdown</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-48">
            <SearchableSelect
              id="branch-select"
              value={branch}
              onChange={(_, val) => setBranch(val)}
              options={branches.map((b) => ({
                value: b.id,
                label: b.name,
              }))}
              strict
            />
          </div>
          {availableDates.length > 0 ? (
            <div className="w-40">
              <SearchableSelect
                id="date-select"
                value={date}
                onChange={(_, val) => setDate(val)}
                options={availableDates.map((d) => ({
                  value: d,
                  label: d,
                }))}
                strict
              />
            </div>
          ) : (
            <DatePicker
              id="daily-pnl-date"
              value={date}
              onChange={(_id, val) => setDate(val)}
              className="w-36"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data?.exists ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No submitted Daily P&amp;L exists for this branch/date. It must be created and submitted in Desk first.
        </div>
      ) : (
        <>
          {data.missing_prices && data.missing_prices.length > 0 ? (
            // Structured, collapsed-by-default summary — this is the
            // common case (the "buying price not set" warning the backend
            // generates). Rendering item names as plain React children
            // (never dangerouslySetInnerHTML) keeps this safe even though
            // the source is user-editable Item/Product Bundle names.
            <MissingPricesWarning sections={data.missing_prices} />
          ) : (
            data.remarks && (
              // Fallback for genuine free-text remarks (e.g. hand-typed via
              // Desk) that don't match the known structured warning shape.
              // Still never HTML-rendered — same rationale as above.
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {data.remarks.split(/<br\s*\/?>/i).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Gross Sales"
              value={formatCurrency(summaryMap.get('gross_sales')?.amount ?? 0)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard
              label="Net Sales"
              value={formatCurrency(summaryMap.get('net_sales')?.amount ?? 0)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard
              label="Gross Profit"
              value={`${formatCurrency(summaryMap.get('gross_profit')?.amount ?? 0)} (${Number(
                summaryMap.get('gross_profit')?.percent ?? 0
              ).toFixed(1)}%)`}
              icon={<Percent className="w-4 h-4" />}
            />
            <StatCard
              label="Net Profit"
              value={`${formatCurrency(summaryMap.get('net_profit')?.amount ?? 0)} (${Number(
                summaryMap.get('net_profit')?.percent ?? 0
              ).toFixed(1)}%)`}
              icon={
                (summaryMap.get('net_profit')?.amount ?? 0) >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">P&amp;L Statement</CardTitle>
              <p className="text-xs text-muted-foreground">
                Read top to bottom — each subtotal is a running reduction of the one above it.
              </p>
            </CardHeader>
            <CardContent className="space-y-0">
              {/* Revenue → Net Sales */}
              <WaterfallRow
                label="Gross Sales"
                amount={summaryMap.get('gross_sales')?.amount ?? 0}
                percent={summaryMap.get('gross_sales')?.percent}
              />
              <WaterfallRow
                label="Discounts & Round Offs"
                amount={summaryMap.get('cash_discount_round_off')?.amount ?? 0}
                percent={summaryMap.get('cash_discount_round_off')?.percent}
              />
              <WaterfallRow
                label="Tax"
                amount={summaryMap.get('tax')?.amount ?? 0}
                percent={summaryMap.get('tax')?.percent}
              />
              <WaterfallRow
                label="Net Sales"
                amount={summaryMap.get('net_sales')?.amount ?? 0}
                percent={summaryMap.get('net_sales')?.percent}
                variant="highlight"
              />

              {/* Net Sales → Gross Profit/Loss */}
              <WaterfallRow
                label="Cost of Goods Sold"
                amount={summaryMap.get('cogs')?.amount ?? 0}
                percent={summaryMap.get('cogs')?.percent}
              />
              <WaterfallRow
                label="Direct Expenses"
                amount={summaryMap.get('total_direct_expenses')?.amount ?? 0}
                percent={summaryMap.get('total_direct_expenses')?.percent}
                variant="subtotal"
              />
              {(data.direct_expenses_breakup ?? []).map((r, i) => (
                <WaterfallRow key={`de-${i}`} label={r.label} amount={r.amount} percent={r.percent} variant="nested" />
              ))}
              <WaterfallRow
                label="Gross Profit/Loss"
                amount={summaryMap.get('gross_profit')?.amount ?? 0}
                percent={summaryMap.get('gross_profit')?.percent}
                variant="highlight"
              />

              {/* Gross Profit/Loss → Net Profit/Loss */}
              <WaterfallRow
                label="Employee Cost"
                amount={summaryMap.get('total_employee_costs')?.amount ?? 0}
                percent={summaryMap.get('total_employee_costs')?.percent}
                variant="subtotal"
              />
              {(data.employee_costs_breakup ?? []).map((r, i) => (
                <WaterfallRow key={`ec-${i}`} label={r.label} amount={r.amount} percent={r.percent} variant="nested" />
              ))}
              {(data.indirect_expenses_breakup ?? []).map((r, i) => (
                <WaterfallRow key={`ie-${i}`} label={r.label} amount={r.amount} percent={r.percent} />
              ))}
              <WaterfallRow
                label="Depreciation"
                amount={summaryMap.get('depreciation')?.amount ?? 0}
                percent={summaryMap.get('depreciation')?.percent}
              />
              <WaterfallRow
                label="Other Expenses"
                amount={summaryMap.get('total_other_expenses')?.amount ?? 0}
                percent={summaryMap.get('total_other_expenses')?.percent}
              />
              <WaterfallRow
                label="Total Indirect Expenses"
                amount={summaryMap.get('total_indirect_expenses')?.amount ?? 0}
                percent={summaryMap.get('total_indirect_expenses')?.percent}
                variant="highlight"
              />
              <WaterfallRow
                label="Net Profit/Loss"
                amount={summaryMap.get('net_profit')?.amount ?? 0}
                percent={summaryMap.get('net_profit')?.percent}
                variant="highlight"
              />
            </CardContent>
          </Card>

          {data.cost_of_goods && data.cost_of_goods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost of Goods Sold</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable columns={costOfGoodsColumns} rows={data.cost_of_goods} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
