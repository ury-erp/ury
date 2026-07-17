import { ChefHat, Loader2, Printer, X } from 'lucide-react';
import { Button } from './ui';

interface PrintChoiceDialogProps {
  isOpen: boolean;
  tableName: string | null;
  /** Which option is currently printing — both buttons lock while set. */
  busy: 'kot' | 'bill' | null;
  onClose: () => void;
  onPrintKot: () => void;
  onPrintBill: () => void;
}

/**
 * Table-page print chooser: KOT (full order to the billing-area printer,
 * codes & qty, no prices) or Bill (the normal bill flow, which may open
 * payment). Shown only when the POS Profile enables KOT reprint — otherwise
 * the Print button goes straight to the bill.
 */
const PrintChoiceDialog = ({
  isOpen,
  tableName,
  busy,
  onClose,
  onPrintKot,
  onPrintBill,
}: PrintChoiceDialogProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Print{tableName ? ` — ${tableName}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onPrintKot}
            disabled={!!busy}
            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {busy === 'kot' ? (
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 shrink-0" />
            ) : (
              <ChefHat className="w-6 h-6 text-gray-500 shrink-0" />
            )}
            <span>
              <span className="block text-sm font-semibold text-gray-900">KOT</span>
              <span className="block text-xs text-gray-500">
                Full order — item codes &amp; qty, no prices
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onPrintBill}
            disabled={!!busy}
            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {busy === 'bill' ? (
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 shrink-0" />
            ) : (
              <Printer className="w-6 h-6 text-gray-500 shrink-0" />
            )}
            <span>
              <span className="block text-sm font-semibold text-gray-900">Bill</span>
              <span className="block text-xs text-gray-500">Customer bill</span>
            </span>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PrintChoiceDialog;
