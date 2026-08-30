import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { DollarSign, Users, TrendingUp, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface CommissionSettings {
  enabled: boolean;
  commission_base: string;
  attribution_mode: string;
  include_returns: boolean;
  tier_period: string;
  default_rate: number;
  rules: unknown[];
}

interface Period {
  period: string;
  branch: string;
  base: number;
  rate: number;
  commission: number;
}

interface EmployeeCommissionRow {
  rank: number;
  employee: string;
  employee_name: string;
  designation: string | null;
  attributed_invoices: number;
  weighted_invoices: number;
  attributed_base: number;
  effective_rate: number;
  rate_source: string | null;
  commission_amount: number;
  periods: Period[];
}

interface UnattributedData {
  invoices: number;
  base: number;
}

interface EmployeeCommissionSummary {
  total_employees: number;
  total_base: number;
  total_commission: number;
}

interface EmployeeCommissionData {
  settings: CommissionSettings;
  tier_period_partial: boolean;
  employees: EmployeeCommissionRow[];
  unattributed: UnattributedData;
  summary: EmployeeCommissionSummary;
}

const columns: DataTableColumn<EmployeeCommissionRow>[] = [
  { key: 'rank', header: '#', align: 'center' },
  { key: 'employee_name', header: 'Employee' },
  { key: 'designation', header: 'Designation', render: (r) => r.designation || '—' },
  { key: 'attributed_invoices', header: 'Invoices', align: 'right' },
  { key: 'attributed_base', header: 'Attributed Base', render: (r) => formatCurrency(r.attributed_base), align: 'right' },
  { key: 'effective_rate', header: 'Effective Rate', render: (r) => `${r.effective_rate.toFixed(2)}%`, align: 'right' },
  { key: 'rate_source', header: 'Rate Source', render: (r) => r.rate_source && <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">{r.rate_source}</span> },
  { key: 'commission_amount', header: 'Commission', render: (r) => <span className="font-semibold">{formatCurrency(r.commission_amount)}</span>, align: 'right' },
];

export function EmployeeCommission() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<EmployeeCommissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: EmployeeCommissionData }>('ury.ury.report_api.commission.get_employee_commission', {
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
        branch,
      });
      setData(res.message ?? (res as unknown as EmployeeCommissionData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRowClick = async (employee: EmployeeCommissionRow) => {
    if (expandedEmployee === employee.employee) {
      setExpandedEmployee(null);
      setDetailData(null);
      return;
    }

    setExpandedEmployee(employee.employee);
    setDetailLoading(true);
    try {
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: unknown }>('ury.ury.report_api.commission.get_employee_commission_detail', {
        employee: employee.employee,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
        branch,
      });
      setDetailData(res.message ?? res);
    } catch (err) {
      console.error('Failed to load detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const top10 = data?.employees.slice(0, 10) ?? [];
  const blendedRate = data?.summary.total_commission && data.summary.total_base
    ? (data.summary.total_commission / data.summary.total_base) * 100
    : 0;

  // If commission tracking is disabled
  if (data && !data.settings.enabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold">Employee Commission</h1>
            <p className="text-sm text-muted-foreground">
              Commission tracking {activeBranchId === 'all' ? '· All Branches' : ''}
            </p>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>

        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
          <DollarSign className="w-12 h-12 text-gray-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Commission Tracking is Not Enabled</h2>
          <p className="text-sm text-gray-600 mb-6 text-center max-w-sm">
            Enable commission tracking in settings to see employee commission data.
          </p>
          <a
            href="/commission-settings"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Employee Commission</h1>
          <p className="text-sm text-muted-foreground">
            Commission breakdown by employee {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Unattributed invoices warning */}
          {data.unattributed.invoices > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.unattributed.invoices} invoices ({formatCurrency(data.unattributed.base)}) could not be attributed to an employee. Set the Employee record's linked User first, then re-run the attribution backfill.
            </div>
          )}

          {/* Tier period warning */}
          {data.tier_period_partial && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Tier attainment is provisional for a partial period — rates may change once the full period is included.
            </div>
          )}

          {/* Policy strip */}
          <div className="text-xs text-muted-foreground bg-gray-50 rounded-md px-3 py-2 border border-gray-200">
            <span className="font-medium">Commission Base:</span> {data.settings.commission_base} ·
            <span className="font-medium ml-2">Attribution:</span> {data.settings.attribution_mode} ·
            {data.settings.include_returns && <span className="font-medium ml-2">Includes Returns</span>}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard label="Total Commission" value={formatCurrency(data.summary.total_commission)} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard label="Total Attributed Base" value={formatCurrency(data.summary.total_base)} icon={<TrendingUp className="w-4 h-4" />} />
            <StatCard label="Employees Earning" value={data.summary.total_employees} icon={<Users className="w-4 h-4" />} />
            <StatCard label="Effective Blended Rate" value={`${blendedRate.toFixed(2)}%`} icon={<Percent className="w-4 h-4" />} />
          </div>

          {/* Top 10 chart */}
          {top10.length >= 2 && (
            <BarChartCard
              title={`Top ${Math.min(10, top10.length)} Earners by Commission`}
              data={top10}
              xKey="employee_name"
              yKeys={['commission_amount']}
              labels={{ commission_amount: 'Commission Amount' }}
            />
          )}
        </>
      )}

      {/* Data table with clickable rows */}
      <div className="space-y-0">
        <DataTable
          columns={columns}
          rows={data?.employees ?? []}
          isLoading={isLoading}
          onRowClick={(row) => handleRowClick(row)}
          rowClassName={(row) => expandedEmployee === row.employee ? 'bg-blue-50' : ''}
        />

        {/* Expanded detail section */}
        {expandedEmployee && (
          <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Period Details</h3>
              <button
                onClick={() => {
                  setExpandedEmployee(null);
                  setDetailData(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="text-sm text-muted-foreground">Loading details…</div>
            ) : detailData && typeof detailData === 'object' ? (
              <div className="space-y-2">
                {Array.isArray((detailData as any).periods) ? (
                  (detailData as any).periods.map((period: Period, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-blue-200">
                      <div>
                        <span className="font-medium">{period.period}</span>
                        {period.branch && <span className="text-muted-foreground ml-2">({period.branch})</span>}
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-muted-foreground">Base: </span>
                          <span className="font-medium">{formatCurrency(period.base)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Rate: </span>
                          <span className="font-medium">{period.rate.toFixed(2)}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Commission: </span>
                          <span className="font-medium">{formatCurrency(period.commission)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">No period data available</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Failed to load details</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmployeeCommission;
