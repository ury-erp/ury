import React, { useEffect, useState } from 'react';
import { Page, Section, Panel, Spinner, Input, Button, Select } from '@ury/ui';
import { call, getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import {
  departmentProfitabilityService,
  DepartmentProfitabilityResult,
  PlanVsActualResult,
  ProfitabilityRow,
} from '../../services/departmentProfitability';
import { departmentStockService, DepartmentOption } from '../../services/departmentStock';

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
 *
 * Company and Department are both derived rather than free text: Company
 * comes from the branch selected in the global branch context (mirrors the
 * `Branch.company` lookup the backend itself enforces in
 * `ury_department_profitability._require_branch_in_company`), and
 * Department is a real dropdown scoped to that branch, reusing the same
 * `URY Production Department` lookup as `DepartmentStockPage.tsx`
 * (`departmentStockService.listDepartments`).
 */

const NO_ACCESS_ROLES = new Set(['Cashier', 'URY Cashier', 'Captain', 'URY Captain']);
const QUANTITY_ONLY_ROLES = new Set(['Chef', 'URY Chef', 'Production', 'URY Production']);
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

export const DepartmentProfitabilityPage: React.FC = () => {
  const { activeBranch, selectedBranch } = useBranchContext();
  const roles = useCurrentRoles();

  const [company, setCompany] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState<string>('');
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([]);

  const [profitability, setProfitability] = useState<DepartmentProfitabilityResult | null>(null);
  const [planVsActual, setPlanVsActual] = useState<PlanVsActualResult | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const hasFullAccess = roles !== null && roles.some((r) => FULL_ACCESS_ROLES.has(r));
  const isDenied = roles !== null && !hasFullAccess && roles.some((r) => NO_ACCESS_ROLES.has(r));
  const canSeeCost = roles !== null && (hasFullAccess || !roles.some((r) => QUANTITY_ONLY_ROLES.has(r)));

  const branch = selectedBranch !== 'all' ? selectedBranch : activeBranch?.id || '';

  // Company is derived from the selected branch, never entered by hand --
  // mirrors the Branch -> Company lookup the backend already enforces.
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

  // Department options are scoped to the selected branch, reusing the
  // exact lookup DepartmentStockPage already relies on.
  useEffect(() => {
    let cancelled = false;
    setDepartment('');
    if (!branch) {
      setDepartmentOptions([]);
      return;
    }
    departmentStockService
      .listDepartments(branch)
      .then((rows) => {
        if (!cancelled) setDepartmentOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setDepartmentOptions([]);
      });
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
      <Page>
        <div className="flex items-center justify-center p-12" data-testid="profitability-loading">
          <Spinner />
        </div>
      </Page>
    );
  }

  if (isDenied || state === 'denied') {
    return (
      <Page>
        <Panel pad data-testid="profitability-denied">
          <p className="text-sm text-muted-foreground">
            You do not have access to department profitability reporting.
          </p>
        </Panel>
      </Page>
    );
  }

  if (!branch) {
    return (
      <Page data-testid="department-profitability-page">
        <Section>
          <Panel pad data-testid="profitability-select-branch">
            <p className="text-sm text-muted-foreground">
              Select a specific branch above to view its department profitability.
            </p>
          </Panel>
        </Section>
      </Page>
    );
  }

  return (
    <Page data-testid="department-profitability-page">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Company</label>
          <Input value={company} disabled placeholder="Derived from branch" data-testid="profitability-company" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Service Date / Period</label>
          <Input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="profitability-department">
            Department (optional)
          </label>
          <Select
            id="profitability-department"
            aria-label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            data-testid="profitability-department-select"
          >
            <option value="">All departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept.name} value={dept.name}>
                {dept.department_name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={load} variant="chrome">Refresh</Button>
      </div>

      {state === 'error' && (
        <Section>
          <Panel pad data-testid="profitability-error">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </Panel>
        </Section>
      )}

      {state === 'empty' && (
        <Section>
          <Panel pad data-testid="profitability-empty">
            <p className="text-sm text-muted-foreground">
              No data for this company/branch/service date. Check that an approved Sales Plan exists for this scope.
            </p>
          </Panel>
        </Section>
      )}

      {state === 'populated' && profitability && (
        <Section>
          <Panel pad data-testid="profitability-table">
            <h3 className="text-sm font-semibold mb-2">Department Profitability</h3>
            {profitability.reason && (
              <p className="text-xs text-warning mb-2" data-testid="profitability-reason">
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
                    {canSeeCost && (
                      <th className="p-2" title="Gross profit using today's actual recorded cost for this item">
                        Posted GP
                      </th>
                    )}
                    {canSeeCost && (
                      <th className="p-2" title="Gross profit if cost matched the standard recipe (BOM) cost exactly">
                        Theoretical GP
                      </th>
                    )}
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
          </Panel>
        </Section>
      )}

      {state === 'populated' && planVsActual && (
        <Section>
          <Panel pad data-testid="plan-vs-actual-table">
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
          </Panel>
        </Section>
      )}
    </Page>
  );
};

export default DepartmentProfitabilityPage;
