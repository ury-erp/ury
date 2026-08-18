import React from 'react';
import { formatCurrency } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { TransactionRecord } from '../../services/dashboard';

interface ReportWidgetsProps {
  recentTransactions: TransactionRecord[];
  loading: boolean;
}

export const ReportWidgets: React.FC<ReportWidgetsProps> = ({ recentTransactions, loading }) => {
  const { activeBranchId, activeBranch } = useBranchContext();

  const activeBranchName = activeBranchId === 'all' ? 'All Branches' : (activeBranch?.name || 'Selected Branch');

  return (
    <div className="space-y-6">
      {/* Live POS Transactions */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5">
          <div>
            <CardTitle className="text-lg font-bold text-gray-900">
              Live POS Transactions
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time billing transactions from Frappe desk for {activeBranchName}
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3.5">Invoice ID</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Table / Location</th>
                    <th className="px-5 py-3.5">Order Type</th>
                    <th className="px-5 py-3.5">Date &amp; Time</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                        No transactions recorded yet today.
                      </td>
                    </tr>
                  ) : (
                    recentTransactions.map((tx) => (
                      <tr key={tx.name} className="hover:bg-primary/10 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-primary">{tx.name}</td>
                        <td className="px-5 py-3.5 text-gray-900 font-semibold">{tx.customer || 'Walk-in Customer'}</td>
                        <td className="px-5 py-3.5 text-gray-600">{tx.restaurant_table || 'Counter'}</td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant="outline"
                            className="border-primary/20 bg-primary/10 text-primary font-semibold"
                          >
                            {tx.order_type || 'Dine In'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">{tx.posting_date} {tx.posting_time}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={tx.status === 'Paid' || tx.status === 'Submitted' ? 'success' : 'warning'}>
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                          {formatCurrency(tx.grand_total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportWidgets;
