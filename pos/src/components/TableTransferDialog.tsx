import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button, Input } from '@ury/ui';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import { Spinner } from '@ury/ui';
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

const TableTransferDialog = ({
  open,
  onOpenChange,
  sourceTable,
  destinationTables,
  loading = false,
  onConfirm,
}: TableTransferDialogProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch('');
    setError(null);
    setIsSubmitting(false);
  }, [open, sourceTable?.name]);

  const sortedTables = useMemo(
    () =>
      [...destinationTables].sort(
        (a, b) =>
          a.restaurant_room.localeCompare(b.restaurant_room) || a.name.localeCompare(b.name)
      ),
    [destinationTables]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedTables;
    return sortedTables.filter(
      (table) =>
        table.name.toLowerCase().includes(q) ||
        table.restaurant_room.toLowerCase().includes(q)
    );
  }, [sortedTables, search]);

  const groupedByRoom = useMemo(() => {
    const groups: Array<{ room: string; tables: Table[] }> = [];
    for (const table of filtered) {
      const last = groups[groups.length - 1];
      if (last?.room === table.restaurant_room) {
        last.tables.push(table);
      } else {
        groups.push({ room: table.restaurant_room, tables: [table] });
      }
    }
    return groups;
  }, [filtered]);

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!selected || !sourceTable) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tables.transfer_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={() => handleOpenChange(false)}
        className="max-h-dialog-max-h overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('tables.transfer_table')}</DialogTitle>
          <DialogDescription>
            {t('tables.select_destination_table', { table: sourceTable?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('tables.current_table')}
          </label>
          <Input
            type="text"
            readOnly
            value={sourceTable?.name ?? ''}
            variant="search"
            className="mb-4"
          />

          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tables.search_transfer_placeholder')}
            variant="search"
            className="mb-3"
            disabled={isSubmitting || loading}
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner hideMessage  message={t('common.loading')} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">{t('tables.no_destination_tables')}</p>
          ) : (
            <div className="space-y-4">
              {groupedByRoom.map((group) => (
                <div key={group.room}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {group.room}
                  </p>
                  <div className="space-y-2">
                    {group.tables.map((table) => {
                      const isSelected = selected === table.name;
                      return (
                        <Button
                          key={table.name}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setSelected(table.name)}
                          variant="ghost"
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors h-auto',
                            isSelected
                              ? 'border-primary bg-primary-50/40'
                              : 'border-gray-200 hover:border-gray-300'
                          )}
                        >
                          <TableShapeIcon shape={table.table_shape || 'Rectangle'} />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{table.name}</p>
                            <p className="text-xs text-gray-500">
                              {typeof table.no_of_seats === 'number'
                                ? `${table.no_of_seats} ${t('tables.seats')}`
                                : ''}
                            </p>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !selected || loading}>
            {isSubmitting ? t('common.loading') : t('tables.transfer_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TableTransferDialog;
