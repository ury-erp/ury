import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
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

  const membersLabel = groupMembers.join(', ');

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Error toast handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent onClose={() => !isSubmitting && onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{t('tables.unmerge_group_title')}</DialogTitle>
          <DialogDescription>
            {t('tables.unmerge_group_description', { tables: membersLabel })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('tables.unmerge_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableUnmergeDialog;
