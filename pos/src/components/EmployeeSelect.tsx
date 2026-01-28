import { useState, useRef, useEffect } from 'react';
import { Loader, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePOSStore } from '../store/pos-store';
import { Button } from './ui';
import { searchEmployees, type EmployeeSearchResult } from '../lib/employee-api';
import { formatCurrency } from '../lib/utils';
import React from 'react';

interface EmployeeSelectProps {
  disabled?: boolean;
}

export function EmployeeSelect({ disabled }: EmployeeSelectProps) {
  const { t } = useTranslation();
  const { selectedEmployee, setSelectedEmployee, isUpdatingOrder } = usePOSStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [searchResults, setSearchResults] = useState<EmployeeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!isOpen || !searchTerm.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    const handler = setTimeout(() => {
      searchEmployees(searchTerm)
        .then(results => {
          setSearchResults(results);
          setIsSearching(false);
        })
        .catch(() => {
          setSearchError(t('employee.searchFailed'));
          setIsSearching(false);
        });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm, isOpen, t]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      setHighlightedIndex(0);
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (isOpen && searchResults[highlightedIndex]) {
        const emp = searchResults[highlightedIndex];
        setSelectedEmployee({
          id: emp.name,
          name: emp.employee_name,
          maxPrice: emp.max_price,
        });
        setSearchTerm('');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {selectedEmployee ? (
        <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg">
          <div>
            <p className="font-medium text-green-900">{selectedEmployee.name}</p>
            <p className="text-sm text-green-700">{selectedEmployee.id}</p>
            {selectedEmployee.maxPrice != null && (
              <p className="text-xs text-green-600">
                {t('employee.maxPrice')}: {formatCurrency(selectedEmployee.maxPrice)}
              </p>
            )}
          </div>
          <Button
            onClick={() => setSelectedEmployee(null)}
            disabled={isUpdatingOrder}
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-800"
          >
            {t('employee.change')}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center relative">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsOpen(false), 100);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('employee.searchPlaceholder')}
              className="w-full h-10 border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              aria-label={t('employee.searchPlaceholder')}
              autoComplete="off"
              disabled={disabled}
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {isOpen && (
            <div className="absolute w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
              {searchTerm.trim() === '' && !isSearching && !searchError && (
                <div className="p-4 text-center text-gray-400 text-sm select-none">
                  {t('employee.pleaseTypeToSearch')}
                </div>
              )}
              {isSearching && (
                <div className="flex items-center justify-center p-4 text-gray-500 text-sm select-none">
                  <Loader className="w-4 h-4 mr-2 animate-spin" /> {t('employee.searching')}
                </div>
              )}
              {searchError && (
                <div className="p-4 text-center text-red-500 text-sm select-none">{searchError}</div>
              )}
              {!isSearching && !searchError && searchResults.length > 0 && searchResults.map((emp, idx) => (
                <button
                  key={emp.name}
                  type="button"
                  className={`w-full gap-2 px-4 py-2 text-left rounded-md text-gray-800 text-sm select-none transition-colors ${
                    idx === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                  }`}
                  onMouseDown={() => {
                    setSelectedEmployee({
                      id: emp.name,
                      name: emp.employee_name,
                      maxPrice: emp.max_price,
                    });
                    setSearchTerm('');
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <div className="font-medium">{emp.employee_name}</div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{emp.name}</span>
                    {emp.max_price != null && (
                      <span>{t('employee.maxPrice')}: {formatCurrency(emp.max_price)}</span>
                    )}
                  </div>
                </button>
              ))}
              {!isSearching && !searchError && searchResults.length === 0 && searchTerm.trim() && (
                <div className="p-4 text-center text-gray-400 text-sm select-none">
                  {t('employee.noEmployeesFound')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
