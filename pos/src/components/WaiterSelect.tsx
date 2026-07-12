import { useState, useRef, useEffect } from 'react';
import React from 'react';
import { ChevronDown, Loader } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { Button } from './ui';
import { getWaiters, Waiter } from '../lib/invoice-api';
import { WaiterAvatar } from './WaiterAvatar';
import { t } from '../i18n';

interface WaiterSelectProps {
  disabled?: boolean;
}

/**
 * Waiter picker in the cart. A single search box: focusing (or typing in) it
 * opens a grid of employee avatars with names, filtered as you type — so the
 * server can pick a waiter at a glance, faster than reading a text list. The
 * chosen employee name is stored on the order and printed on the KOT and bill.
 */
export function WaiterSelect({ disabled }: WaiterSelectProps) {
  const { selectedWaiter, setSelectedWaiter, isUpdatingOrder } = usePOSStore();
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the employee list once on mount so both the grid and the selected
  // chip's avatar are ready without waiting for the picker to be opened.
  useEffect(() => {
    setIsLoading(true);
    getWaiters()
      .then((list) => setWaiters(list))
      .catch(() => setWaiters([]))
      .finally(() => setIsLoading(false));
  }, []);

  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? waiters.filter((w) => (w.employee_name || w.name).toLowerCase().includes(term))
    : waiters;

  // The selected waiter is stored as a display name; recover its avatar from
  // the loaded list (may be absent until the list finishes loading).
  const selectedWaiterInfo = selectedWaiter
    ? waiters.find((w) => (w.employee_name || w.name) === selectedWaiter)
    : undefined;

  const selectWaiter = (waiter: Waiter) => {
    setSelectedWaiter(waiter.employee_name || waiter.name);
    setSearchTerm('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      selectWaiter(filtered[0]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      {selectedWaiter ? (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <WaiterAvatar name={selectedWaiter} image={selectedWaiterInfo?.image} size={40} />
            <div className="min-w-0">
              <p className="font-medium text-blue-900 truncate">{selectedWaiter}</p>
              <p className="text-sm text-blue-700">{t('waiter.label')}</p>
            </div>
          </div>
          <Button
            onClick={() => setSelectedWaiter(null)}
            disabled={isUpdatingOrder || disabled}
            variant="ghost"
            size="sm"
            className="text-blue-700 hover:text-blue-800 shrink-0"
          >
            {t('common.change')}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center relative">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              disabled={disabled}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setTimeout(() => setIsOpen(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder={t('waiter.search_placeholder')}
              className="w-full h-10 border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
              aria-label={t('waiter.search_placeholder')}
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {isOpen && (
            <div className="absolute w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto p-2">
              {isLoading && (
                <div className="flex items-center justify-center p-4 text-gray-500 text-sm select-none">
                  <Loader className="w-4 h-4 mr-2 animate-spin" /> {t('common.loading')}
                </div>
              )}
              {!isLoading && filtered.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {filtered.map((waiter) => {
                    const label = waiter.employee_name || waiter.name;
                    return (
                      <button
                        key={waiter.name}
                        type="button"
                        onMouseDown={() => selectWaiter(waiter)}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-lg border border-transparent hover:border-primary-200 hover:bg-primary-50 transition-colors select-none"
                        title={label}
                      >
                        <WaiterAvatar name={label} image={waiter.image} size={48} />
                        <span className="text-xs text-center text-gray-700 leading-tight line-clamp-2 w-full">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-sm select-none">
                  {t('waiter.no_waiters_found')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
