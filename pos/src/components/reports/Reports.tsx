import { useState, useEffect, lazy, Suspense } from 'react';
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  GitCompareArrows,
} from 'lucide-react';
import { Button, Input, Spinner } from '../ui';
import { cn } from '../../lib/utils';
import { useReportsStore } from '../../store/reports-store';
import { isAIEnabled } from '../../lib/ai-service';
import { useAIStore } from '../../store/ai-store';
import { t } from '../../i18n';
import SalesReportView from './SalesReportView';
import ExpenseReportView from './ExpenseReportView';
import ProfitLossView from './ProfitLossView';
import InventoryReportView from './InventoryReportView';
import PeriodComparisonView from './PeriodComparisonView';

// Lazy-loaded AI Insights — only loaded when AI is enabled AND user opens it
const AIInsightsPanel = lazy(() => import('../ai/AIInsightsPanel'));

type ReportType = 'sales' | 'expense' | 'profit_loss' | 'inventory';
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'last_month';

const Reports = () => {
  const {
    selectedReportType,
    selectedPeriod,
    loading,
    exporting,
    comparePeriods,
    fetchCurrentReport,
    exportToPdf,
    exportToCsv,
    setSelectedReportType,
    setSelectedPeriod,
    setCustomDateRange,
    setComparePeriods,
    salesReport,
    expenseReport,
    profitLossReport,
    inventoryReport,
  } = useReportsStore();

  const { setReportContext, panelOpen } = useAIStore();
  const aiEnabled = isAIEnabled();

  const [showCustomDate, setShowCustomDate] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    fetchCurrentReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync report context to AI store when report type or data changes
  useEffect(() => {
    if (!aiEnabled) return;

    const reportDataMap: Record<string, Record<string, unknown>> = {
      sales: salesReport || {},
      expense: expenseReport || {},
      profit_loss: profitLossReport || {},
      inventory: inventoryReport || {},
    };

    setReportContext(
      selectedReportType,
      reportDataMap[selectedReportType] || {},
      'EUR'
    );
  }, [selectedReportType, salesReport, expenseReport, profitLossReport, inventoryReport, aiEnabled, setReportContext]);

  const handlePeriodChange = (period: ReportPeriod) => {
    setShowCustomDate(false);
    setSelectedPeriod(period);
  };

  const handleCustomDateApply = () => {
    if (customFrom && customTo) {
      setCustomDateRange(customFrom, customTo);
      setShowCustomDate(false);
    }
  };

  const reportTypes: { value: ReportType; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'sales', label: t('reports.types.sales') || 'Sales Report', icon: <ShoppingCart className="w-5 h-5" />, color: 'blue' },
    { value: 'expense', label: t('reports.types.expense') || 'Expense Report', icon: <DollarSign className="w-5 h-5" />, color: 'red' },
    { value: 'profit_loss', label: t('reports.types.profitLoss') || 'Profit & Loss', icon: <TrendingUp className="w-5 h-5" />, color: 'emerald' },
    { value: 'inventory', label: t('reports.types.inventory') || 'Inventory Report', icon: <Package className="w-5 h-5" />, color: 'violet' },
  ];

  const periods: { value: ReportPeriod; label: string }[] = [
    { value: 'daily', label: t('reports.periods.today') || 'Today' },
    { value: 'yesterday', label: t('reports.periods.yesterday') || 'Yesterday' },
    { value: 'weekly', label: t('reports.periods.thisWeek') || 'This Week' },
    { value: 'monthly', label: t('reports.periods.thisMonth') || 'This Month' },
    { value: 'last_month', label: t('reports.periods.lastMonth') || 'Last Month' },
    { value: 'last_7_days', label: t('reports.periods.last7Days') || 'Last 7 Days' },
    { value: 'last_30_days', label: t('reports.periods.last30Days') || 'Last 30 Days' },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6" data-testid="page-reports">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-600" />
            {t('reports.title') || 'Reports'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('reports.subtitle') || 'Generate and export detailed reports'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Compare Periods Toggle */}
          {selectedReportType === 'sales' && (
            <Button
              variant={comparePeriods ? 'default' : 'outline'}
              size="sm"
              onClick={() => setComparePeriods(!comparePeriods)}
              className="flex items-center gap-2"
            >
              <GitCompareArrows className="w-4 h-4" />
              {comparePeriods
                ? (t('reports.compare.hide') || 'Hide Comparison')
                : (t('reports.compare.show') || 'Compare Periods')
              }
            </Button>
          )}

          {/* CSV Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('reports.exportCsv') || 'Export CSV'}
          </Button>

          {/* PDF Export Button */}
          <Button
            onClick={exportToPdf}
            disabled={exporting || loading}
            size="sm"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? (t('reports.generating') || 'Generating...') : (t('reports.exportPdf') || 'Export PDF')}
          </Button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {reportTypes.map((type) => (
          <button
            key={type.value}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              selectedReportType === type.value
                ? cn(
                    type.color === 'blue' && 'bg-blue-50 text-blue-700 border border-blue-200',
                    type.color === 'red' && 'bg-red-50 text-red-700 border border-red-200',
                    type.color === 'emerald' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    type.color === 'violet' && 'bg-violet-50 text-violet-700 border border-violet-200'
                  )
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-transparent'
            )}
            onClick={() => setSelectedReportType(type.value)}
          >
            {type.icon}
            {type.label}
          </button>
        ))}
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {periods.map((p) => (
          <button
            key={p.value}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              selectedPeriod === p.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => handlePeriodChange(p.value)}
          >
            {p.label}
          </button>
        ))}
        <button
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
            showCustomDate
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
          onClick={() => setShowCustomDate(!showCustomDate)}
        >
          <Calendar className="w-4 h-4 inline me-1" />
          {t('reports.periods.custom') || 'Custom'}
        </button>
      </div>

      {/* Custom Date Range */}
      {showCustomDate && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('reports.dateFrom') || 'From'}</label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('reports.dateTo') || 'To'}</label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCustomDateApply}
            disabled={!customFrom || !customTo}
            className="mt-5"
          >
            {t('reports.apply') || 'Apply'}
          </Button>
        </div>
      )}

      {/* Report Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner className="w-8 h-8 mx-auto mb-3" />
            <p className="text-gray-500">{t('reports.loading') || 'Generating report...'}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          {/* Period Comparison View (shown when compare toggle is active for sales) */}
          {comparePeriods && selectedReportType === 'sales' && <PeriodComparisonView />}

          {/* Regular report views */}
          {!comparePeriods && selectedReportType === 'sales' && <SalesReportView />}
          {selectedReportType === 'expense' && <ExpenseReportView />}
          {selectedReportType === 'profit_loss' && <ProfitLossView />}
          {selectedReportType === 'inventory' && <InventoryReportView />}
        </div>
      )}

      {/* AI Insights Panel — lazy-loaded, only rendered when AI is enabled */}
      {aiEnabled && (
        <Suspense fallback={null}>
          <AIInsightsPanel />
        </Suspense>
      )}
    </div>
  );
};

export default Reports;
