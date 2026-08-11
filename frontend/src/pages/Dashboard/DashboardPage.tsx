import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { RefreshCw } from 'lucide-react';
import { Button } from '@ury/ui';
import KPIGrid from './KPIGrid';
import AnalyticsCharts from './AnalyticsCharts';
import ReportWidgets from './ReportWidgets';
import {
  dashboardService,
  DashboardSummary,
  DashboardChartsData,
  TransactionRecord,
} from '../../services/dashboard';

export const DashboardPage: React.FC = () => {
  const { activeBranchId, refreshTrigger } = useBranchContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartsData, setChartsData] = useState<DashboardChartsData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [sumRes, chartRes, txRes] = await Promise.all([
        dashboardService.getSummary(activeBranchId),
        dashboardService.getCharts(activeBranchId),
        dashboardService.getRecentTransactions(activeBranchId, 10),
      ]);
      setSummary(sumRes);
      setChartsData(chartRes);
      setRecentTransactions(txRes);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeBranchId, refreshTrigger]);

  return (
    <div className="space-y-6">
      {/* Refresh utility row */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDashboardData}
          disabled={loading}
          className="border-primary/20 text-primary hover:bg-primary/10 flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* 1. KPI Stat Cards Grid */}
      <KPIGrid summary={summary} loading={loading} />

      {/* 2. Analytics & Distribution Charts */}
      <AnalyticsCharts chartsData={chartsData} loading={loading} />

      {/* 3. Live Recent Transactions */}
      <ReportWidgets recentTransactions={recentTransactions} loading={loading} />
    </div>
  );
};

export default DashboardPage;
