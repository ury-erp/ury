import { Input } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { t } from '../i18n';
import type { POSOpeningPayment } from '../lib/pos-opening-api';

interface POSOpeningPaymentTableProps {
  payments: POSOpeningPayment[];
  onChange: (payments: POSOpeningPayment[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
}

const POSOpeningPaymentTable = ({
  payments,
  onChange,
  readOnly = false,
  disabled = false,
}: POSOpeningPaymentTableProps) => {
  const handleAmountChange = (mode: string, value: string) => {
    const parsed = value === '' ? 0 : parseFloat(value);
    const amount = Number.isNaN(parsed) ? 0 : parsed;

    const nextPayments = payments.map((payment) =>
      payment.mode_of_payment === mode
        ? { ...payment, opening_amount: amount }
        : payment
    );

    onChange(nextPayments);
  };

  const total = payments.reduce((sum, payment) => sum + (payment.opening_amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left font-medium text-gray-700 px-4 py-3">
                {t('pos_opening.mode_of_payment')}
              </th>
              <th className="text-right font-medium text-gray-700 px-4 py-3 w-44">
                {t('pos_opening.opening_amount')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((payment) => (
              <tr key={payment.mode_of_payment}>
                <td className="px-4 py-3 text-gray-900">
                  {payment.mode_of_payment}
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.opening_amount || ''}
                    onChange={(e) => handleAmountChange(payment.mode_of_payment, e.target.value)}
                    disabled={disabled || readOnly}
                    className="text-right"
                    size="sm"
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm px-1">
        <span className="font-medium text-gray-700">
          {t('pos_opening.total_opening_balance')}
        </span>
        <span className="font-semibold text-gray-900">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
};

export default POSOpeningPaymentTable;
