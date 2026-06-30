import { CheckSquare, XSquare, Trash2, DollarSign, X } from 'lucide-react';
import { Button } from '../ui';
import { t } from '../../i18n';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onEnableSelected: () => void;
  onDisableSelected: () => void;
  onDeleteSelected: () => void;
  onBatchUpdatePrices: () => void;
  onClearSelection: () => void;
}

const BulkActionsToolbar = ({
  selectedCount,
  onEnableSelected,
  onDisableSelected,
  onDeleteSelected,
  onBatchUpdatePrices,
  onClearSelection,
}: BulkActionsToolbarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg mb-2">
      <span className="text-sm font-medium text-amber-800 me-2">
        {t('common.selected_count', { count: String(selectedCount) }) || `${selectedCount} selected`}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={onEnableSelected}
        className="flex items-center gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
      >
        <CheckSquare className="w-3.5 h-3.5" />
        {t('menu_management.enable_selected') || 'Enable'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDisableSelected}
        className="flex items-center gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50"
      >
        <XSquare className="w-3.5 h-3.5" />
        {t('menu_management.disable_selected') || 'Disable'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onBatchUpdatePrices}
        className="flex items-center gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
      >
        <DollarSign className="w-3.5 h-3.5" />
        {t('menu_management.batch_update_prices') || 'Batch Prices'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onDeleteSelected}
        className="flex items-center gap-1.5 text-red-700 border-red-300 hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('menu_management.delete_selected') || 'Delete'}
      </Button>

      <div className="ms-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="text-gray-500"
        >
          <X className="w-4 h-4 me-1" />
          {t('common.deselect_all') || 'Clear'}
        </Button>
      </div>
    </div>
  );
};

export default BulkActionsToolbar;
