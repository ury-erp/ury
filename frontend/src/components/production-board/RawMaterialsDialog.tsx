import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  type DataTableColumn,
} from '@ury/ui';
import {
  chefProductionService,
  type RawMaterialRow,
  type RawMaterialsResponse,
} from '../../services/chefProduction';
import { describeApiError, describeBlocker, downloadCsv, fileSlug } from '../../components/production/productionStatus';
import { formatQty } from './format';
import { __ } from '../../i18n';

interface RawMaterialsDialogProps {
  /** Production Plan to load; `null` keeps the dialog closed. */
  productionPlan: string | null;
  department: string | null;
  planDate: string;
  onClose: () => void;
}

const isShort = (row: RawMaterialRow) => row.department_shortage > 0 || row.store_shortage > 0;

/**
 * Consolidated raw-material requirement for one department Production Plan.
 * Loaded only when opened. All quantities come from
 * `ury_chef_ui.get_department_raw_materials` (same compile and quantity
 * scaling Prepare Production uses); nothing is calculated here.
 */
export function RawMaterialsDialog({ productionPlan, department, planDate, onClose }: RawMaterialsDialogProps) {
  const [data, setData] = useState<RawMaterialsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!productionPlan) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    chefProductionService
      .getDepartmentRawMaterials(productionPlan)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err, __('Unable to load raw materials.')));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productionPlan]);

  const uom = (row: RawMaterialRow) => row.stock_uom || '';

  const columns: DataTableColumn<RawMaterialRow>[] = [
    {
      key: 'item',
      header: __('Raw Material'),
      width: '30%',
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.item_name}</div>
          <div className="text-xs text-text-tertiary">{row.item_code}</div>
        </div>
      ),
    },
    {
      key: 'required_qty',
      header: __('Required'),
      align: 'right',
      render: (row) => (
        <span className="font-semibold">
          {formatQty(row.required_qty)} <span className="text-xs text-text-tertiary">{uom(row)}</span>
        </span>
      ),
    },
    {
      key: 'department_available',
      header: __('Dept on hand'),
      align: 'right',
      render: (row) => formatQty(row.department_available),
    },
    {
      key: 'department_shortage',
      header: __('Dept short'),
      align: 'right',
      render: (row) => (
        <span className={row.department_shortage > 0 ? 'font-semibold text-warning' : 'text-text-tertiary'}>
          {formatQty(row.department_shortage)}
        </span>
      ),
    },
    {
      key: 'store_available',
      header: __('Store on hand'),
      align: 'right',
      render: (row) => formatQty(row.store_available),
    },
    {
      key: 'store_shortage',
      header: __('Store short'),
      align: 'right',
      render: (row) => (
        <span className={row.store_shortage > 0 ? 'font-semibold text-destructive' : 'text-text-tertiary'}>
          {formatQty(row.store_shortage)}
        </span>
      ),
    },
  ];

  const download = () => {
    if (!data) return;
    downloadCsv(
      `${fileSlug(data.department)}-${planDate}-raw-materials.csv`,
      data.rows,
      [
        { header: __('Item Code'), get: (row) => row.item_code },
        { header: __('Item Name'), get: (row) => row.item_name },
        { header: __('UOM'), get: (row) => row.stock_uom },
        { header: __('Required Qty'), get: (row) => row.required_qty },
        { header: __('Department On Hand'), get: (row) => row.department_available },
        { header: __('Department Short'), get: (row) => row.department_shortage },
        { header: __('Store On Hand'), get: (row) => row.store_available },
        { header: __('Store Short'), get: (row) => row.store_shortage },
      ],
    );
  };

  return (
    <Dialog open={productionPlan !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="xlarge" onClose={onClose} className="flex flex-col">
        <DialogHeader>
          <DialogTitle>{__('Raw materials — {0}', [department || ''])}</DialogTitle>
          <p className="text-sm text-text-tertiary">
            {productionPlan}
            {data?.department_warehouse ? ` · ${data.department_warehouse}` : ''}
            {data?.store_warehouse ? ` · ${__('Store: {0}', [data.store_warehouse])}` : ''}
          </p>
          {data && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge size="tag" variant="default">
                {data.totals.items === 1 ? __('1 material') : __('{0} materials', [data.totals.items])}
              </Badge>
              {data.totals.short_items > 0 && (
                <Badge size="tag" variant="tagWarning">
                  {__('{0} short', [data.totals.short_items])}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-3">
              {data.blockers.length > 0 && (
                <ul className="space-y-1 rounded-md border border-warning-tint-border bg-warning-tint px-3 py-2 text-xs text-warning">
                  {data.blockers.map((blocker, index) => (
                    <li key={`raw-blocker-${index}`}>{describeBlocker(blocker)}</li>
                  ))}
                </ul>
              )}
              <DataTable
                columns={columns}
                rows={data.rows}
                rowTone={(row) => (isShort(row) ? 'warning' : undefined)}
                emptyMessage={__('No raw materials required for this plan.')}
              />
              <p className="text-xs text-text-tertiary">
                {__('Required quantities are calculated from each item\'s BOM (yield and stock UOM applied) for the Production Plan quantities. On-hand values are current stock.')}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter className="pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {__('Close')}
          </Button>
          <Button type="button" onClick={download} disabled={!data || data.rows.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            {__('Download CSV')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
