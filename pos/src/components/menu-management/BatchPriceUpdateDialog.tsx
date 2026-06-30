import { useState, useMemo } from 'react';
import { X, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Button, Input } from '../ui';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { URYMenuItem } from '../../lib/menu-management-api';
import { formatCurrency } from '../../lib/utils';
import { t } from '../../i18n';

interface BatchPriceUpdateDialogProps {
  items: URYMenuItem[];
  menuName: string;
  onClose: () => void;
}

type ApplyMode = 'percentage' | 'fixed';

const BatchPriceUpdateDialog = ({ items, menuName, onClose }: BatchPriceUpdateDialogProps) => {
  const { batchUpdateItemPrices } = useMenuManagementStore();

  const [priceMap, setPriceMap] = useState<Record<string, number>>(
    Object.fromEntries(items.map((item) => [item.name, item.rate]))
  );
  const [applyMode, setApplyMode] = useState<ApplyMode>('percentage');
  const [applyValue, setApplyValue] = useState<string>('');
  const [applying, setApplying] = useState(false);

  const handleApplyToAll = () => {
    const val = parseFloat(applyValue);
    if (isNaN(val)) return;

    const newMap: Record<string, number> = {};
    for (const item of items) {
      let newPrice = item.rate;
      if (applyMode === 'percentage') {
        newPrice = item.rate * (1 + val / 100);
      } else {
        newPrice = item.rate + val;
      }
      newMap[item.name] = Math.max(0, Math.round(newPrice * 100) / 100);
    }
    setPriceMap(newMap);
  };

  const handleIndividualPriceChange = (itemName: string, newPrice: string) => {
    const parsed = parseFloat(newPrice);
    setPriceMap((prev) => ({
      ...prev,
      [itemName]: isNaN(parsed) ? 0 : Math.max(0, parsed),
    }));
  };

  const changes = useMemo(() => {
    return items.map((item) => {
      const newPrice = priceMap[item.name] ?? item.rate;
      const diff = newPrice - item.rate;
      const pctChange = item.rate !== 0 ? (diff / item.rate) * 100 : 0;
      return { item, newPrice, diff, pctChange };
    });
  }, [items, priceMap]);

  const hasChanges = changes.some((c) => c.diff !== 0);

  const handleUpdate = async () => {
    const updates = changes
      .filter((c) => c.diff !== 0)
      .map((c) => ({ item_row_name: c.item.name, rate: c.newPrice }));

    if (updates.length === 0) return;

    setApplying(true);
    try {
      await batchUpdateItemPrices(menuName, updates);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden m-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {t('menu_management.batch_update_prices') || 'Batch Update Prices'}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Apply to all section */}
        <div className="p-4 border-b bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t('menu_management.apply_to_all') || 'Apply to all selected'}
          </p>
          <div className="flex items-center gap-2">
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={applyMode}
              onChange={(e) => setApplyMode(e.target.value as ApplyMode)}
            >
              <option value="percentage">%</option>
              <option value="fixed">{t('menu_management.fixed_amount') || 'Fixed'}</option>
            </select>
            <Input
              type="number"
              step="0.01"
              placeholder={applyMode === 'percentage' ? '+10 / -5' : '+50 / -20'}
              value={applyValue}
              onChange={(e) => setApplyValue(e.target.value)}
              className="w-32"
            />
            <Button
              variant="outline"
              onClick={handleApplyToAll}
              disabled={!applyValue || isNaN(parseFloat(applyValue))}
              size="sm"
            >
              {t('common.apply') || 'Apply'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {applyMode === 'percentage'
              ? 'Enter a percentage (e.g. +10 for increase, -5 for decrease)'
              : 'Enter a fixed amount (e.g. +50 for increase, -20 for decrease)'}
          </p>
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="text-start px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  {t('menu_management.item_name') || 'Item Name'}
                </th>
                <th className="text-end px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  {t('menu_management.current_price') || 'Current Price'}
                </th>
                <th className="text-end px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  {t('menu_management.new_price') || 'New Price'}
                </th>
                <th className="text-end px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  {t('menu_management.change') || 'Change'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {changes.map(({ item, newPrice, diff, pctChange }) => (
                <tr key={item.name} className={diff !== 0 ? 'bg-amber-50/50' : ''}>
                  <td className="px-4 py-2">
                    <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-400">{item.item}</p>
                  </td>
                  <td className="px-4 py-2 text-end text-sm text-gray-600">
                    {formatCurrency(item.rate)}
                  </td>
                  <td className="px-4 py-2 text-end">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPrice}
                      onChange={(e) => handleIndividualPriceChange(item.name, e.target.value)}
                      className="w-28 ms-auto text-end"
                    />
                  </td>
                  <td className="px-4 py-2 text-end">
                    {diff !== 0 ? (
                      <span
                        className={`inline-flex items-center gap-1 text-sm font-medium ${
                          diff > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {diff > 0 ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )}
                        {formatCurrency(Math.abs(diff))}
                        <span className="text-xs">({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-gray-400 text-sm">
                        <Minus className="w-3 h-3 me-1" />
                        0
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500">
            {changes.filter((c) => c.diff !== 0).length} {t('menu_management.items_updated') || 'items will be updated'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button onClick={handleUpdate} disabled={!hasChanges || applying}>
              {applying
                ? (t('common.loading') || 'Updating...')
                : (t('menu_management.update_prices') || 'Update Prices')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchPriceUpdateDialog;
