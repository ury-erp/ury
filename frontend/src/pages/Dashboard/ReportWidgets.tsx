import React, { useMemo } from 'react';
import { DataTable, DataTableColumn, Badge, Spinner, numericCellClass } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { useCurrency } from '../../context/CurrencyContext';
import { TransactionRecord } from '../../services/dashboard';
import { format as formatDate } from 'date-fns';
import { normalizeFrappeTime } from '@ury/core';
import { __ } from '../../i18n';

interface ReportWidgetsProps {
  recentTransactions: TransactionRecord[];
  loading: boolean;
}

export const ReportWidgets: React.FC<ReportWidgetsProps> = ({ recentTransactions, loading }) => {
  const { activeBranchId, activeBranch } = useBranchContext();
  const { format } = useCurrency();

  const activeBranchName = activeBranchId === 'all' ? __('All Branches') : (activeBranch?.name || __('Selected Branch'));

  const columns = useMemo<DataTableColumn<TransactionRecord>[]>(() => [
    {
      key: 'name',
      header: __('Invoice ID'),
      render: (row) => <bdi dir="ltr" className="num font-semibold text-primary">{row.name}</bdi>,
    },
    {
      key: 'customer',
      header: __('Customer'),
      render: (row) => <span>{row.customer || __('Walk-in Customer')}</span>,
    },
    {
      key: 'restaurant_table',
      header: __('Table / Location'),
      render: (row) => <span>{row.restaurant_table || __('Counter')}</span>,
    },
    {
      key: 'order_type',
      header: __('Order Type'),
      render: (row) => (
        <Badge
          variant="outline"
          className="border-primary/20 bg-primary/10 text-primary font-semibold"
        >
          {row.order_type || __('Dine In')}
        </Badge>
      ),
    },
    {
      key: 'posting_date',
      header: __('Date & Time'),
      render: (row) => {
        try {
          return <span>{formatDate(new Date(`${row.posting_date} ${normalizeFrappeTime(row.posting_time)}`), 'yyyy-MM-dd hh:mm:ss a')}</span>;
        } catch {
          return <span>{row.posting_date} {normalizeFrappeTime(row.posting_time)}</span>;
        }
      },
    },
    {
      key: 'status',
      header: __('Status'),
      render: (row) => (
        <Badge variant={row.status === 'Paid' || row.status === 'Submitted' ? 'success' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'grand_total',
      header: __('Grand Total'),
      align: 'right',
      render: (row) => <span className={numericCellClass}>{format(row.grand_total, row.currency)}</span>,
    },
  ], [format]);

  return (
    <div className="space-y-2">
      {/* Live POS Transactions */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{__('Live POS Transactions')}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {__('Real-time sales and active checkouts')}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6 text-primary" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={recentTransactions}
          emptyMessage={__('No transactions recorded yet today.')}
        />
      )}
    </div>
  );
};

export default ReportWidgets;
