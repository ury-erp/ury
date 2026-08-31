import React from 'react';
import { ClosingPaymentSummary } from '../lib/pos-closing-api';
import { Input, DataTable, type DataTableColumn } from '@ury/ui';
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

  const paymentColumns: DataTableColumn<ClosingPaymentSummary>[] = [
    { key: 'mode_of_payment', header: 'Payment Mode' },
    {
      key: 'opening_amount',
      header: 'Opening',
      align: 'right',
      render: (row) => formatCurrency(row.opening_amount),
    },
    {
      key: 'expected_amount',
      header: 'Expected',
      align: 'right',
      render: (row) => formatCurrency(row.expected_amount),
    },
    {
      key: 'closing_amount',
      header: 'Closing',
      render: (row) => (
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
      ),
    },
    {
      key: 'difference',
      header: 'Difference',
      align: 'right',
      render: (row) => {
        const difference = row.expected_amount - row.closing_amount;
        const hasDifference = Math.abs(difference) > 0.001;
        return (
          <span
            className={cn(
              'font-medium',
              hasDifference ? 'text-destructive' : 'text-success'
            )}
          >
            {formatCurrency(difference)}
          </span>
        );
      },
    },
  ];

  return <DataTable columns={paymentColumns} rows={rows} />;
};

export default ClosingPaymentTable;
