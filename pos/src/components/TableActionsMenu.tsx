import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowRightLeft, Link2, MoreVertical, Unlink, UserRound } from 'lucide-react';
import { Button } from '@ury/ui';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const isAvailable = table.occupied === 0;
  const isOccupied = table.occupied === 1;
  const isMerged = isMergedTable(table);
  const canUnmerge = isMerged && isAvailable;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(!isOpen);
  };

  const handleMerge = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onMerge?.();
  };

  const handleUnmerge = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onUnmerge?.();
  };

  const handleTransferTable = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onTransferTable?.();
  };

  const handleTransferCaptain = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onTransferCaptain?.();
  };

  const hasAvailableActions = isAvailable;
  const hasOccupiedActions =
    isOccupied && (onMerge || onTransferTable || (showCaptainTransfer && onTransferCaptain));

  if (!hasAvailableActions && !hasOccupiedActions) {
    return null;
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900"
        onClick={handleToggle}
        aria-label={t('tables.table_actions')}
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-white py-1 shadow-lg">
          {isAvailable && (
            <>
              <Button
                variant="ghost"
                className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                onClick={handleMerge}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {t('tables.merge_tables')}
              </Button>
              {canUnmerge && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <Button
                    variant="ghost"
                    className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-red-600 hover:bg-red-50"
                    onClick={handleUnmerge}
                  >
                    <Unlink className="h-4 w-4 shrink-0" />
                    {t('tables.unmerge_tables')}
                  </Button>
                </>
              )}
            </>
          )}

          {isOccupied && (
            <>
              <Button
                variant="ghost"
                className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                onClick={handleMerge}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {t('tables.merge_tables')}
              </Button>
              {onTransferTable && (
                <Button
                  variant="ghost"
                  className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                  onClick={handleTransferTable}
                >
                  <ArrowRightLeft className="h-4 w-4 shrink-0" />
                  {t('tables.transfer_table')}
                </Button>
              )}
              {showCaptainTransfer && onTransferCaptain && (
                <Button
                  variant="ghost"
                  className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                  onClick={handleTransferCaptain}
                >
                  <UserRound className="h-4 w-4 shrink-0" />
                  {t('tables.transfer_captain')}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TableActionsMenu;
