import React from 'react';
import { ClosingPaymentSummary } from '../lib/pos-closing-api';
import { Input } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { cn } from '@ury/ui';

interface ClosingPaymentTableProps {
  rows: ClosingPaymentSummary[];
  onChange: (modeOfPayment: string, closingAmount: number) => void;
}

const ClosingPaymentTable: React.FC<ClosingPaymentTableProps> = ({ rows, onChange }) => {
  const handleClosingAmountChange = (modeOfPayment: string, value: string) => {
    const closingAmount = parseFloat(value) || 0;
    onChange(modeOfPayment, closingAmount);
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="text-left py-3 px-4 font-semibold text-foreground">
              Payment Mode
            </th>
            <th className="text-right py-3 px-4 font-semibold text-foreground">
              Opening
            </th>
            <th className="text-right py-3 px-4 font-semibold text-foreground">
              Expected
            </th>
            <th className="text-center py-3 px-4 font-semibold text-foreground">
              Closing
            </th>
            <th className="text-right py-3 px-4 font-semibold text-foreground">
              Difference
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const difference = row.expected_amount - row.closing_amount;
            const hasDifference = Math.abs(difference) > 0.001;

            return (
              <tr
                key={row.mode_of_payment}
                className="border-b border-border hover:bg-muted transition-colors"
              >
                <td className="py-3 px-4 text-foreground font-medium">
                  {row.mode_of_payment}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(row.opening_amount)}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
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
                    className="w-full text-center"
                    size="sm"
                  />
                </td>
                <td
                  className={cn(
                    'py-3 px-4 text-right font-medium',
                    hasDifference ? 'text-destructive' : 'text-success'
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
