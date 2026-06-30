import {
  Package,
  AlertTriangle,
  XCircle,
  DollarSign,
} from 'lucide-react';
import { useReportsStore, InventoryReport } from '../../store/reports-store';
import { formatCurrency } from '../../lib/utils';
import { cn } from '../../lib/utils';
import { Badge } from '../ui';
import { t } from '../../i18n';

// Placeholder data for when backend isn't available yet
const placeholderInventory: InventoryReport = {
  from_date: new Date().toISOString().split('T')[0],
  to_date: new Date().toISOString().split('T')[0],
  summary: {
    total_items: 156,
    low_stock_items: 12,
    out_of_stock_items: 3,
    total_stock_value: 48750.0,
  },
  items: [
    { item_code: 'ITEM001', item_name: 'Chicken Breast (kg)', current_stock: 45, reorder_level: 20, stock_uom: 'kg', valuation_rate: 8.5, stock_value: 382.5, status: 'OK' },
    { item_code: 'ITEM002', item_name: 'Olive Oil (L)', current_stock: 8, reorder_level: 10, stock_uom: 'L', valuation_rate: 12.0, stock_value: 96.0, status: 'Low' },
    { item_code: 'ITEM003', item_name: 'Basmati Rice (kg)', current_stock: 60, reorder_level: 25, stock_uom: 'kg', valuation_rate: 3.2, stock_value: 192.0, status: 'OK' },
    { item_code: 'ITEM004', item_name: 'Fresh Salmon (kg)', current_stock: 0, reorder_level: 5, stock_uom: 'kg', valuation_rate: 22.0, stock_value: 0, status: 'Out of Stock' },
    { item_code: 'ITEM005', item_name: 'Garlic (kg)', current_stock: 12, reorder_level: 8, stock_uom: 'kg', valuation_rate: 4.5, stock_value: 54.0, status: 'OK' },
    { item_code: 'ITEM006', item_name: 'Parmesan Cheese (kg)', current_stock: 3, reorder_level: 5, stock_uom: 'kg', valuation_rate: 18.0, stock_value: 54.0, status: 'Low' },
    { item_code: 'ITEM007', item_name: 'White Wine (bottle)', current_stock: 0, reorder_level: 6, stock_uom: 'bottle', valuation_rate: 14.0, stock_value: 0, status: 'Out of Stock' },
    { item_code: 'ITEM008', item_name: 'Butter (kg)', current_stock: 15, reorder_level: 10, stock_uom: 'kg', valuation_rate: 6.0, stock_value: 90.0, status: 'OK' },
    { item_code: 'ITEM009', item_name: 'Heavy Cream (L)', current_stock: 4, reorder_level: 8, stock_uom: 'L', valuation_rate: 5.5, stock_value: 22.0, status: 'Low' },
    { item_code: 'ITEM010', item_name: 'Tomatoes (kg)', current_stock: 30, reorder_level: 15, stock_uom: 'kg', valuation_rate: 2.8, stock_value: 84.0, status: 'OK' },
  ],
};

const InventoryReportView = () => {
  const { inventoryReport } = useReportsStore();

  // Use real data if available, otherwise use placeholder
  const report = inventoryReport || placeholderInventory;

  if (!report) {
    return (
      <div className="text-center py-12 text-gray-400">
        {t('reports.inventory.noData') || 'Select a period to generate an inventory report'}
      </div>
    );
  }

  const { summary, items } = report;

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case 'OK':
        return 'success';
      case 'Low':
        return 'warning';
      case 'Out of Stock':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'OK':
        return <Package className="w-3 h-3" />;
      case 'Low':
        return <AlertTriangle className="w-3 h-3" />;
      case 'Out of Stock':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={t('reports.inventory.totalItems') || 'Total Items'}
          value={`${summary.total_items}`}
          icon={<Package className="w-5 h-5 text-blue-600" />}
          color="blue"
        />
        <SummaryCard
          title={t('reports.inventory.lowStock') || 'Low Stock Items'}
          value={`${summary.low_stock_items}`}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          color="amber"
        />
        <SummaryCard
          title={t('reports.inventory.outOfStock') || 'Out of Stock'}
          value={`${summary.out_of_stock_items}`}
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          color="red"
        />
        <SummaryCard
          title={t('reports.inventory.totalValue') || 'Total Stock Value'}
          value={formatCurrency(summary.total_stock_value)}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          color="emerald"
        />
      </div>

      {/* Low Stock Alert */}
      {(summary.low_stock_items > 0 || summary.out_of_stock_items > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">
              {summary.out_of_stock_items > 0 && (
                <>{summary.out_of_stock_items} {t('reports.inventory.outOfStockAlert') || 'items out of stock'}</>
              )}
              {summary.out_of_stock_items > 0 && summary.low_stock_items > 0 && ' • '}
              {summary.low_stock_items > 0 && (
                <>{summary.low_stock_items} {t('reports.inventory.lowStockAlert') || 'items running low'}</>
              )}
            </p>
            <p className="text-xs text-amber-600">
              {t('reports.inventory.reorderNote') || 'Consider reordering to maintain adequate stock levels'}
            </p>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {t('reports.inventory.stockLevels') || 'Current Stock Levels'}
        </h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="text-start py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.item') || 'Item'}</th>
                <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.currentStock') || 'Current Stock'}</th>
                <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.reorderLevel') || 'Reorder Level'}</th>
                <th className="text-center py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.status') || 'Status'}</th>
                <th className="text-start py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.unit') || 'Unit'}</th>
                <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.inventory.value') || 'Value'}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.item_code}
                  className={cn(
                    'border-b border-gray-50 hover:bg-gray-50 transition-colors',
                    item.status === 'Out of Stock' && 'bg-red-50/50',
                    item.status === 'Low' && 'bg-amber-50/30'
                  )}
                >
                  <td className="py-2 px-3 font-medium text-gray-900">{item.item_name}</td>
                  <td className={cn(
                    'py-2 px-3 text-end font-medium',
                    item.status === 'Out of Stock' && 'text-red-600',
                    item.status === 'Low' && 'text-amber-600',
                    item.status === 'OK' && 'text-gray-900'
                  )}>
                    {item.current_stock}
                  </td>
                  <td className="py-2 px-3 text-end text-gray-500">{item.reorder_level}</td>
                  <td className="py-2 px-3 text-center">
                    <Badge
                      variant={statusBadgeVariant(item.status)}
                      size="sm"
                      className="inline-flex items-center gap-1"
                    >
                      {statusIcon(item.status)}
                      {item.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-gray-500">{item.stock_uom}</td>
                  <td className="py-2 px-3 text-end font-medium">{formatCurrency(item.stock_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Summary card component
const SummaryCard = ({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
  };

  return (
    <div className={cn('rounded-lg border p-4', colorMap[color] || 'bg-gray-50 border-gray-100')}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{title}</p>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
};

export default InventoryReportView;
