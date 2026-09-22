import React, { useCallback, useEffect, useState } from 'react';
import {
  Page,
  Section,
  DataTable,
  DataTableColumn,
  Card,
  Autocomplete,
  type AutocompleteOption,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { searchLinkOptions, withSelectedOption } from '../../services/linkSearch';
import { menuAvailabilityService } from '../../services/menuAvailability';

interface ComplianceRow {
  item: string;
  cadence: string;
  required_count: number;
  completed_count: number;
  // null when required_count === 0: no checks were required in the window, so
  // compliance is NOT MEASURABLE (rendered "N/A", excluded from any average).
  compliance_percent: number | null;
  attached_count: number;
}

const ALL_BRANCHES_OPTION: AutocompleteOption = { value: '', label: 'All branches' };

const getComplianceColor = (percent: number | null): string => {
  if (percent === null || percent === undefined) return 'text-muted-foreground';
  if (percent >= 80) return 'text-green-600';
  if (percent >= 50) return 'text-yellow-600';
  return 'text-red-600';
};

const formatCompliance = (percent: number | null): string =>
  percent === null || percent === undefined ? 'N/A' : `${percent.toFixed(1)}%`;

async function companyForBranch(branch: string): Promise<string> {
  const res = await call<{ message?: { company?: string }; company?: string }>(
    'frappe.client.get_value',
    {
      doctype: 'Branch',
      filters: branch,
      fieldname: 'company',
    }
  );
  return res?.message?.company ?? res?.company ?? '';
}

export const YieldCheckCompliancePage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not yet seeded from header context; '' = explicit "All branches"
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchOptions, setBranchOptions] = useState<AutocompleteOption[]>([ALL_BRANCHES_OPTION]);
  const [branchSearching, setBranchSearching] = useState(false);
  const [company, setCompany] = useState<string | null>(null);

  // Seed once from the header branch picker
  useEffect(() => {
    if (selectedBranch !== null) return;
    if (!activeBranchId) return;
    setSelectedBranch(activeBranchId === 'all' ? '' : activeBranchId);
  }, [activeBranchId, selectedBranch]);

  const branchFilter = selectedBranch ?? '';
  const branchReady = selectedBranch !== null;

  // Keep the committed branch visible before the first search runs
  useEffect(() => {
    if (!branchReady) return;
    setBranchOptions((prev) => withSelectedOption(prev, branchFilter));
  }, [branchFilter, branchReady]);

  // Resolve company: selected branch → default company (for all-branches / missing branch.company)
  useEffect(() => {
    if (!branchReady) return;

    let cancelled = false;
    setCompany(null);

    (async () => {
      try {
        if (branchFilter) {
          const value = await companyForBranch(branchFilter);
          if (value) {
            if (!cancelled) setCompany(value);
            return;
          }
        }
        const fallback = await menuAvailabilityService.resolveDefaultCompany();
        if (!cancelled) setCompany(fallback || '');
      } catch {
        if (!cancelled) setCompany('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchFilter, branchReady]);

  const searchBranches = useCallback(
    async (query: string) => {
      setBranchSearching(true);
      try {
        const options = await searchLinkOptions({
          doctype: 'Branch',
          query,
        });
        setBranchOptions(
          withSelectedOption([ALL_BRANCHES_OPTION, ...options], branchFilter)
        );
      } catch {
        setBranchOptions(withSelectedOption([ALL_BRANCHES_OPTION], branchFilter));
      } finally {
        setBranchSearching(false);
      }
    },
    [branchFilter]
  );

  // Fetch compliance data — wait for company so we never flash a scope error
  useEffect(() => {
    if (!branchReady || company === null) {
      setRows([]);
      setError(null);
      setLoading(true);
      return;
    }

    if (!company) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.api.ury_yield_variance.get_yield_check_compliance', {
          company,
          branch: branchFilter || undefined,
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError('Unable to load yield check compliance data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchFilter, branchReady, company]);

  const columns: DataTableColumn<ComplianceRow>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (row) => <span className="font-medium text-foreground">{row.item}</span>,
    },
    {
      key: 'cadence',
      header: 'Cadence',
      render: (row) => row.cadence,
    },
    {
      key: 'required_count',
      header: 'Required',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{row.required_count}</span>,
    },
    {
      key: 'completed_count',
      header: 'Completed',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{row.completed_count}</span>,
    },
    {
      key: 'compliance_percent',
      header: 'Compliance %',
      align: 'right',
      render: (row) => (
        <span
          className={`${numericCellClass} ${getComplianceColor(row.compliance_percent)}`}
          title={
            row.compliance_percent === null || row.compliance_percent === undefined
              ? 'No checks were required for this item in the last 30 days, so compliance is not measurable.'
              : undefined
          }
        >
          {formatCompliance(row.compliance_percent)}
        </span>
      ),
    },
    {
      key: 'attached_count',
      header: 'Attached Checks',
      align: 'right',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.attached_count} / {row.completed_count}
        </span>
      ),
    },
  ];

  return (
    <Page>
      <div className="-mx-page-x -mt-page-top border-b border-border px-page-x pb-4 pt-page-top">
        <h1 className="text-xl font-semibold text-foreground">Yield Check Compliance</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Monitor compliance with yield check cadence requirements. Last 30 days of data.
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          Items with no checks required in this window show <span className="font-medium">N/A</span>{' '}
          rather than 100% — nothing was due, so compliance is not measurable.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex w-full max-w-sm flex-col text-xs font-medium text-muted-foreground">
            Branch (Optional)
            <Autocomplete
              id="yield-compliance-branch"
              value={branchFilter}
              onChange={setSelectedBranch}
              onSearch={searchBranches}
              options={branchOptions}
              searching={branchSearching}
              placeholder="All branches"
              className="mt-1"
            />
          </label>
        </div>
      </div>

      <Section>
        {error ? (
          <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            isLoading={loading}
            emptyMessage="No yield tracking data found."
          />
        )}
      </Section>
    </Page>
  );
};

export default YieldCheckCompliancePage;
