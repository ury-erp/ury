import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ErrorState } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { t } from '../../i18n';
import KPIGrid from './KPIGrid';
import ReportWidgets from './ReportWidgets';
import { dashboardService, DashboardSummary } from '../../services/dashboard';

export const DashboardPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const sumRes = await dashboardService.getSummary(activeBranchId);
      if (currentRequest !== requestId.current) return;
      setSummary(sumRes);
    } catch (err) {
      // Swallowing this left the KPI tiles to render their `?? 0` fallbacks,
      // so a failed request was indistinguishable from a day with no sales —
      // and a manager reading "0" has no reason to doubt it (UX-13).
      console.error('Failed to load dashboard data:', err);
      if (currentRequest !== requestId.current) return;
      setError(parseFrappeError(err, t('dash.errors.failed_load')));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void fetchDashboardData();
    return () => { requestId.current += 1; };
  }, [fetchDashboardData]);

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

      {/* 3. Bills: filterable, paged, each opens its own page */}
      <ReportWidgets />
    </div>
  );
};

export default DashboardPage;
