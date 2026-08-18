import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { Card, CardContent, CardHeader, CardTitle, StatCard } from '@ury/ui';
import { IndianRupee, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';

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
  summary?: SummaryRow[];
  direct_expenses_breakup?: BreakupRow[];
  employee_costs_breakup?: BreakupRow[];
  indirect_expenses_breakup?: BreakupRow[];
  cost_of_goods?: CostOfGoodsRow[];
}

const HERO_KEYS = ['gross_sales', 'net_sales', 'gross_profit', 'net_profit'];

function BreakupTable({ title, rows }: { title: string; rows: BreakupRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">
              {formatCurrency(r.amount)} <span className="text-xs text-muted-foreground">({r.percent}%)</span>
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
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="border border-input rounded-md px-3 py-1.5 text-sm"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {availableDates.length > 0 ? (
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-input rounded-md px-3 py-1.5 text-sm"
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-input rounded-md px-3 py-1.5 text-sm"
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
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !data?.exists ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No submitted Daily P&amp;L exists for this branch/date. It must be created and submitted in Desk first.
        </div>
      ) : (
        <>
          {data.remarks && (
            // remarks is built server-side by string-interpolating Item /
            // Product Bundle names (see ury_daily_p_and_l.py's
            // unset_item_prices logic) into an HTML blob with <br> tags —
            // those names are ordinary user-editable fields, so the HTML
            // itself is NOT trustworthy (a malicious Item Name could inject
            // markup). Never use dangerouslySetInnerHTML on this. Split on
            // the one tag we know the backend emits and render each
            // fragment as plain, auto-escaped React text instead.
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.remarks.split(/<br\s*\/?>/i).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
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
              value={formatCurrency(summaryMap.get('gross_profit')?.amount ?? 0)}
              delta={{ value: `${summaryMap.get('gross_profit')?.percent ?? 0}%`, direction: 'flat' }}
              icon={<Percent className="w-4 h-4" />}
            />
            <StatCard
              label="Net Profit"
              value={formatCurrency(summaryMap.get('net_profit')?.amount ?? 0)}
              delta={{
                value: `${summaryMap.get('net_profit')?.percent ?? 0}%`,
                direction: (summaryMap.get('net_profit')?.amount ?? 0) >= 0 ? 'up' : 'down',
              }}
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
            </CardHeader>
            <CardContent className="space-y-1">
              {rest.map((r) => (
                <div key={r.key} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span>{r.label}</span>
                  <span className="font-medium">
                    {formatCurrency(r.amount)} <span className="text-xs text-muted-foreground">({r.percent}%)</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakupTable title="Direct Expenses" rows={data.direct_expenses_breakup ?? []} />
            <BreakupTable title="Employee Costs" rows={data.employee_costs_breakup ?? []} />
            <BreakupTable title="Indirect Expenses" rows={data.indirect_expenses_breakup ?? []} />
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
