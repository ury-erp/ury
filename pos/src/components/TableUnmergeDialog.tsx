import { useState } from 'react';
import { ConfirmDialog } from '@ury/ui';
import { t } from '../i18n';
import type { Table } from '../lib/table-api';

interface TableUnmergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  groupMembers: string[];
  onConfirm: () => Promise<void>;
}

const TableUnmergeDialog = ({
  open,
  onOpenChange,
  sourceTable,
  groupMembers,
  onConfirm,
}: TableUnmergeDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!sourceTable) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('tables.unmerge_group_title')}
      description={t('tables.unmerge_group_description', { tables: groupMembers.join(', ') })}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('tables.unmerge_confirm')}
      loadingLabel={t('common.loading')}
      confirmVariant="danger"
      isSubmitting={isSubmitting}
      onConfirm={async () => {
        setIsSubmitting(true);
        try {
          await onConfirm();
          onOpenChange(false);
        } catch {
          // Error toast handled by parent; keep dialog open.
        } finally {
          setIsSubmitting(false);
        }
      }}
    />
  );
};

export default TableUnmergeDialog;
