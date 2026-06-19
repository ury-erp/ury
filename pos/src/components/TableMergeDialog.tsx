import { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TableShapeIcon } from './TableShapeIcon';
import { cn } from '../lib/utils';
import { t } from '../i18n';
import type { Table } from '../lib/table-api';

type DialogPhase = 'select' | 'merging' | 'done';

interface TableMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  availableTables: Table[];
  onConfirm: (targetName: string) => Promise<void>;
}

const MIN_ANIMATION_MS = 600;

const TableMergeDialog = ({
  open,
  onOpenChange,
  sourceTable,
  availableTables,
  onConfirm,
}: TableMergeDialogProps) => {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<DialogPhase>('select');

  useEffect(() => {
    if (open) {
      setSelectedTarget(null);
      setPhase('select');
    }
  }, [open, sourceTable?.name]);

  const handleClose = () => {
    if (phase === 'merging') return;
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!selectedTarget || !sourceTable || phase !== 'select') return;

    setPhase('merging');
    const animationStart = Date.now();

    try {
      await Promise.all([
        onConfirm(selectedTarget),
        new Promise((resolve) => {
          const elapsed = Date.now() - animationStart;
          const remaining = Math.max(0, MIN_ANIMATION_MS - elapsed);
          setTimeout(resolve, remaining);
        }),
      ]);
      setPhase('done');
      setTimeout(() => onOpenChange(false), 400);
    } catch {
      setPhase('select');
    }
  };

  if (!sourceTable) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={phase === 'merging' ? undefined : handleClose}
        showCloseButton={phase !== 'merging'}
        className="overflow-y-auto"
      >
        {phase === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('tables.merge_with', { table: sourceTable.name })}</DialogTitle>
              <DialogDescription>{t('tables.select_table_to_merge')}</DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto px-6 pb-2">
              {availableTables.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  {t('tables.no_tables_to_merge')}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableTables.map((table) => (
                    <button
                      key={table.name}
                      type="button"
                      onClick={() => setSelectedTarget(table.name)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all',
                        selectedTarget === table.name
                          ? 'border-primary bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">{table.name}</span>
                        {typeof table.no_of_seats === 'number' && (
                          <span className="text-xs text-gray-500">
                            {t('tables.seats')}: {table.no_of_seats}
                          </span>
                        )}
                      </div>
                      <Badge variant="success" className="shrink-0">
                        {t('tables.available')}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedTarget}>
                {t('tables.merge_confirm')}
              </Button>
            </DialogFooter>
          </>
        )}

        {(phase === 'merging' || phase === 'done') && selectedTarget && (
          <div className="flex flex-col items-center px-6 py-8">
            <p className="mb-6 text-sm font-medium text-gray-600">
              {phase === 'done' ? t('tables.merge_success') : t('tables.merging_tables')}
            </p>

            <div className="relative flex w-full max-w-xs items-center justify-center gap-4">
              <div
                className={cn(
                  'flex flex-1 flex-col items-center rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4',
                  phase === 'merging' && 'animate-merge-slide-left'
                )}
              >
                <TableShapeIcon shape={sourceTable.table_shape || 'Rectangle'} />
                <span className="mt-2 text-sm font-semibold text-gray-900">{sourceTable.name}</span>
              </div>

              <div
                className={cn(
                  'absolute left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-md',
                  phase === 'merging' && 'animate-merge-link-pulse',
                  phase === 'done' && 'bg-green-100'
                )}
              >
                {phase === 'done' ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Link2 className="h-5 w-5 text-primary" />
                )}
              </div>

              <div
                className={cn(
                  'flex flex-1 flex-col items-center rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4',
                  phase === 'merging' && 'animate-merge-slide-right'
                )}
              >
                <TableShapeIcon
                  shape={
                    availableTables.find((t) => t.name === selectedTarget)?.table_shape || 'Rectangle'
                  }
                />
                <span className="mt-2 text-sm font-semibold text-gray-900">{selectedTarget}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TableMergeDialog;
