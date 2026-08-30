import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { call } from '@ury/core';
import { Card, Input } from '@ury/ui';
import { Search, Sun, IndianRupee, Package, Ban, ArrowRight } from 'lucide-react';
import { reportsRegistry, type ReportEntry } from './reportsRegistry';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';

const HISTORY_KEY = 'ury_reports_jump_back_in';
const HISTORY_LIMIT = 3;

interface HistoryEntry {
  path: string;
  label: string;
  category: string;
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Record a report visit at the front of the 'Jump back in' history,
 * de-duplicating by path and capping at HISTORY_LIMIT. */
function recordReportVisit(entry: HistoryEntry) {
  try {
    const existing = readHistory().filter((h) => h.path !== entry.path);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) — history is a
    // convenience, not a requirement, so fail silently.
  }
}

interface DailyPnlSummary {
  exists: boolean;
  summary?: { key: string; amount: number }[];
}

interface DashboardStatsShape {
  todays_sales?: number;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function ReportsHome() {
  const navigate = useNavigate();
  const { activeBranchId, branches } = useBranchContext();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [todaysSales, setTodaysSales] = useState<number | null>(null);
  const [pnl, setPnl] = useState<{ loading: boolean; exists: boolean; netProfit: number | null }>({
    loading: true,
    exists: false,
    netProfit: null,
  });

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  useEffect(() => {
    const branchParam = activeBranchId && activeBranchId !== 'all' ? activeBranchId : undefined;
    call.get<{ message: DashboardStatsShape } | DashboardStatsShape>(
      'ury.ury.api.ury_dashboard.get_dashboard_stats',
      { branch: branchParam }
    )
      .then((res) => {
        const data = (res as { message?: DashboardStatsShape }).message ?? (res as DashboardStatsShape);
        setTodaysSales(typeof data.todays_sales === 'number' ? data.todays_sales : null);
      })
      .catch(() => setTodaysSales(null));
  }, [activeBranchId]);

  useEffect(() => {
    const pnlBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : branches[0]?.id;
    if (!pnlBranch) {
      setPnl({ loading: false, exists: false, netProfit: null });
      return;
    }
    setPnl((p) => ({ ...p, loading: true }));
    call<{ message: DailyPnlSummary } | DailyPnlSummary>('ury.ury.report_api.financial.get_daily_pnl', {
      branch: pnlBranch,
      date: toApiDate(new Date()),
    })
      .then((res) => {
        const data = (res as { message?: DailyPnlSummary }).message ?? (res as DailyPnlSummary);
        const netRow = data.summary?.find((r) => r.key === 'net_profit');
        setPnl({ loading: false, exists: !!data.exists, netProfit: netRow ? netRow.amount : null });
      })
      .catch(() => setPnl({ loading: false, exists: false, netProfit: null }));
  }, [activeBranchId, branches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return reportsRegistry.filter(
      (r) => r.label.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)
    );
  }, [query]);

  const goToReport = (report: Pick<ReportEntry, 'path' | 'label' | 'group'>) => {
    recordReportVisit({ path: report.path, label: report.label, category: report.group });
    navigate(report.path);
  };

  const startHere = [
    {
      id: 'today-sales',
      label: "Today's Sales",
      path: 'today-sales',
      group: 'Sales',
      icon: Sun,
      value: todaysSales !== null ? formatInr(todaysSales) : null,
      fallback: 'Loading…',
    },
    {
      id: 'daily-pnl',
      label: 'Daily P&L',
      path: 'daily-pnl',
      group: 'Finance',
      icon: IndianRupee,
      value: !pnl.loading && pnl.exists && pnl.netProfit !== null ? formatInr(pnl.netProfit) : null,
      fallback: pnl.loading ? 'Loading…' : 'Not yet generated',
    },
    {
      id: 'item-wise-sales',
      label: 'Item Wise Sales',
      path: 'item-wise-sales',
      group: 'Menu & Purchasing',
      icon: Package,
      value: null,
      fallback: null,
    },
    {
      id: 'cancelled-invoices',
      label: 'Cancelled Invoices',
      path: 'cancelled-invoices',
      group: 'Exceptions',
      icon: Ban,
      value: null,
      fallback: null,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">What do you want to understand?</h1>
      <p className="text-muted-foreground mb-6">
        Search any report, or jump straight into one of the most-used ones below. The full list
        is always in the sidebar.
      </p>

      <div className="relative mb-8">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          variant="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports by name or category…"
          className="pl-10 rounded-lg"
          size="lg"
        />
        {query.trim() && (
          <div className="mt-3 border border-border rounded-lg divide-y divide-border overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No reports match {query}.</p>
            ) : (
              filtered.map((report) => {
                const Icon = report.icon;
                return (
                  <Link
                    key={report.id}
                    to={report.path}
                    onClick={() => goToReport(report)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{report.label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{report.group}</span>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>

      {!query.trim() && history.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Jump back in
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {history.map((h) => (
              <Link
                key={h.path}
                to={h.path}
                onClick={() => goToReport({ path: h.path, label: h.label, group: h.category })}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{h.label}</div>
                  <div className="text-xs text-muted-foreground">{h.category}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!query.trim() && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Start here
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {startHere.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  to={card.path}
                  onClick={() => goToReport({ path: card.path, label: card.label, group: card.group })}
                >
                  <Card
                    variant="ghost"
                    className="border border-border shadow-none hover:bg-accent hover:border-input transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[11px]">{card.label}</span>
                    </div>
                    {card.value ? (
                      <div className="text-[25px] font-semibold leading-[1.15] tracking-tight tabular-nums">
                        {card.value}
                      </div>
                    ) : card.fallback ? (
                      <div className="text-sm text-muted-foreground">{card.fallback}</div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        View report
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
