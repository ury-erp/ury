import { MultiSelectTableDialog } from '@ury/ui';
import { t } from '../i18n';
import { TableShapeIcon } from './TableShapeIcon';
import type { Table } from '../lib/table-api';

interface TableMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  availableTables: Table[];
  onConfirm: (targetNames: string[]) => Promise<void>;
}

const TableMergeDialog = ({
  open,
  onOpenChange,
  sourceTable,
  availableTables,
  onConfirm,
}: TableMergeDialogProps) => {
  if (!sourceTable) return null;

  return (
    <MultiSelectTableDialog
      open={open}
      onOpenChange={onOpenChange}
      sourceName={sourceTable.name}
      options={availableTables.map((table) => ({
        name: table.name,
        occupied: table.occupied,
        seatsLabel:
          typeof table.no_of_seats === 'number' ? `${table.no_of_seats} ${t('tables.seats')}` : undefined,
      }))}
      onConfirm={onConfirm}
      renderIcon={(name) => {
        const table = availableTables.find((row) => row.name === name);
        return <TableShapeIcon shape={table?.table_shape || 'Rectangle'} />;
      }}
      labels={{
        title: t('tables.merge_with', { table: sourceTable.name }),
        description:
          sourceTable.occupied === 1
            ? t('tables.merge_with_occupied_hint')
            : t('tables.select_tables_to_merge'),
        empty: t('tables.no_tables_to_merge'),
        cancel: t('common.cancel'),
        confirm: t('tables.merge_confirm'),
        merging: t('tables.merging_tables'),
        done: t('tables.merge_success'),
        selectedCount: (n) => t('tables.merge_selected_count', { count: n }),
      }}
    />
  );
};

export default TableMergeDialog;
