import React, { useMemo } from 'react';
import { formatCurrency } from '@ury/core';
import { Card, DataTable, DataTableColumn, Badge, Spinner, numericCellClass } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { TransactionRecord } from '../../services/dashboard';

interface ReportWidgetsProps {
  recentTransactions: TransactionRecord[];
  loading: boolean;
}

export const ReportWidgets: React.FC<ReportWidgetsProps> = ({ recentTransactions, loading }) => {
  const { activeBranchId, activeBranch } = useBranchContext();

  const activeBranchName = activeBranchId === 'all' ? 'All Branches' : (activeBranch?.name || 'Selected Branch');

  const columns = useMemo<DataTableColumn<TransactionRecord>[]>(() => [
    {
      key: 'name',
      header: 'Invoice ID',
      render: (row) => <span className="font-semibold text-primary">{row.name}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span>{row.customer || 'Walk-in Customer'}</span>,
    },
    {
      key: 'restaurant_table',
      header: 'Table / Location',
      render: (row) => <span>{row.restaurant_table || 'Counter'}</span>,
    },
    {
      key: 'order_type',
      header: 'Order Type',
      render: (row) => (
        <Badge
          variant="outline"
          className="border-primary/20 bg-primary/10 text-primary font-semibold"
        >
          {row.order_type || 'Dine In'}
        </Badge>
      ),
    },
    {
      key: 'posting_date',
      header: 'Date & Time',
      render: (row) => <span>{row.posting_date} {row.posting_time}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'Paid' || row.status === 'Submitted' ? 'success' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'grand_total',
      header: 'Grand Total',
      align: 'right',
      render: (row) => <span className={numericCellClass}>{formatCurrency(row.grand_total)}</span>,
    },
  ], []);

  return (
    <div className="space-y-2">
      {/* Live POS Transactions */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Live POS Transactions</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Real-time sales and active checkouts
        </p>
      </div>

      <Card className="p-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Spinner className="w-6 h-6 text-primary" />
          </div>
        ) : (
          <DataTable
            className="rounded-none border-0"
            columns={columns}
            rows={recentTransactions}
            emptyMessage="No transactions recorded yet today."
          />
        )}
      </Card>
    </div>
  );
};

export default ReportWidgets;
