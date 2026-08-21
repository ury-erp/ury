import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner } from '@ury/ui';
import { TransactionRecord } from '../../services/dashboard';

interface ReportWidgetsProps {
  recentTransactions: TransactionRecord[];
  loading: boolean;
}

export const ReportWidgets: React.FC<ReportWidgetsProps> = ({ recentTransactions, loading }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Live POS Transactions */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5">
          <div>
            <CardTitle className="text-lg font-bold text-gray-900">
              {t('widgets.live_transactions')}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('widgets.subtitle')}
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
              <table className="w-full text-start text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3.5 text-start">{t('widgets.invoice_id')}</th>
                    <th className="px-5 py-3.5 text-start">{t('widgets.customer')}</th>
                    <th className="px-5 py-3.5 text-start">{t('widgets.table_location')}</th>
                    <th className="px-5 py-3.5 text-start">{t('widgets.order_type')}</th>
                    <th className="px-5 py-3.5 text-start">{t('widgets.datetime')}</th>
                    <th className="px-5 py-3.5 text-start">{t('widgets.status')}</th>
                    <th className="px-5 py-3.5 text-end">{t('widgets.grand_total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                        {t('widgets.empty')}
                      </td>
                    </tr>
                  ) : (
                    recentTransactions.map((tx) => (
                      <tr key={tx.name} className="hover:bg-primary/10 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-primary">{tx.name}</td>
                        <td className="px-5 py-3.5 text-gray-900 font-semibold">
                          {tx.customer || t('widgets.walk_in')}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {tx.restaurant_table || t('widgets.counter')}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant="outline"
                            className="border-primary/20 bg-primary/10 text-primary font-semibold"
                          >
                            {tx.order_type || t('widgets.dine_in')}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">{tx.posting_date} {tx.posting_time}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={tx.status === 'Paid' || tx.status === 'Submitted' ? 'success' : 'warning'}>
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-end font-bold text-gray-900">
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
