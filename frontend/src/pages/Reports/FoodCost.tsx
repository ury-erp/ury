import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, Badge, type DataTableColumn } from '@ury/ui';
import { AlertCircle, ChefHat, Trash2, HelpCircle } from 'lucide-react';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';

interface PlateRow {
  item: string;
  item_name: string;
  course: string | null;
  price: number;
  cost: number | null;
  cost_source: 'bom' | 'manual' | 'none';
  margin: number | null;
  margin_percent: number | null;
  food_cost_percent: number | null;
}

interface PlateSummary {
  total_items: number;
  costed_items: number;
  uncosted_items: number;
  average_food_cost_percent: number | null;
  from_bom: number;
  from_manual: number;
}

interface WasteSummary {
  by_reason: { reason: string; entries: number; total: number }[];
  top_items: { item_code: string; item_name: string; qty: number; total: number }[];
  total: number;
}

/**
 * Where the food money goes: into a plate, or into a bin.
 *
 * The uncosted count is deliberately as prominent as the average. An average
 * food cost over half a menu is a different claim from the same number over
 * all of it, and the gap is the work still to do — hiding it would make the
 * page more comfortable and less true.
 */
const getColumns = (): DataTableColumn<PlateRow>[] => [
  { key: 'item_name', header: t('reports.food_cost.dish') },
  { key: 'course', header: t('reports.food_cost.course'), render: (r) => r.course || '—' },
  { key: 'price', header: t('reports.food_cost.price'), align: 'right', render: (r) => formatCurrency(r.price) },
  {
    key: 'cost',
    header: t('reports.food_cost.cost'),
    align: 'right',
    render: (r) =>
      r.cost === null ? (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {t('reports.food_cost.not_costed')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {formatCurrency(r.cost)}
          <Badge variant="outline" size="sm" className="text-[10px]">
            {t(`reports.food_cost.sources.${r.cost_source}`)}
          </Badge>
        </span>
      ),
  },
  {
    key: 'food_cost_percent',
    header: t('reports.food_cost.food_cost_pct'),
    align: 'right',
    render: (r) =>
      r.food_cost_percent === null ? '—' : (
        // 35% is the usual ceiling a kitchen works to; above it a dish is
        // either mispriced or over-portioned, and that is the whole point of
        // reading this column.
        <span className={r.food_cost_percent > 35 ? 'font-semibold text-red-600' : 'text-emerald-700'}>
          {r.food_cost_percent.toFixed(1)}%
        </span>
      ),
  },
  {
    key: 'margin',
    header: t('reports.food_cost.margin'),
    align: 'right',
    render: (r) => (r.margin === null ? '—' : formatCurrency(r.margin)),
  },
];

export function FoodCost() {
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [plates, setPlates] = useState<PlateRow[]>([]);
  const [summary, setSummary] = useState<PlateSummary | null>(null);
  const [waste, setWaste] = useState<WasteSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const [plateRes, wasteRes] = await Promise.all([
        call<{ message: { items: PlateRow[]; summary: PlateSummary } }>(
          'ury.ury.api.food_cost.get_plate_costs',
        ),
        call<{ message: WasteSummary }>('ury.ury.api.food_cost.get_waste_summary', {
          from_date: toApiDate(range.from),
          to_date: toApiDate(range.to),
        }),
      ]);
      setPlates(plateRes.message?.items ?? []);
      setSummary(plateRes.message?.summary ?? null);
      setWaste(wasteRes.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.food_cost.food_cost')}</h1>
          <p className="text-sm text-muted-foreground">{t('reports.food_cost.subtitle')}</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('reports.food_cost.average_food_cost')}
          value={
            summary?.average_food_cost_percent != null
              ? `${summary.average_food_cost_percent.toFixed(1)}%`
              : '—'
          }
          icon={<ChefHat className="w-4 h-4" />}
        />
        <StatCard
          label={t('reports.food_cost.wasted_in_period')}
          value={formatCurrency(waste?.total ?? 0)}
          icon={<Trash2 className="w-4 h-4" />}
        />
        <StatCard
          label={t('reports.food_cost.dishes_not_costed')}
          value={`${summary?.uncosted_items ?? 0} / ${summary?.total_items ?? 0}`}
          icon={<HelpCircle className="w-4 h-4" />}
        />
      </div>

      {summary && summary.uncosted_items > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('reports.food_cost.uncosted_hint', { count: summary.uncosted_items })}
        </div>
      )}

      {waste && waste.by_reason.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('reports.food_cost.waste_by_reason')}</h2>
          <ul className="space-y-1.5 text-sm">
            {waste.by_reason.map((row) => (
              <li key={row.reason} className="flex items-center justify-between">
                <span>{t(`reports.food_cost.reasons.${row.reason}`)}</span>
                <span className="font-mono font-semibold">{formatCurrency(row.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataTable
        columns={getColumns()}
        rows={plates}
        isLoading={isLoading}
        emptyMessage={t('reports.food_cost.no_menu_items')}
      />
    </div>
  );
}
