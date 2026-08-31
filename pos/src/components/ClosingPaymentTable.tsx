import React from 'react';
import { ClosingPaymentSummary } from '../lib/pos-closing-api';
import { Input } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { cn } from '@ury/ui';
import { t } from '../i18n';

interface ClosingPaymentTableProps {
  rows: ClosingPaymentSummary[];
  /** Modes the cashier has explicitly entered a closing amount for (see Fix 2). */
  touchedModes: Set<string>;
  onChange: (modeOfPayment: string, closingAmount: number) => void;
}

const ClosingPaymentTable: React.FC<ClosingPaymentTableProps> = ({
  rows,
  touchedModes,
  onChange,
}) => {
  const handleClosingAmountChange = (modeOfPayment: string, value: string) => {
    const parsed = parseFloat(value);
    // Clamp to non-negative in JS -- the HTML `min="0"` attribute alone does
    // not stop programmatic or pasted negative input.
    const closingAmount = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    onChange(modeOfPayment, closingAmount);
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-gray-50">
            <th className="text-left py-3 px-4 font-semibold text-gray-900">
              Payment Mode
            </th>
            <th className="text-right py-3 px-4 font-semibold text-gray-900">
              Opening
            </th>
            <th className="text-right py-3 px-4 font-semibold text-gray-900">
              <span
                title={t('pos_closing.help_expected')}
                className="inline-flex items-center gap-1 cursor-help"
              >
                Expected
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] leading-none text-gray-500"
                >
                  i
                </span>
              </span>
            </th>
            <th className="text-center py-3 px-4 font-semibold text-gray-900">
              <span
                title={t('pos_closing.help_closing')}
                className="inline-flex items-center gap-1 cursor-help"
              >
                Closing
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] leading-none text-gray-500"
                >
                  i
                </span>
              </span>
            </th>
            <th className="text-right py-3 px-4 font-semibold text-gray-900">
              <span
                title={t('pos_closing.help_difference')}
                className="inline-flex items-center gap-1 cursor-help"
              >
                Difference
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] leading-none text-gray-500"
                >
                  i
                </span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Positive = overage (cashier has more than expected), negative
            // = shortage. Must match the sign convention used in the submit
            // payload built by POSClosingDialog.handleSubmit.
            const difference = row.closing_amount - row.expected_amount;
            const hasDifference = Math.abs(difference) > 0.001;
            const isTouched = touchedModes.has(row.mode_of_payment);

            return (
              <tr
                key={row.mode_of_payment}
                className={cn(
                  'border-b border-border hover:bg-gray-50 transition-colors',
                  !isTouched && 'bg-amber-50/60'
                )}
              >
                <td className="py-3 px-4 text-gray-900 font-medium">
                  {row.mode_of_payment}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {formatCurrency(row.opening_amount)}
                </td>
                <td className="py-3 px-4 text-right text-gray-700">
                  {formatCurrency(row.expected_amount)}
                </td>
                <td className="py-3 px-4">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.closing_amount > 0 ? String(row.closing_amount) : ''}
                    onChange={(e) =>
                      handleClosingAmountChange(row.mode_of_payment, e.target.value)
                    }
                    placeholder="0.00"
                    className={cn('w-full text-center', !isTouched && 'border-amber-400')}
                    size="sm"
                  />
                </td>
                <td
                  className={cn(
                    'py-3 px-4 text-right font-medium',
                    hasDifference ? 'text-red-600' : 'text-green-600'
                  )}
                >
                  {formatCurrency(difference)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ClosingPaymentTable;
