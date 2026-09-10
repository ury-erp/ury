import React, { useEffect, useState } from 'react';
import {
  Page,
  Section,
  DataTable,
  DataTableColumn,
  Card,
  Select,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';

interface ComplianceRow {
  item: string;
  cadence: string;
  required_count: number;
  completed_count: number;
  compliance_percent: number;
  attached_count: number;
}

const getComplianceColor = (percent: number): string => {
  if (percent >= 80) return 'text-green-600';
  if (percent >= 50) return 'text-yellow-600';
  return 'text-red-600';
};

export const YieldCheckCompliancePage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [company, setCompany] = useState<string>('');

  // Fetch branches for selector
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await call<any>('frappe.client.get_list', {
          doctype: 'Branch',
          fields: ['name'],
          limit_page_length: 0,
          order_by: 'name asc',
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setBranches(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setBranches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Set initial branch when context updates
  useEffect(() => {
    if (activeBranchId && activeBranchId !== 'all' && !selectedBranch) {
      setSelectedBranch(activeBranchId);
    }
  }, [activeBranchId, selectedBranch]);

  // Fetch company from selected branch
  useEffect(() => {
    let cancelled = false;
    const branch = selectedBranch || activeBranchId;

    if (!branch || branch === 'all') {
      setCompany('');
      return;
    }

    (async () => {
      try {
        const res = await call<any>('frappe.client.get', {
          doctype: 'Branch',
          name: branch,
        });
        const branchData = (res as any)?.message || res;
        if (!cancelled && branchData?.company) {
          setCompany(branchData.company);
        } else if (!cancelled) {
          setCompany('');
        }
      } catch {
        if (!cancelled) setCompany('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch, activeBranchId]);

  // Fetch compliance data
  useEffect(() => {
    const branch = selectedBranch || activeBranchId;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.api.ury_yield_variance.get_yield_check_compliance', {
          company: company,
          branch: branch && branch !== 'all' ? branch : undefined,
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
  }, [activeBranchId, selectedBranch, company]);

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
        <span className={`${numericCellClass} ${getComplianceColor(row.compliance_percent)}`}>
          {row.compliance_percent.toFixed(1)}%
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

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            Branch (Optional)
            <Select
              aria-label="Branch"
              size="sm"
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value)}
              className="mt-1"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </Select>
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
