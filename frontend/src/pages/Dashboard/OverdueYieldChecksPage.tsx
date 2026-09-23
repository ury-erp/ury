import React, { useEffect, useState } from 'react';
import {
  Page,
  Section,
  DataTable,
  DataTableColumn,
  Card,
  Select,
  Button,
  Spinner,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { yieldCheckService } from '../../services/yieldCheck';

interface DueYieldCheckRow {
  item: string;
  item_name: string;
  cadence: string;
  reason: string;
  days_overdue?: number;
}

interface LogCheckModalProps {
  isOpen: boolean;
  row: DueYieldCheckRow | null;
  branch: string;
  onConfirm: (inputQty: number, outputQty: number) => Promise<void>;
  onCancel: () => void;
}

const LogCheckModal: React.FC<LogCheckModalProps> = ({
  isOpen,
  row,
  branch,
  onConfirm,
  onCancel,
}) => {
  const [inputQty, setInputQty] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset fields every time the modal opens for a new row
  useEffect(() => {
    if (isOpen) {
      setInputQty('');
      setOutputQty('');
      setError(null);
    }
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  const handleConfirm = async () => {
    const inQty = parseFloat(inputQty);
    const outQty = parseFloat(outputQty);

    if (!inputQty || isNaN(inQty) || inQty <= 0) {
      setError('Input quantity must be a positive number.');
      return;
    }
    if (!outputQty || isNaN(outQty) || outQty <= 0) {
      setError('Output quantity must be a positive number.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onConfirm(inQty, outQty);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">Log Yield Check</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{row.item_name}</span>
          {' '} - enter the quantities weighed before and after preparation.
        </p>

        <div className="mb-4 space-y-3">
          <label className="flex flex-col text-sm font-medium text-muted-foreground">
            Input Qty
            <input
              type="number"
              min="0.001"
              step="any"
              value={inputQty}
              onChange={(e) => setInputQty(e.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col text-sm font-medium text-muted-foreground">
            Output Qty
            <input
              type="number"
              min="0.001"
              step="any"
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </label>

          {inputQty && outputQty && !isNaN(parseFloat(inputQty)) && !isNaN(parseFloat(outputQty)) && parseFloat(inputQty) > 0 && (
            <p className="text-xs text-muted-foreground">
              Actual yield:{' '}
              <span className="font-medium text-foreground">
                {((parseFloat(outputQty) / parseFloat(inputQty)) * 100).toFixed(1)}%
              </span>
            </p>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-3">
          <Button onClick={onCancel} disabled={loading} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading} variant="default">
            {loading ? 'Saving...' : 'Log Check'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export const OverdueYieldChecksPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<DueYieldCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [logModal, setLogModal] = useState<{ isOpen: boolean; row: DueYieldCheckRow | null }>({
    isOpen: false,
    row: null,
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const currentBranch = selectedBranch || activeBranchId;

  const fetchRows = async (branch: string) => {
    if (!branch || branch === 'all') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await call<any>('ury.ury.services.yield_check_reminders.get_due_yield_checks_api', {
        branch,
      });
      const data = (res as any)?.message || res || [];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Unable to load overdue yield checks.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch overdue checks
  useEffect(() => {
    let cancelled = false;
    if (!currentBranch || currentBranch === 'all') {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.services.yield_check_reminders.get_due_yield_checks_api', {
          branch: currentBranch,
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError('Unable to load overdue yield checks.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, selectedBranch]);

  const handleLogCheck = (row: DueYieldCheckRow) => {
    setSuccessMessage(null);
    setLogModal({ isOpen: true, row });
  };

  const handleConfirmLog = async (inputQty: number, outputQty: number) => {
    if (!logModal.row || !currentBranch) return;

    await yieldCheckService.logStandaloneCheck({
      item: logModal.row.item,
      branch: currentBranch,
      input_qty: inputQty,
      output_qty: outputQty,
    });

    const actualYield = ((outputQty / inputQty) * 100).toFixed(1);
    setSuccessMessage(
      `Yield check logged for ${logModal.row.item_name}: ${actualYield}% actual yield.`
    );
    setLogModal({ isOpen: false, row: null });

    // Refresh the list — item should disappear if the check clears the cadence
    await fetchRows(currentBranch);
  };

  const columns: DataTableColumn<DueYieldCheckRow>[] = [
    {
      key: 'item_name',
      header: 'Item',
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.item_name}</div>
          <div className="text-xs text-muted-foreground">{row.item}</div>
        </div>
      ),
    },
    {
      key: 'cadence',
      header: 'Cadence',
      render: (row) => row.cadence,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => row.reason,
    },
    {
      key: 'days_overdue',
      header: 'Days Overdue',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {row.days_overdue !== undefined ? row.days_overdue : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          onClick={() => handleLogCheck(row)}
          variant="secondary"
          size="xs"
        >
          Log Check
        </Button>
      ),
    },
  ];

  return (
    <Page>
      <div className="-mx-page-x -mt-page-top border-b border-border px-page-x pb-4 pt-page-top">
        <h1 className="text-xl font-semibold text-foreground">Overdue Yield Checks</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Items that are due for yield checks based on their configured cadence. Click{' '}
          <span className="font-medium">Log Check</span> on any row to record a standalone
          spot-check directly from here.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            Branch
            <Select
              aria-label="Branch"
              value={currentBranch || ''}
              onChange={(event) => setSelectedBranch(event.target.value)}
              className="mt-1"
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {!currentBranch || currentBranch === 'all' ? (
        <Section>
          <Card className="p-10 text-center text-sm text-text-tertiary">Select a branch to view overdue yield checks.</Card>
        </Section>
      ) : (
        <Section>
          {successMessage && (
            <Card className="mb-4 border-[var(--success-tint-border,theme(colors.green.200))] bg-[var(--success-tint,theme(colors.green.50))] p-4 text-sm text-[var(--success,theme(colors.green.700))]">
              {successMessage}
            </Card>
          )}
          {error ? (
            <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              isLoading={loading}
              emptyMessage="No overdue yield checks for this branch."
            />
          )}
        </Section>
      )}

      <LogCheckModal
        isOpen={logModal.isOpen}
        row={logModal.row}
        branch={currentBranch || ''}
        onConfirm={handleConfirmLog}
        onCancel={() => setLogModal({ isOpen: false, row: null })}
      />
    </Page>
  );
};

export default OverdueYieldChecksPage;
