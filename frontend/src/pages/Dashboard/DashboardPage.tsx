import React, { useState, useEffect } from 'react';
import { Page, Section } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
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
  }, [activeBranchId]);

  return (
    <Page>
      {/* 1. KPI Stat Cards Grid */}
      <Section>
        <KPIGrid summary={summary} loading={loading} />
      </Section>

      {/* 2. Analytics & Distribution Charts (Commented out for now) */}
      {/* <AnalyticsCharts chartsData={chartsData} loading={loading} /> */}

      {/* 3. Live Recent Transactions */}
      <Section>
        <ReportWidgets recentTransactions={recentTransactions} loading={loading} />
      </Section>
    </Page>
  );
};

export default DashboardPage;
