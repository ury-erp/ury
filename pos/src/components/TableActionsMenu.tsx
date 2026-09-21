import { TableActionsMenu as SharedTableActionsMenu } from '@ury/ui';
import { t } from '../i18n';
import { isMergedTable } from '../lib/table-utils';
import type { Table } from '../lib/table-api';

interface TableActionsMenuProps {
  table: Table;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMerge?: () => void;
  onUnmerge?: () => void;
  onTransferTable?: () => void;
  onTransferCaptain?: () => void;
  showCaptainTransfer?: boolean;
}

const TableActionsMenu = ({
  table,
  isOpen,
  onOpenChange,
  onMerge,
  onUnmerge,
  onTransferTable,
  onTransferCaptain,
  showCaptainTransfer = false,
}: TableActionsMenuProps) => {
  const isAvailable = table.occupied === 0;
  const isOccupied = table.occupied === 1;
  const canUnmerge = isMergedTable(table) && isAvailable;

  return (
    <SharedTableActionsMenu
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isAvailable={isAvailable}
      isOccupied={isOccupied}
      canUnmerge={canUnmerge}
      onMerge={onMerge}
      onUnmerge={onUnmerge}
      onTransferTable={onTransferTable}
      onTransferCaptain={onTransferCaptain}
      showCaptainTransfer={showCaptainTransfer}
      labels={{
        tableActions: t('tables.table_actions'),
        mergeTables: t('tables.merge_tables'),
        unmergeTables: t('tables.unmerge_tables'),
        transferTable: t('tables.transfer_table'),
        transferCaptain: t('tables.transfer_captain'),
      }}
    />
  );
};

export default TableActionsMenu;
