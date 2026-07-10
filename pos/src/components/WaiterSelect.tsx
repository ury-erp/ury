import { useState, useRef, useEffect } from 'react';
import React from 'react';
import { ChevronDown, Loader } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { Button } from './ui';
import { getWaiters, Waiter } from '../lib/invoice-api';
import { t } from '../i18n';

interface WaiterSelectProps {
  disabled?: boolean;
}

/**
 * Waiter picker in the cart, mirroring CustomerSelect: a combobox that lists
 * every active employee (filterable by typing). The chosen employee name is
 * stored on the order and printed on the KOT and bill.
 */
export function WaiterSelect({ disabled }: WaiterSelectProps) {
  const { selectedWaiter, setSelectedWaiter, isUpdatingOrder } = usePOSStore();
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the full employee list once, the first time the dropdown is opened.
  useEffect(() => {
    if (!isOpen || loaded) return;
    setIsLoading(true);
    getWaiters()
      .then((list) => {
        setWaiters(list);
        setLoaded(true);
      })
      .catch(() => setWaiters([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, loaded]);

  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? waiters.filter((w) => (w.employee_name || w.name).toLowerCase().includes(term))
    : waiters;

  const selectWaiter = (waiter: Waiter) => {
    setSelectedWaiter(waiter.employee_name || waiter.name);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      setHighlightedIndex(0);
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (isOpen && filtered[highlightedIndex]) {
        selectWaiter(filtered[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {selectedWaiter ? (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
          <div>
            <p className="font-medium text-blue-900">{selectedWaiter}</p>
            <p className="text-sm text-blue-700">{t('waiter.label')}</p>
          </div>
          <Button
            onClick={() => setSelectedWaiter(null)}
            disabled={isUpdatingOrder || disabled}
            variant="ghost"
            size="sm"
            className="text-blue-700 hover:text-blue-800"
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
                setHighlightedIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setTimeout(() => setIsOpen(false), 100)}
              onKeyDown={handleKeyDown}
              placeholder={t('waiter.search_placeholder')}
              className="w-full h-10 border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
              aria-label={t('waiter.search_placeholder')}
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {isOpen && (
            <div className="absolute w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center p-4 text-gray-500 text-sm select-none">
                  <Loader className="w-4 h-4 mr-2 animate-spin" /> {t('common.loading')}
                </div>
              )}
              {!isLoading &&
                filtered.map((waiter, idx) => (
                  <button
                    key={waiter.name}
                    type="button"
                    className={`w-full px-4 py-2 text-left rounded-md text-gray-800 text-sm select-none transition-colors ${
                      idx === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                    }`}
                    onMouseDown={() => selectWaiter(waiter)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    <div className="font-medium">{waiter.employee_name || waiter.name}</div>
                  </button>
                ))}
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
