import { Pencil, Trash2, Star, Ban, Check, ArrowUpDown, ArrowUp, ArrowDown, ImageOff } from 'lucide-react';
import { Button, Badge } from '../ui';
import { cn } from '../../lib/utils';
import { formatCurrency } from '../../lib/utils';
import { URYMenuItem } from '../../lib/menu-management-api';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { t } from '../../i18n';

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface MenuItemsListProps {
  items: URYMenuItem[];
  menuName: string;
  onEditItem: (item: URYMenuItem) => void;
  selectedItems: Set<string>;
  onToggleSelect: (itemName: string) => void;
  onToggleSelectAll: () => void;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
}

const MenuItemsList = ({
  items,
  menuName,
  onEditItem,
  selectedItems,
  onToggleSelect,
  onToggleSelectAll,
  sortConfig,
  onSort,
}: MenuItemsListProps) => {
  const { removeItemFromMenu, updateItemInMenu, availableItems } = useMenuManagementStore();

  // Build a lookup map for available item images
  const imageLookup = new Map<string, string | null>();
  for (const ai of availableItems) {
    imageLookup.set(ai.name, ai.image);
  }

  const allSelected = items.length > 0 && items.every((item) => selectedItems.has(item.name));
  const someSelected = items.some((item) => selectedItems.has(item.name)) && !allSelected;

  const handleToggleDisabled = async (item: URYMenuItem) => {
    await updateItemInMenu(menuName, item.name, {
      disabled: item.disabled ? 0 : 1,
    });
  };

  const handleDelete = async (item: URYMenuItem) => {
    if (confirm(t('menu_management.confirm_delete_item') || `Remove "${item.item_name}" from menu?`)) {
      await removeItemFromMenu(menuName, item.name);
    }
  };

  const SortableHeader = ({ columnKey, label, className = '' }: { columnKey: string; label: string; className?: string }) => {
    const isActive = sortConfig?.key === columnKey;
    return (
      <th
        className={cn(
          'px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700 transition-colors',
          className
        )}
        onClick={() => onSort(columnKey)}
      >
        <div className={cn('flex items-center gap-1', className.includes('text-end') && 'justify-end', className.includes('text-center') && 'justify-center')}>
          {label}
          {isActive ? (
            sortConfig.direction === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-blue-600" />
            ) : (
              <ArrowDown className="w-3 h-3 text-blue-600" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={onToggleSelectAll}
                className="rounded border-gray-300"
              />
            </th>
            <SortableHeader columnKey="item_name" label={t('menu_management.item_name') || 'Item'} />
            <SortableHeader columnKey="course" label={t('menu_management.course') || 'Course'} className="text-start" />
            <SortableHeader columnKey="rate" label={t('menu_management.price') || 'Price'} className="text-end" />
            <SortableHeader columnKey="disabled" label={t('common.status') || 'Status'} className="text-center" />
            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              {t('menu_management.special') || 'Special'}
            </th>
            <th className="text-end px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              {t('common.actions') || 'Actions'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const isSelected = selectedItems.has(item.name);
            const itemImage = imageLookup.get(item.item) || null;

            return (
              <tr
                key={item.name}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  item.disabled && 'opacity-50',
                  isSelected && 'bg-blue-50/60'
                )}
              >
                <td className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(item.name)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Image thumbnail */}
                    <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                      {itemImage ? (
                        <img
                          src={itemImage}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageOff className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                      <p className="text-xs text-gray-400">{item.item}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {item.course ? (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs">
                      {item.course}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-end text-sm font-medium text-gray-900">
                  {formatCurrency(item.rate)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggleDisabled(item)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                      item.disabled
                        ? 'bg-red-50 text-red-600'
                        : 'bg-emerald-50 text-emerald-600'
                    )}
                  >
                    {item.disabled ? (
                      <>
                        <Ban className="w-3 h-3" />
                        {t('menu_management.disabled') || 'Disabled'}
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        {t('menu_management.active') || 'Active'}
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  {item.special_dish ? (
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500 inline" />
                  ) : (
                    <span className="text-gray-300">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditItem(item)}
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MenuItemsList;
