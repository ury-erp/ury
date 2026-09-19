import React, { useState, useEffect } from 'react';
import { ErrorState } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { t } from '../../i18n';
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
  const { activeBranchId } = useBranchContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartsData, setChartsData] = useState<DashboardChartsData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
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
      // Swallowing this left the KPI tiles to render their `?? 0` fallbacks,
      // so a failed request was indistinguishable from a day with no sales —
      // and a manager reading "0" has no reason to doubt it (UX-13).
      console.error('Failed to load dashboard data:', err);
      setError(parseFrappeError(err, t('dash.errors.failed_load')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeBranchId]);

  // Failure replaces the figures rather than colouring them. A dashboard
  // showing stale or zeroed numbers beside an error banner invites reading
  // the numbers anyway.
  if (error && !loading) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.errors.failed_load')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={fetchDashboardData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. KPI Stat Cards Grid */}
      <KPIGrid summary={summary} loading={loading} />

      {/* 2. Analytics & Distribution Charts (Commented out for now) */}
      {/* <AnalyticsCharts chartsData={chartsData} loading={loading} /> */}

      {/* 3. Live Recent Transactions */}
      <ReportWidgets recentTransactions={recentTransactions} loading={loading} />
    </div>
  );
};

export default DashboardPage;
