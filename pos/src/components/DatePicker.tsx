import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';

interface DatePickerProps {
  id?: string;
  value: string; // YYYY-MM-DD
  placeholder?: string;
  error?: boolean;
  minDate?: string;
  maxDate?: string;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
  className?: string;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function useDropdownPosition(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  defaultWidth: number
) {
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const calculatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const dropdownWidth = dropdownRef.current?.getBoundingClientRect().width || defaultWidth;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    const gap = 4;
    const viewportMargin = 16;

    let left = containerRect.left;
    const top = containerRect.bottom + gap;

    if (left + dropdownWidth > viewportWidth - viewportMargin) {
      left = Math.max(viewportMargin, viewportWidth - viewportMargin - dropdownWidth);
    }

    setDropdownStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 9999,
    });
  }, [containerRef, dropdownRef, defaultWidth]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    calculatePosition();

    // Recalculate on next frame to ensure position settles accurately on first mount inside dialogs
    const rAF = requestAnimationFrame(() => {
      calculatePosition();
    });

    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
      cancelAnimationFrame(rAF);
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [isOpen, calculatePosition]);

  return dropdownStyle;
}

export function DatePicker({
  id = 'date-picker',
  value,
  placeholder = 'dd-mm-yyyy',
  error,
  minDate,
  maxDate,
  onChange,
  onBlur,
  className,
  disabled = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const dropdownStyle = useDropdownPosition(isOpen, containerRef, dropdownRef, 280);

  // Parse YYYY-MM-DD into Date object
  const selectedDate = useMemo(() => {
    if (!value) return new Date();
    const parts = value.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date();
  }, [value]);

  const [viewDate, setViewDate] = useState<Date>(selectedDate);

  useEffect(() => {
    setViewDate(selectedDate);
  }, [selectedDate]);

  // Display text formatted as DD-MM-YYYY
  const displayText = useMemo(() => {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length === 3) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    }
    return value;
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onBlur?.(id);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [id, onBlur]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        isPrev: true,
        dateStr: ''
      });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      days.push({
        day: d,
        isCurrentMonth: true,
        isPrev: false,
        dateStr: `${year}-${mStr}-${dStr}`
      });
    }

    const remaining = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        isPrev: false,
        dateStr: ''
      });
    }

    return days;
  }, [viewDate]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleSelectDay = (dateStr: string) => {
    if (!dateStr) return;
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;
    onChange(id, dateStr);
    setIsOpen(false);
    onBlur?.(id);
  };

  const handleTodayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const yStr = today.getFullYear();
    const mStr = String(today.getMonth() + 1).padStart(2, '0');
    const dStr = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yStr}-${mStr}-${dStr}`;

    if (minDate && todayStr < minDate) return;
    if (maxDate && todayStr > maxDate) return;

    setViewDate(today);
    onChange(id, todayStr);
    setIsOpen(false);
    onBlur?.(id);
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? 'w-full'}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full inline-flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none shadow-sm cursor-pointer transition-colors ${
          error ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span>{displayText || placeholder}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-400"
        >
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-[280px] focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="text-xs font-semibold text-gray-400 py-1">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((item, index) => {
              if (!item.isCurrentMonth) {
                return (
                  <div key={index} className="text-xs py-1.5 text-gray-300 select-none">
                    {item.day}
                  </div>
                );
              }

              const isSelected = item.dateStr === value;
              const isToday = item.dateStr === new Date().toISOString().slice(0, 10);
              const isDisabled = (minDate && item.dateStr < minDate) || (maxDate && item.dateStr > maxDate);

              return (
                <button
                  key={index}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(item.dateStr)}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-colors select-none ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold'
                      : isToday
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : isDisabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer - Today */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
