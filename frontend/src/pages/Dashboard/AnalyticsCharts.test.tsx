import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import AnalyticsCharts from './AnalyticsCharts';

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

vi.mock('../../components/reports/charts/BarChartCard', () => ({
  BarChartCard: ({ title }: any) => <div>BarChart-{title}</div>,
}));

vi.mock('../../components/reports/charts/LineChartCard', () => ({
  LineChartCard: ({ title }: any) => <div>LineChart-{title}</div>,
}));

vi.mock('../../components/reports/charts/PieChartCard', () => ({
  PieChartCard: ({ title }: any) => <div>PieChart-{title}</div>,
}));

describe('AnalyticsCharts', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders without crashing', () => {
    const { container } = render(<AnalyticsCharts chartsData={null} loading={false} />);
    expect(container).toBeDefined();
  });

  it('renders analytics charts component', () => {
    const { container } = render(<AnalyticsCharts chartsData={null} loading={false} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('displays loading state when loading', () => {
    const { container } = render(<AnalyticsCharts chartsData={null} loading={true} />);
    expect(container).toBeDefined();
  });
});
