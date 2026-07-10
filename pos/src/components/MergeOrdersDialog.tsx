import { Loader2, Merge, X } from 'lucide-react';
import { Button } from './ui';
import { formatCurrency } from '../lib/utils';
import type { POSInvoice } from '../lib/invoice-api';

interface MergeOrdersDialogProps {
  isOpen: boolean;
  primary: POSInvoice | null;
  orders: POSInvoice[];
  selected: string[];
  merging: boolean;
  onToggle: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Pick the open orders to fold into `primary`, producing a single bill.
 *
 * Only orders the server will accept are offered: same customer, not yet
 * printed. Merging releases the other tables immediately, so this is meant to
 * be done when the guests are ready to pay.
 */
const MergeOrdersDialog = ({
  isOpen,
  primary,
  orders,
  selected,
  merging,
  onToggle,
  onClose,
  onConfirm,
}: MergeOrdersDialogProps) => {
  if (!isOpen || !primary) return null;

  const candidates = orders.filter(
    (o) =>
      o.name !== primary.name &&
      o.customer === primary.customer &&
      String(o.invoice_printed) !== '1'
  );

  const mergedTotal =
    (primary.grand_total || 0) +
    candidates
      .filter((o) => selected.includes(o.name))
      .reduce((sum, o) => sum + (o.grand_total || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Merge Orders</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Everything selected is added to{' '}
          <span className="font-medium text-gray-800">{primary.name}</span>
          {primary.restaurant_table ? ` (${primary.restaurant_table})` : ''} and billed together.
        </p>

        {candidates.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No other open orders for {primary.customer}.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border-y border-gray-100">
            {candidates.map((order) => {
              const checked = selected.includes(order.name);
              return (
                <label
                  key={order.name}
                  className="flex items-center gap-3 py-3 px-1 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={merging}
                    onChange={() => onToggle(order.name)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{order.name}</p>
                    <p className="text-xs text-gray-500">
                      {order.restaurant_table || order.order_type}
                    </p>
                  </div>
                  <span className="text-sm text-gray-700">{formatCurrency(order.grand_total || 0)}</span>
                </label>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            The other tables are released once merged — do this when the guests are ready to pay.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Bill total <span className="font-semibold text-gray-900">{formatCurrency(mergedTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={merging || selected.length === 0}>
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <Merge className="w-4 h-4 me-2" />
                  Merge {selected.length > 0 ? `(${selected.length})` : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MergeOrdersDialog;
