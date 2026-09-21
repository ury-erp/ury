import { TablePickerDialog } from '@ury/ui';
import { t } from '../i18n';
import { TableShapeIcon } from './TableShapeIcon';
import type { Table } from '../lib/table-api';

interface TableTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  destinationTables: Table[];
  loading?: boolean;
  onConfirm: (destinationTable: string) => Promise<void>;
}

type TableShape = NonNullable<Table['table_shape']>;

function asShape(shape: string | undefined): TableShape {
  if (shape === 'Circle' || shape === 'Square' || shape === 'Rectangle') return shape;
  return 'Rectangle';
}

const TableTransferDialog = ({
  open,
  onOpenChange,
  sourceTable,
  destinationTables,
  loading = false,
  onConfirm,
}: TableTransferDialogProps) => (
  <TablePickerDialog
    open={open}
    onOpenChange={onOpenChange}
    sourceName={sourceTable?.name ?? ''}
    loading={loading}
    options={destinationTables.map((table) => ({
      name: table.name,
      room: table.restaurant_room,
      shape: asShape(table.table_shape),
      seatsLabel:
        typeof table.no_of_seats === 'number' ? `${table.no_of_seats} ${t('tables.seats')}` : undefined,
    }))}
    onConfirm={onConfirm}
    renderIcon={(shape) => <TableShapeIcon shape={asShape(shape)} />}
    labels={{
      title: t('tables.transfer_table'),
      description: t('tables.select_destination_table', { table: sourceTable?.name ?? '' }),
      currentLabel: t('tables.current_table'),
      searchPlaceholder: t('tables.search_transfer_placeholder'),
      empty: t('tables.no_destination_tables'),
      cancel: t('common.cancel'),
      confirm: t('tables.transfer_confirm'),
      loading: t('common.loading'),
      errorFallback: t('tables.transfer_failed'),
    }}
  />
);

export default TableTransferDialog;
