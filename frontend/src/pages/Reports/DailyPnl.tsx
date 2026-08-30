import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { Card, CardContent, CardHeader, CardTitle, KpiStrip, Select, Input } from '@ury/ui';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';

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

const HERO_KEYS = ['gross_sales', 'net_sales', 'gross_profit', 'net_profit'];

function MissingPricesWarning({ sections }: { sections: MissingPriceSection[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="rounded-md border border-amber-200 bg-warning-tint text-warning overflow-hidden">
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
              <p className="text-xs font-semibold tracking-wide mb-1.5">
                {s.label} ({s.items.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.items.map((item) => (
                  <span key={item} className="px-2 py-0.5 rounded bg-warning-tint text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-warning">
            Update these item prices, then submit the document again for accurate Cost of Goods.
          </p>
        </div>
      )}
    </div>
  );
}

function BreakupTable({
  title,
  rows,
  className,
  twoColumn,
}: {
  title: string;
  rows: BreakupRow[];
  className?: string;
  twoColumn?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className={twoColumn ? 'grid grid-cols-1 md:grid-cols-2 gap-x-8' : 'space-y-1'}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">
              {formatCurrency(r.amount)}{' '}
              <span className="text-xs text-muted-foreground">({Number(r.percent).toFixed(1)}%)</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
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
  const rest = (data?.summary ?? []).filter((r) => !HERO_KEYS.includes(r.key));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daily P&amp;L</h1>
          <p className="text-sm text-muted-foreground">Full daily profit &amp; loss breakdown</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {availableDates.length > 0 ? (
            <Select
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !data?.exists ? (
        <div className="rounded-md border border-amber-200 bg-warning-tint px-4 py-3 text-sm text-warning">
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
              <div className="rounded-md border border-amber-200 bg-warning-tint px-4 py-3 text-sm text-warning">
                {data.remarks.split(/<br\s*\/?>/i).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )
          )}

          <KpiStrip
            items={[
              { label: 'Gross Sales', value: formatCurrency(summaryMap.get('gross_sales')?.amount ?? 0) },
              { label: 'Net Sales', value: formatCurrency(summaryMap.get('net_sales')?.amount ?? 0) },
              {
                label: 'Gross Profit',
                value: `${formatCurrency(summaryMap.get('gross_profit')?.amount ?? 0)} (${Number(
                  summaryMap.get('gross_profit')?.percent ?? 0
                ).toFixed(1)}%)`,
              },
              {
                label: 'Net Profit',
                value: `${formatCurrency(summaryMap.get('net_profit')?.amount ?? 0)} (${Number(
                  summaryMap.get('net_profit')?.percent ?? 0
                ).toFixed(1)}%)`,
                tone: (summaryMap.get('net_profit')?.amount ?? 0) >= 0 ? 'success' : 'danger',
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">P&amp;L Statement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {rest.map((r) => (
                <div key={r.key} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span>{r.label}</span>
                  <span className="font-medium">
                    {formatCurrency(r.amount)}{' '}
                    <span className="text-xs text-muted-foreground">({Number(r.percent).toFixed(1)}%)</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <BreakupTable title="Direct Expenses" rows={data.direct_expenses_breakup ?? []} className="self-start" />
            <BreakupTable title="Employee Costs" rows={data.employee_costs_breakup ?? []} className="self-start" />
            <BreakupTable
              title="Indirect Expenses"
              rows={data.indirect_expenses_breakup ?? []}
              className="lg:col-span-2"
              twoColumn
            />
          </div>

          {data.cost_of_goods && data.cost_of_goods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost of Goods Sold</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1.5 pr-4">Item</th>
                      <th className="py-1.5 pr-4">Group</th>
                      <th className="py-1.5 pr-4">Qty</th>
                      <th className="py-1.5 pr-4">Buying Price</th>
                      <th className="py-1.5">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cost_of_goods.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">{r.item_name || r.item_code}</td>
                        <td className="py-1.5 pr-4">{r.item_group || '—'}</td>
                        <td className="py-1.5 pr-4">{r.qty}</td>
                        <td className="py-1.5 pr-4">{formatCurrency(r.buying_price)}</td>
                        <td className="py-1.5">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
