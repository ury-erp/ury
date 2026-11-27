import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListFilter, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  KpiStrip,
  Page,
  PageHeader,
  Section,
  Spinner,
  showToast,
} from '@ury/ui';
import { chefProductionService, type ChefDepartment, type ChefQueueResponse } from '../../services/chefProduction';
import { PREPARE_POLL_INTERVAL_MS, describeApiError, describeBlocker } from '../../components/production/productionStatus';
import { useBranchContext } from '../../context/BranchContext';
import { DepartmentPlanCard } from '../../components/production-board/DepartmentPlanCard';
import { RawMaterialsDialog } from '../../components/production-board/RawMaterialsDialog';
import { formatQty } from '../../components/production-board/format';
import { __ } from '../../i18n';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

const PERMISSION_MESSAGE = "You don't have permission to act on this department's production.";

type BusyAction = 'save' | 'submit' | 'prepare';

/**
 * Production Board (track sa-chef-ui-production-queue).
 *
 * One card per department Production Plan for the branch's Sales Plan on the
 * chosen date. The date picker only chooses which Sales Plan to show (D9).
 * Every value and every action flag comes from `ury_chef_ui`, which also
 * enforces the role and department User Permissions.
 */
export default function ProductionBoardPage() {
  const { activeBranchId } = useBranchContext();
  // The shared branch selector may be on "all"; the server then falls back to
  // the user's own branch. Otherwise the server validates access (PermissionError).
  const branch = !activeBranchId || activeBranchId === 'all' ? null : activeBranchId;
  const [planDate, setPlanDate] = useState<string>(todayIso);
  const [data, setData] = useState<ChefQueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<{ department: string; action: BusyAction } | null>(null);
  const [rawMaterials, setRawMaterials] = useState<{ plan: string; department: string } | null>(null);
  const [confirm, setConfirm] = useState<{ department: ChefDepartment; action: 'submit' | 'prepare' } | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (!options.quiet) setIsLoading(true);
      try {
        const result = await chefProductionService.getProductionQueue({ planDate, branch });
        setData(result);
        setError(null);
      } catch (err) {
        setError(describeApiError(err, __('Unable to load the production queue.'), PERMISSION_MESSAGE));
      } finally {
        if (!options.quiet) setIsLoading(false);
      }
    },
    [planDate, branch],
  );

  useEffect(() => {
    load();
  }, [load]);

  const anyProcessing = useMemo(
    () => (data?.departments ?? []).some((dept) => dept.execution_state === 'processing'),
    [data],
  );

  useEffect(() => {
    if (!anyProcessing) return;
    const timer = window.setInterval(() => load({ quiet: true }), PREPARE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [anyProcessing, load]);

  const runAction = async (department: string, action: BusyAction, fn: () => Promise<void>) => {
    setBusy({ department, action });
    try {
      await fn();
      await load({ quiet: true });
      return true;
    } catch (err) {
      showToast.error(describeApiError(err, __('The action could not be completed.'), PERMISSION_MESSAGE));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveQuantities = (dept: ChefDepartment, rows: Array<{ row_name: string | null; item_code: string; production_qty: number }>) =>
    runAction(dept.department, 'save', async () => {
      await chefProductionService.updateProductionQuantities(dept.production_plan!, rows);
      showToast.success(__('Production quantities saved.'));
    });

  const confirmAction = async () => {
    if (!confirm) return;
    const { department: dept, action } = confirm;
    await runAction(dept.department, action, async () => {
      if (action === 'submit') {
        await chefProductionService.submitProductionPlan(dept.production_plan!);
        showToast.success(__('Production Plan submitted.'));
        return;
      }
      const result = await chefProductionService.prepareDepartmentProduction(dept.production_plan!);
      if (result.status === 'blocked') {
        const messages = (result.blockers ?? []).map(describeBlocker).join('\n');
        showToast.error(messages || __('Prepare Production is blocked until materials are available.'));
      } else if (result.status === 'already_processing') {
        showToast.error(__('Prepare Production is already running for this department.'));
      } else {
        showToast.success(__('Prepare Production started.'));
      }
    });
    setConfirm(null);
  };

  const dateHeading = useMemo(() => {
    try {
      return format(parseISO(planDate), 'EEE d MMM yyyy');
    } catch {
      return planDate;
    }
  }, [planDate]);

  const departments = data?.departments ?? [];
  const activeBranch = data?.branch ?? branch;

  const jumpTo = (department: string) => {
    setCollapsed((current) => ({ ...current, [department]: false }));
    cardRefs.current[department]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      );
    }
    if (error) {
      return (
        <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      );
    }
    if (!activeBranch) {
      return (
        <Card className="p-10 text-center text-sm text-text-tertiary">
          {__('Your user is not linked to a branch. Ask a manager to add you to a Branch.')}
        </Card>
      );
    }
    if (!data?.sales_plan) {
      return (
        <Card className="p-10 text-center text-sm text-text-tertiary">
          {__('No approved Sales Plan for {0} on this date.', [activeBranch])}
        </Card>
      );
    }
    if (departments.length === 0) {
      return (
        <Card className="p-10 text-center text-sm text-text-tertiary">
          {__('No production for your departments in this Sales Plan.')}
        </Card>
      );
    }
    return (
      <>
        {departments.length > 1 && (
          <div className="sticky -top-6 z-20 -mx-6 mb-3 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-6 py-2 backdrop-blur">
            <span className="flex shrink-0 items-center gap-1 pe-1 text-xs font-medium text-text-tertiary">
              <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              {__('Jump to:')}
            </span>
            {departments.map((dept) => (
              <button
                key={dept.department}
                type="button"
                aria-label={__('Jump to {0}', [dept.department])}
                onClick={() => jumpTo(dept.department)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-primary-tint"
              >
                {dept.department}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-5">
          {departments.map((dept) => (
            <DepartmentPlanCard
              key={dept.department}
              department={dept}
              planDate={planDate}
              collapsed={Boolean(collapsed[dept.department])}
              busyAction={busy?.department === dept.department ? busy.action : null}
              registerRef={(el) => {
                cardRefs.current[dept.department] = el;
              }}
              onToggle={() => setCollapsed((current) => ({ ...current, [dept.department]: !current[dept.department] }))}
              onOpenRawMaterials={() =>
                dept.production_plan && setRawMaterials({ plan: dept.production_plan, department: dept.department })
              }
              onSaveQuantities={(rows) => saveQuantities(dept, rows)}
              onSubmit={() => setConfirm({ department: dept, action: 'submit' })}
              onPrepare={() => setConfirm({ department: dept, action: 'prepare' })}
            />
          ))}
        </div>
      </>
    );
  };

  const confirmDept = confirm?.department;

  return (
    <>
      <Page>
        <PageHeader
          bleed
          title={__('Production Board — {0}', [dateHeading])}
          description={
            data?.sales_plan ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{activeBranch}</span>
                <span className="text-text-tertiary">·</span>
                <span>{data.sales_plan}</span>
                {data.sales_plan_status && (
                  <Badge size="tag" variant={data.sales_plan_status === 'Locked for Production' ? 'tagAccent' : 'default'}>
                    {data.sales_plan_status}
                  </Badge>
                )}
              </span>
            ) : (
              activeBranch || ''
            )
          }
          actions={
            <>
              <DatePicker
                id="production-board-plan-date"
                aria-label={__('Plan date')}
                value={planDate}
                onChange={(_id, next) => next && setPlanDate(next)}
                className="w-[180px]"
              />
              <Button variant="secondary" onClick={() => load()} className="gap-2" aria-label={__('Refresh')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {data?.sales_plan && departments.length > 0 && !isLoading && !error && (
          <Section>
            <KpiStrip
              items={[
                {
                  label: __('Items to Prepare'),
                  value: data.totals.items_to_prepare,
                },
                {
                  label: __('Total Production Qty'),
                  value: formatQty(data.totals.production_qty),
                },
                {
                  label: __('Material Shortages'),
                  value: data.totals.material_shortages,
                  tone: data.totals.material_shortages > 0 ? 'warning' : 'default',
                },
                {
                  label: __('Preparation Progress'),
                  value: `${data.totals.items_prepared} / ${data.totals.items_to_prepare}`,
                  tone:
                    data.totals.items_to_prepare > 0 && data.totals.items_prepared === data.totals.items_to_prepare
                      ? 'success'
                      : 'default',
                },
              ]}
            />
          </Section>
        )}

        <Section>{renderBody()}</Section>
      </Page>

      <RawMaterialsDialog
        productionPlan={rawMaterials?.plan ?? null}
        department={rawMaterials?.department ?? null}
        planDate={planDate}
        onClose={() => setRawMaterials(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
        title={confirm?.action === 'submit' ? __('Submit Production Plan?') : __('Prepare Production?')}
        description={
          !confirmDept
            ? ''
            : confirm?.action === 'submit'
              ? __(
                  'Submitting {0} ({1}) locks its production quantities and raises its Material Requests. Continue?',
                  [confirmDept.department, confirmDept.production_plan || ''],
                )
              : __(
                  'This will validate stock, transfer materials from Store, create Work Orders, and post Manufacture Stock Entries for {0} ({1}). Submitting a Manufacture Stock Entry declares that physical production is complete. Continue?',
                  [confirmDept.department, confirmDept.production_plan || ''],
                )
        }
        cancelLabel={__('Cancel')}
        confirmLabel={confirm?.action === 'submit' ? __('Submit plan') : __('Prepare Production')}
        loadingLabel={confirm?.action === 'submit' ? __('Submitting…') : __('Preparing…')}
        isSubmitting={busy !== null && confirm !== null && busy.department === confirm.department.department}
        onConfirm={confirmAction}
      />
    </>
  );
}
