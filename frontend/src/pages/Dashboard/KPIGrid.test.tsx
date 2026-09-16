import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import KPIGrid from './KPIGrid';

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    formatCurrency: (amount: number) => `Rs. ${amount}`,
  };
});

vi.mock('@ury/ui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    KpiStrip: ({ items }: { items: any[] }) => (
      <div data-testid="kpi-strip">
        {items.map((item, idx) => (
          <div key={idx} data-testid={`kpi-item-${idx}`}>
            <div>{item.label}</div>
            <div>{item.value}</div>
          </div>
        ))}
      </div>
    ),
    Spinner: () => <div data-testid="spinner" />,
  };
});

const mockSummary = {
  today_sales: 5000,
  today_orders: 25,
  occupied_tables: 8,
  total_tables: 12,
  avg_order_value: 200,
  active_cashiers: 3,
  pending_kitchen_orders: 5,
  total_menu_items: 150,
};

describe('KPIGrid', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders loading spinner when loading is true', () => {
    render(<KPIGrid summary={mockSummary} loading={true} />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders KPI data when loading is false', () => {
    render(<KPIGrid summary={mockSummary} loading={false} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('displays formatted sales value', () => {
    render(<KPIGrid summary={mockSummary} loading={false} />);
    expect(screen.getByText('Rs. 5000')).toBeInTheDocument();
  });

  it('displays order count', () => {
    render(<KPIGrid summary={mockSummary} loading={false} />);
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('renders navigation links to POS and Mosaic', () => {
    render(<KPIGrid summary={mockSummary} loading={false} />);
    expect(screen.getByText('POS')).toBeInTheDocument();
    expect(screen.getByText('Mosaic')).toBeInTheDocument();
  });

  it('handles null summary gracefully', () => {
    render(<KPIGrid summary={null} loading={false} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });
});
