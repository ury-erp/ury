import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AttentionFeed,
  AttentionItemProps,
  Card,
  DataTable,
  DataTableColumn,
  KpiStrip,
  Spinner,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { ShiftMetrics, uryDashboardService } from '../../services/dashboard';
import {
  departmentProfitabilityService,
  ProfitabilityRow,
} from '../../services/departmentProfitability';

/**
 * Service page: the real-time "how is the shift going right now" view.
 * Mirrors the target IA from the ury-app.html mockup -- KPI strip, a ranked
 * Needs-attention feed with inline resolve actions, then a live Departments
 * table -- but every number here comes from a real backend field. Anything
 * the mockup shows that has no backend source today (unavailable ₹, wastage
 * %, per-department production-progress) is simply omitted rather than
 * fabricated.
 */

const getToday = () => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

const formatCurrency = (value: number | undefined): string =>
  value === undefined || Number.isNaN(value)
    ? '—'
    : `₹${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const severityForItem = (severity: string): AttentionItemProps['severity'] => {
  const normalized = severity.toLowerCase();
  if (normalized === 'blocking' || normalized === 'critical' || normalized === 'error') return 'blocking';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  return 'info';
};

interface DepartmentRow {
  department: string;
  netRevenue: number;
  postedCost?: number;
  postedGrossProfit?: number;
}

const aggregateDepartments = (rows: ProfitabilityRow[]): DepartmentRow[] => {
  const byDepartment = new Map<string, DepartmentRow>();
  for (const row of rows) {
    const existing = byDepartment.get(row.department);
    if (existing) {
      existing.netRevenue += row.net_revenue ?? 0;
      if (row.posted_cost !== undefined) {
        existing.postedCost = (existing.postedCost ?? 0) + row.posted_cost;
      }
      if (row.posted_gross_profit !== undefined) {
        existing.postedGrossProfit = (existing.postedGrossProfit ?? 0) + row.posted_gross_profit;
      }
    } else {
      byDepartment.set(row.department, {
        department: row.department,
        netRevenue: row.net_revenue ?? 0,
        postedCost: row.posted_cost,
        postedGrossProfit: row.posted_gross_profit,
      });
    }
  }
  return Array.from(byDepartment.values()).sort((a, b) => b.netRevenue - a.netRevenue);
};

export const ServicePage: React.FC = () => {
  const { activeBranchId, selectedBranch, activeBranch } = useBranchContext();
  const navigate = useNavigate();

  const branch = selectedBranch !== 'all' ? selectedBranch : activeBranch?.id || '';

  const [company, setCompany] = useState<string>('');
  const [shiftMetrics, setShiftMetrics] = useState<ShiftMetrics | null>(null);
  const [needsAttention, setNeedsAttention] = useState<AttentionItemProps[]>([]);
  const [departmentRows, setDepartmentRows] = useState<DepartmentRow[]>([]);
  const [hasCostData, setHasCostData] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Company is derived from the selected branch, never entered by hand --
  // mirrors DepartmentProfitabilityPage.tsx's Branch -> Company lookup.
  useEffect(() => {
    let cancelled = false;
    if (!branch) {
      setCompany('');
      return;
    }
    (async () => {
      try {
        const res = await call<any>('frappe.client.get_value', {
          doctype: 'Branch',
          filters: branch,
          fieldname: 'company',
        });
        const value = res?.message?.company ?? res?.company ?? '';
        if (!cancelled) setCompany(value || '');
      } catch {
        if (!cancelled) setCompany('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  useEffect(() => {
    let cancelled = false;

    if (!activeBranchId || activeBranchId === 'all') {
      setShiftMetrics(null);
      setNeedsAttention([]);
      setDepartmentRows([]);
      setError('Select a specific branch above to view its Service page.');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [metrics, attention] = await Promise.all([
          uryDashboardService.getShiftMetrics(activeBranchId),
          uryDashboardService.getNeedsAttention(activeBranchId),
        ]);
        if (cancelled) return;

        setShiftMetrics(metrics);
        setNeedsAttention(
          attention.map((item) => {
            const mapped: AttentionItemProps = {
              severity: severityForItem(item.severity),
              title: item.message,
              detail: item.type,
            };
            // Only wire an inline action where a real destination exists --
            // stock/wastage issues route into the live Department Stock
            // page (which already handles authorization/wastage capture),
            // scoped by branch. No dead "Produce"/"Amend plan" buttons.
            const referenceDoctype = item.reference?.doctype?.toLowerCase() || '';
            if (
              referenceDoctype.includes('issue authorization') ||
              referenceDoctype.includes('stock movement') ||
              referenceDoctype.includes('wastage')
            ) {
              mapped.action = {
                label: 'Review',
                onClick: () => navigate('/department-stock'),
              };
            } else if (referenceDoctype.includes('sales plan')) {
              mapped.action = {
                label: 'Review',
                onClick: () => navigate('/sales-plan'),
              };
            }
            return mapped;
          })
        );
      } catch (err) {
        if (!cancelled) {
          setError('Unable to load Service page data.');
          setShiftMetrics(null);
          setNeedsAttention([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, navigate]);

  // Departments table: live per-department profitability for today, scoped
  // to the branch/company once company has been resolved.
  useEffect(() => {
    let cancelled = false;
    if (!branch || !company) {
      setDepartmentRows([]);
      setHasCostData(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const result = await departmentProfitabilityService.getDepartmentProfitability({
          company,
          branch,
          service_date_or_period: getToday(),
        });
        if (cancelled) return;
        const rows = result.rows || [];
        setDepartmentRows(aggregateDepartments(rows));
        setHasCostData(rows.some((row) => row.posted_cost !== undefined));
      } catch {
        if (!cancelled) {
          setDepartmentRows([]);
          setHasCostData(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branch, company]);

  const kpiItems = useMemo(() => {
    if (!shiftMetrics) return [];
    const items = [
      { label: 'Net Sales', value: formatCurrency(shiftMetrics.sales) },
      { label: 'Covers', value: shiftMetrics.covers.toLocaleString() },
      { label: 'Avg / Cover', value: formatCurrency(shiftMetrics.avg_per_cover) },
    ];
    // avg_ticket_minutes has a real backend field but is a duration, not a
    // currency amount -- surfaced separately with its own unit rather than
    // folded into avg ticket value like the mockup's "Avg ticket" KPI (which
    // has no equivalent real field here).
    if (shiftMetrics.avg_ticket_minutes !== undefined && shiftMetrics.avg_ticket_minutes !== null) {
      items.push({ label: 'Avg Ticket Time', value: `${shiftMetrics.avg_ticket_minutes.toFixed(0)} min` });
    }
    return items;
  }, [shiftMetrics]);

  const departmentColumns: DataTableColumn<DepartmentRow>[] = useMemo(() => {
    const columns: DataTableColumn<DepartmentRow>[] = [
      { key: 'department', header: 'Department' },
      {
        key: 'netRevenue',
        header: 'Net Sales',
        align: 'right',
        render: (row) => <span className={numericCellClass}>{formatCurrency(row.netRevenue)}</span>,
      },
    ];
    // Cost/profit columns are omitted entirely for quantity-only roles --
    // the backend never sends posted_cost for that tier, so there is never
    // a real value to show (mirrors DepartmentProfitabilityPage.tsx).
    if (hasCostData) {
      columns.push({
        key: 'postedCost',
        header: 'Posted Cost',
        align: 'right',
        render: (row) => <span className={numericCellClass}>{formatCurrency(row.postedCost)}</span>,
      });
      columns.push({
        key: 'postedGrossProfit',
        header: 'Posted GP',
        align: 'right',
        render: (row) => <span className={numericCellClass}>{formatCurrency(row.postedGrossProfit)}</span>,
      });
    }
    return columns;
  }, [hasCostData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="service-loading">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6" data-testid="service-error">
        <p className="text-sm text-muted-foreground">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="service-page">
      {kpiItems.length > 0 && <KpiStrip items={kpiItems} />}

      <AttentionFeed title="Needs Attention" items={needsAttention} />

      <Card className="p-4" data-testid="service-departments-table">
        <h3 className="text-sm font-semibold mb-2">Departments</h3>
        <DataTable
          columns={departmentColumns}
          rows={departmentRows}
          emptyMessage="No department activity for today yet."
        />
      </Card>
    </div>
  );
};

export default ServicePage;
