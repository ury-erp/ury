import React, { useState, useEffect, useRef } from 'react';
import { Page, Section } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { useCompanyContext } from '../../context/CompanyContext';
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
  const { activeCompanyId } = useCompanyContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartsData, setChartsData] = useState<DashboardChartsData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Only the latest request may write state: a company switch fires one fetch
  // with the old branch (before the branch list reloads) and another after,
  // and the earlier one must not land on top of the later one.
  const requestIdRef = useRef(0);

  const fetchDashboardData = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    // Drop the previous scope's figures so they never sit under the new one.
    setSummary(null);
    setChartsData(null);
    setRecentTransactions([]);
    try {
      const [sumRes, chartRes, txRes] = await Promise.all([
        dashboardService.getSummary(activeBranchId, activeCompanyId),
        dashboardService.getCharts(activeBranchId, activeCompanyId),
        dashboardService.getRecentTransactions(activeBranchId, 10, activeCompanyId),
      ]);
      if (requestId !== requestIdRef.current) return;
      setSummary(sumRes);
      setChartsData(chartRes);
      setRecentTransactions(txRes);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to load dashboard data:', err);
      setError('Unable to load Service Board data. Please retry.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeBranchId, activeCompanyId]);

  useEffect(() => () => {
    // Invalidate in-flight requests on unmount.
    requestIdRef.current += 1;
  }, []);

  return (
    <Page>
      {/* 1. KPI Stat Cards Grid */}
      <Section>
        {error ? (
          <p role="alert" className="py-8 text-destructive">{error}</p>
        ) : (
          <KPIGrid summary={summary} loading={loading} />
        )}
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
