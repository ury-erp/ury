import React, { useEffect, useState } from 'react';
import { Card, Spinner, Input, Button } from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import {
  departmentProfitabilityService,
  DepartmentProfitabilityResult,
  PlanVsActualResult,
  ProfitabilityRow,
} from '../../services/departmentProfitability';

/**
 * Additive, unwired reporting page (V3-80): department profitability and
 * plan-vs-actual. Not linked from any nav/menu by this task -- reachable
 * only by direct route/import, per the conservative-scope brief.
 *
 * Cost/profit fields are role-gated on the CLIENT the same way the SERVER
 * gates them: for a quantity-only role the backend never sends the fields
 * at all (see departmentProfitability.ts), so `canSeeCost` here only
 * controls whether the *columns* are rendered -- there is never a value to
 * hide, because there is never a value present for that tier.
 */

const NO_ACCESS_ROLES = new Set(['Cashier', 'URY Cashier', 'Captain', 'URY Captain']);
const QUANTITY_ONLY_ROLES = new Set(['Chef', 'URY Chef', 'Production', 'URY Production']);

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

export const DepartmentProfitabilityPage: React.FC = () => {
  const { activeBranch, selectedBranch } = useBranchContext();
  const roles = useCurrentRoles();

  const [company, setCompany] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState<string>('');

  const [profitability, setProfitability] = useState<DepartmentProfitabilityResult | null>(null);
  const [planVsActual, setPlanVsActual] = useState<PlanVsActualResult | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isDenied = roles !== null && roles.some((r) => NO_ACCESS_ROLES.has(r));
  const canSeeCost = roles !== null && !roles.some((r) => QUANTITY_ONLY_ROLES.has(r));

  const branch = selectedBranch !== 'all' ? selectedBranch : activeBranch?.id || '';

  const load = async () => {
    if (!branch || !serviceDate) {
      setState('empty');
      return;
    }
    setState('loading');
    setErrorMessage('');
    try {
      const [profitabilityResult, planResult] = await Promise.all([
        departmentProfitabilityService.getDepartmentProfitability({
          company,
          branch,
          service_date_or_period: serviceDate,
          department: department || undefined,
        }),
        departmentProfitabilityService.getPlanVsActual({
          company,
          branch,
          service_date_or_period: serviceDate,
          department: department || undefined,
        }),
      ]);
      setProfitability(profitabilityResult);
      setPlanVsActual(planResult);
      const hasRows = (profitabilityResult.rows?.length || 0) > 0 || (planResult.rows?.length || 0) > 0;
      setState(hasRows ? 'populated' : 'empty');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load department profitability');
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
  }, [roles, company, branch, serviceDate, department]);

  if (roles === null || state === 'loading') {
    return (
      <div className="flex items-center justify-center p-12" data-testid="profitability-loading">
        <Spinner />
      </div>
    );
  }

  if (isDenied || state === 'denied') {
    return (
      <Card className="p-6" data-testid="profitability-denied">
        <p className="text-sm text-muted-foreground">
          You do not have access to department profitability reporting.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4" data-testid="department-profitability-page">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Company</label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Service Date / Period</label>
          <Input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Department (optional)</label>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
        </div>
        <Button onClick={load}>Refresh</Button>
      </div>

      {state === 'error' && (
        <Card className="p-4" data-testid="profitability-error">
          <p className="text-sm text-red-600">{errorMessage}</p>
        </Card>
      )}

      {state === 'empty' && (
        <Card className="p-6" data-testid="profitability-empty">
          <p className="text-sm text-muted-foreground">
            No data for this company/branch/service date. Provide a company, branch, and service date, or check
            that an approved Sales Plan exists for this scope.
          </p>
        </Card>
      )}

      {state === 'populated' && profitability && (
        <Card className="p-4" data-testid="profitability-table">
          <h3 className="text-sm font-semibold mb-2">Department Profitability</h3>
          {profitability.reason && (
            <p className="text-xs text-amber-600 mb-2" data-testid="profitability-reason">
              {profitability.reason}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">Department</th>
                  <th className="p-2">Item</th>
                  <th className="p-2">Net Revenue</th>
                  {canSeeCost && <th className="p-2">Posted Cost</th>}
                  {canSeeCost && <th className="p-2">Theoretical Cost</th>}
                  {canSeeCost && <th className="p-2">Posted GP</th>}
                  {canSeeCost && <th className="p-2">Theoretical GP</th>}
                  {canSeeCost && <th className="p-2">Variance</th>}
                </tr>
              </thead>
              <tbody>
                {profitability.rows.map((row: ProfitabilityRow, idx: number) => (
                  <tr key={`${row.item_or_component}-${idx}`} className="border-t">
                    <td className="p-2">{row.department}</td>
                    <td className="p-2">{row.item_or_component}</td>
                    <td className="p-2">{formatCurrency(row.net_revenue)}</td>
                    {canSeeCost && <td className="p-2">{formatCurrency(row.posted_cost)}</td>}
                    {canSeeCost && <td className="p-2">{formatCurrency(row.theoretical_cost)}</td>}
                    {canSeeCost && <td className="p-2">{formatCurrency(row.posted_gross_profit)}</td>}
                    {canSeeCost && <td className="p-2">{formatCurrency(row.theoretical_gross_profit)}</td>}
                    {canSeeCost && <td className="p-2">{formatCurrency(row.variance)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {state === 'populated' && planVsActual && (
        <Card className="p-4" data-testid="plan-vs-actual-table">
          <h3 className="text-sm font-semibold mb-2">Plan vs Actual</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">Department</th>
                  <th className="p-2">Item</th>
                  <th className="p-2">Planned Qty</th>
                  <th className="p-2">Actual Qty</th>
                  <th className="p-2">Variance</th>
                </tr>
              </thead>
              <tbody>
                {planVsActual.rows.map((row, idx) => (
                  <tr key={`${row.item_or_component}-${idx}`} className="border-t">
                    <td className="p-2">{row.department}</td>
                    <td className="p-2">{row.item_or_component}</td>
                    <td className="p-2">{row.planned_qty}</td>
                    <td className="p-2">{row.actual_qty}</td>
                    <td className="p-2">{row.qty_variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DepartmentProfitabilityPage;
