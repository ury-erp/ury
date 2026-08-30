import { useEffect, useMemo, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { Badge } from '@ury/ui';
import { TableShapeIcon } from './TableShapeIcon';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import type { Table } from '../lib/table-api';

type DialogPhase = 'select' | 'merging' | 'done';

interface TableMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: Table | null;
  availableTables: Table[];
  onConfirm: (targetNames: string[]) => Promise<void>;
}

const MIN_ANIMATION_MS = 600;

const TableMergeDialog = ({
  open,
  onOpenChange,
  sourceTable,
  availableTables,
  onConfirm,
}: TableMergeDialogProps) => {
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<DialogPhase>('select');

  useEffect(() => {
    if (open) {
      setSelectedTargets(new Set());
      setPhase('select');
    }
  }, [open, sourceTable?.name]);

  const selectedTargetList = useMemo(
    () => availableTables.filter((table) => selectedTargets.has(table.name)),
    [availableTables, selectedTargets]
  );
  const mergeCandidates = useMemo(() => {
    return availableTables.filter((table) => {
      return (
        table.occupied !== 1 &&
        table.name !== sourceTable?.name
      );
    });
  }, [availableTables, sourceTable?.name]);

  const handleClose = () => {
    if (phase === 'merging') return;
    onOpenChange(false);
  };

  const toggleTarget = (tableName: string) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedTargets.size === 0 || !sourceTable || phase !== 'select') return;

    const targets = Array.from(selectedTargets);
    setPhase('merging');
    const animationStart = Date.now();

    try {
      await Promise.all([
        onConfirm(targets),
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
              <DialogDescription>
                {sourceTable.occupied === 1
                  ? t('tables.merge_with_occupied_hint')
                  : t('tables.select_tables_to_merge')}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto px-6 pb-2">
              {mergeCandidates.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-tertiary">
                  {t('tables.no_tables_to_merge')}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {mergeCandidates.map((table) => {
                    const isSelected = selectedTargets.has(table.name);
                    return (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => toggleTarget(table.name)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary-50'
                            : 'border-border hover:border-border hover:bg-muted'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            isSelected
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-white'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">{table.name}</span>
                          {typeof table.no_of_seats === 'number' && (
                            <span className="text-xs text-text-tertiary">
                              {t('tables.seats')}: {table.no_of_seats}
                            </span>
                          )}
                        </div>
                        <Badge
                          variant={table.occupied === 1 ? 'secondary' : 'success'}
                          className="shrink-0"
                        >
                          {table.occupied === 1 ? t('tables.occupied') : t('tables.available')}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirm} disabled={selectedTargets.size === 0}>
                {selectedTargets.size > 1
                  ? t('tables.merge_selected_count', { count: selectedTargets.size })
                  : t('tables.merge_confirm')}
              </Button>
            </DialogFooter>
          </>
        )}

        {(phase === 'merging' || phase === 'done') && selectedTargets.size > 0 && (
          <div className="flex flex-col items-center px-6 py-8">
            <p className="mb-6 text-sm font-medium text-muted-foreground">
              {phase === 'done' ? t('tables.merge_success') : t('tables.merging_tables')}
            </p>

            {selectedTargetList.length === 1 ? (
              <div className="relative flex w-full max-w-xs items-center justify-center gap-4">
                <div
                  className={cn(
                    'flex flex-1 flex-col items-center rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4',
                    phase === 'merging' && 'animate-merge-slide-left'
                  )}
                >
                  <TableShapeIcon shape={sourceTable.table_shape || 'Rectangle'} />
                  <span className="mt-2 text-sm font-semibold text-foreground">{sourceTable.name}</span>
                </div>

                <div
                  className={cn(
                    'absolute left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-md',
                    phase === 'merging' && 'animate-merge-link-pulse',
                    phase === 'done' && 'bg-green-100'
                  )}
                >
                  {phase === 'done' ? (
                    <Check className="h-5 w-5 text-success" />
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
                  <TableShapeIcon shape={selectedTargetList[0].table_shape || 'Rectangle'} />
                  <span className="mt-2 text-sm font-semibold text-foreground">{selectedTargetList[0].name}</span>
                </div>
              </div>
            ) : (
              <div className="relative flex w-full max-w-lg items-stretch justify-center gap-3">
                <div
                  className={cn(
                    'flex min-w-[7rem] flex-1 flex-col items-center justify-center rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4',
                    phase === 'merging' && 'animate-merge-slide-left'
                  )}
                >
                  <TableShapeIcon shape={sourceTable.table_shape || 'Rectangle'} />
                  <span className="mt-2 text-sm font-semibold text-foreground">{sourceTable.name}</span>
                </div>

                <div
                  className={cn(
                    'absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md',
                    phase === 'merging' && 'animate-merge-link-pulse',
                    phase === 'done' && 'bg-green-100'
                  )}
                >
                  {phase === 'done' ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <Link2 className="h-5 w-5 text-primary" />
                  )}
                </div>

                <div
                  className={cn(
                    'flex flex-1 flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3',
                    phase === 'merging' && 'animate-merge-slide-right'
                  )}
                >
                  {selectedTargetList.map((table) => (
                    <div key={table.name} className="flex flex-col items-center px-2 py-1">
                      <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
                      <span className="mt-1 text-xs font-semibold text-foreground">{table.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TableMergeDialog;
