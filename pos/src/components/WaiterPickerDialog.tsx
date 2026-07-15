import { useEffect, useState } from 'react';
import { Check, Loader, Search, UserRound } from 'lucide-react';
import { Dialog, DialogContent } from './ui';
import { Button } from './ui/button';
import { getWaiters, Waiter } from '../lib/invoice-api';
import { WaiterAvatar } from './WaiterAvatar';
import { t } from '../i18n';

interface WaiterPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Label of the confirm button (e.g. "Add New Order" / "Update Order"). */
  confirmLabel: string;
  /** Called with the chosen waiter only when the confirm button is pressed. */
  onConfirm: (waiter: string) => void;
}

/**
 * Blocking waiter picker shown when an order is submitted without a waiter.
 * Selecting an avatar only highlights it — the order is placed when the user
 * presses the confirm button, never on selection itself.
 */
export function WaiterPickerDialog({ open, onClose, confirmLabel, onConfirm }: WaiterPickerDialogProps) {
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearchTerm('');
    setSelected(null);
    setIsLoading(true);
    getWaiters()
      .then((list) => setWaiters(list))
      .catch(() => setWaiters([]))
      .finally(() => setIsLoading(false));
  }, [open]);

  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? waiters.filter((w) => (w.employee_name || w.name).toLowerCase().includes(term))
    : waiters;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent onClose={onClose} className="w-full max-w-lg p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <UserRound className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 leading-tight">
                {t('waiter.dialog_title')}
              </h3>
              <p className="text-sm text-gray-500">{t('waiter.required_message')}</p>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('waiter.search_placeholder')}
              className="w-full h-10 border border-gray-200 rounded-lg ps-9 pe-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              aria-label={t('waiter.search_placeholder')}
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        <div className="px-6 py-4 max-h-80 overflow-y-auto bg-gray-50/50">
          {isLoading && (
            <div className="flex items-center justify-center p-8 text-gray-500 text-sm select-none">
              <Loader className="w-4 h-4 me-2 animate-spin" /> {t('common.loading')}
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((waiter) => {
                const label = waiter.employee_name || waiter.name;
                const isSelected = selected === label;
                return (
                  <button
                    key={waiter.name}
                    type="button"
                    onClick={() => setSelected(label)}
                    className={
                      isSelected
                        ? 'relative flex flex-col items-center gap-2 p-3 rounded-xl bg-blue-50 border-2 border-blue-500 shadow-sm select-none'
                        : 'relative flex flex-col items-center gap-2 p-3 rounded-xl bg-white border-2 border-transparent shadow-sm hover:border-blue-200 hover:bg-blue-50/50 transition-colors select-none'
                    }
                    title={label}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                    <WaiterAvatar name={label} image={waiter.image} size={52} />
                    <span className="text-xs text-center text-gray-800 font-medium leading-tight line-clamp-2 w-full">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm select-none">
              {t('waiter.no_waiters_found')}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            className="flex-1"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
