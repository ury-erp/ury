import React, { useEffect, useState } from 'react';
import { Page, Section, Panel, Spinner, Input, Button, KpiStrip, DataTable, StatusDot, numericCellClass, type DataTableColumn, type KpiItemProps } from '@ury/ui';
import { call, getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import {
  departmentProfitabilityService,
  PlanVsActualResult,
  PlanVsActualRow,
} from '../../services/departmentProfitability';
import { uryDashboardService, DailyPnlSummary, PlanStatus } from '../../services/dashboard';

/**
 * Day-close overview page. Ties together three things:
 *  - a real KPI strip from `getDailyPnlSummary` / `getPlanStatus`
 *  - a real plan-vs-actual DataTable from `getPlanVsActual` (same backend
 *    and visual language as DepartmentProfitabilityPage.tsx)
 *  - two HONEST STUB sections: a close-day blocker checklist and an
 *    "Apply to next plan" action. Neither has a backend endpoint anywhere
 *    in `frontend/src/services` as of this writing -- they are rendered as
 *    explicit "not yet available" placeholders, not fake-functional UI.
 *
 * Company is derived from the selected branch (same pattern as
 * DepartmentProfitabilityPage.tsx / DepartmentStockPage.tsx), never free
 * text.
 */

const NO_ACCESS_ROLES = new Set(['Cashier', 'URY Cashier', 'Captain', 'URY Captain']);
const FULL_ACCESS_ROLES = new Set(['Administrator', 'System Manager']);

type LoadState = 'loading' | 'empty' | 'populated' | 'error' | 'denied';

const useCurrentRoles = () => {
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const email = await getLoggedUser();
      if (!email) {
        if (!cancelled) setRoles([]);
        return;
      }
      const { roles: userRoles } = await getUserRoles(email);
      if (!cancelled) setRoles(userRoles);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return roles;
};

const formatCurrency = (value: number | undefined): string =>
  value === undefined ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const varianceTone = (variance: number): 'success' | 'warning' | 'danger' | 'neutral' => {
  if (variance === 0) return 'neutral';
  return variance > 0 ? 'warning' : 'danger';
};

const planVsActualColumns: DataTableColumn<PlanVsActualRow>[] = [
  { key: 'department', header: 'Department' },
  { key: 'item_or_component', header: 'Item' },
  {
    key: 'planned_qty',
    header: 'Planned Qty',
    align: 'right',
    render: (row) => <span className={numericCellClass}>{row.planned_qty}</span>,
  },
  {
    key: 'actual_qty',
    header: 'Actual Qty',
    align: 'right',
    render: (row) => <span className={numericCellClass}>{row.actual_qty}</span>,
  },
  {
    key: 'qty_variance',
    header: 'Variance',
    align: 'right',
    render: (row) => (
      <span className="inline-flex items-center justify-end gap-2">
        <StatusDot tone={varianceTone(row.qty_variance)} />
        <span className={numericCellClass}>
          {row.qty_variance > 0 ? '+' : ''}
          {row.qty_variance}
        </span>
      </span>
    ),
  },
];

export const DayClosePage: React.FC = () => {
  const { activeBranch, selectedBranch } = useBranchContext();
  const roles = useCurrentRoles();

  const [company, setCompany] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [pnlSummary, setPnlSummary] = useState<DailyPnlSummary | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [planVsActual, setPlanVsActual] = useState<PlanVsActualResult | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isDenied = roles !== null && !roles.some((r) => FULL_ACCESS_ROLES.has(r)) && roles.some((r) => NO_ACCESS_ROLES.has(r));

  const branch = selectedBranch !== 'all' ? selectedBranch : activeBranch?.id || '';

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
        const res = await call<{ message?: { company?: string }; company?: string }>(
          'frappe.client.get_value',
          {
            doctype: 'Branch',
            filters: branch,
            fieldname: 'company',
          }
        );
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

  const load = async () => {
    if (!branch || !company || !serviceDate) {
      setState('empty');
      return;
    }
    setState('loading');
    setErrorMessage('');
    try {
      const [pnlResult, planStatusResult, planVsActualResult] = await Promise.all([
        uryDashboardService.getDailyPnlSummary(branch, serviceDate),
        uryDashboardService.getPlanStatus(branch, serviceDate),
        departmentProfitabilityService.getPlanVsActual({
          company,
          branch,
          service_date_or_period: serviceDate,
        }),
      ]);
      setPnlSummary(pnlResult);
      setPlanStatus(planStatusResult);
      setPlanVsActual(planVsActualResult);
      const hasRows = (planVsActualResult.rows?.length || 0) > 0;
      setState(hasRows || pnlResult?.exists ? 'populated' : 'empty');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load day-close data';
      setErrorMessage(message);
      setState('error');
    }
  };

  useEffect(() => {
    if (roles === null) return; // wait for role resolution before first load
    if (isDenied) {
      setState('denied');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, company, branch, serviceDate]);

  if (roles === null || state === 'loading') {
    return (
      <Page>
        <div className="flex items-center justify-center p-12" data-testid="close-day-loading">
          <Spinner />
        </div>
      </Page>
    );
  }

  if (isDenied || state === 'denied') {
    return (
      <Page>
        <Panel pad data-testid="close-day-denied">
          <p className="text-sm text-muted-foreground">You do not have access to day-close reporting.</p>
        </Panel>
      </Page>
    );
  }

  if (!branch) {
    return (
      <Page data-testid="day-close-page">
        <Section>
          <Panel pad data-testid="close-day-select-branch">
            <p className="text-sm text-muted-foreground">Select a specific branch above to view its day-close status.</p>
          </Panel>
        </Section>
      </Page>
    );
  }

  const kpiItems: KpiItemProps[] = pnlSummary?.exists
    ? (pnlSummary.summary || []).map((field) => ({
        label: field.label,
        value: formatCurrency(field.amount),
        hint: `${field.percent.toFixed(1)}% of sales`,
      }))
    : [
        {
          label: 'Daily P&L',
          value: '—',
          hint: pnlSummary ? 'No P&L posted for this date yet' : undefined,
        },
      ];

  kpiItems.push({
    label: 'Sales Plan Status',
    value: planStatus?.status || 'Not started',
    hint: planStatus?.name || undefined,
  });

  return (
    <Page data-testid="day-close-page">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Company</label>
          <Input value={company} disabled placeholder="Derived from branch" data-testid="close-day-company" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Service Date</label>
          <Input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <Button onClick={load}>Refresh</Button>
      </div>

      {state === 'error' && (
        <Section>
          <Panel pad data-testid="close-day-error">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </Panel>
        </Section>
      )}

      <Section>
        <KpiStrip items={kpiItems} data-testid="close-day-kpi-strip" />
      </Section>

      {state === 'empty' && (
        <Section>
          <Panel pad data-testid="close-day-empty">
            <p className="text-sm text-muted-foreground">
              No plan-vs-actual data for this company/branch/service date. Check that an approved Sales Plan exists for
              this scope.
            </p>
          </Panel>
        </Section>
      )}

      {state === 'populated' && planVsActual && (
        <Section>
          <Panel pad data-testid="close-day-plan-vs-actual">
            <h3 className="text-sm font-semibold mb-2">Plan vs Actual</h3>
            {planVsActual.reason && (
              <p className="text-xs text-warning mb-2" data-testid="close-day-plan-vs-actual-reason">
                {planVsActual.reason}
              </p>
            )}
            <DataTable columns={planVsActualColumns} rows={planVsActual.rows} emptyMessage="No plan-vs-actual rows for this scope." />
          </Panel>
        </Section>
      )}

      {/* Honest stub: no close-day blocker checklist endpoint exists yet
          anywhere in frontend/src/services. Do not fabricate checklist
          items or interactive checkboxes that would not persist. */}
      <Section>
        <Panel pad data-testid="close-day-checklist-stub">
          <h3 className="text-sm font-semibold mb-2">Close Day Checklist</h3>
          <p className="text-sm text-muted-foreground">
            The close-day blocker checklist (open tables, unposted production, closing counts, wastage sign-off) is not
            yet available -- there is no backend endpoint for it. This section will populate once that API exists.
          </p>
        </Panel>
      </Section>

      {/* Honest stub: no "apply to next plan" mutation endpoint exists yet.
          Disabled button, not a functional-looking no-op. */}
      <Section>
        <Panel pad data-testid="close-day-apply-to-plan-stub">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold mb-1">Apply to Next Plan</h3>
              <p className="text-sm text-muted-foreground">
                Carrying today's variance into tomorrow's sales plan is not wired up yet -- no backend endpoint exists
                for it.
              </p>
            </div>
            <Button disabled title="Not yet available: no backend endpoint exists for this action" data-testid="close-day-apply-to-plan-button">
              Apply to Next Plan
            </Button>
          </div>
        </Panel>
      </Section>
    </Page>
  );
};

export default DayClosePage;
