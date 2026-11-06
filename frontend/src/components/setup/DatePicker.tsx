import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from 'date-fns';

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface DatePickerProps {
  id?: string;
  value: string; // Expects YYYY-MM-DD
  placeholder?: string;
  error?: boolean;
  maxDate?: string;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
  className?: string;
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({ left: '0px' });

  const calculatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const dropdownWidth = dropdownRef.current?.getBoundingClientRect().width || defaultWidth;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    // Find the enclosing content container (e.g. <main>, .space-y-6, or page root)
    const boundaryEl =
      containerRef.current.closest('main') ||
      containerRef.current.closest('.space-y-6') ||
      document.documentElement;

    const boundaryRect = boundaryEl.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(boundaryEl);
    const paddingRight = parseFloat(computedStyle.paddingRight || '0');
    const paddingLeft = parseFloat(computedStyle.paddingLeft || '0');

    const gap = 8;
    const viewportMargin = 16;

    // Max allowed right coordinate in viewport pixels
    const containerMaxRight = boundaryRect.right - paddingRight - gap;
    const viewportMaxRight = viewportWidth - viewportMargin;
    const maxRight = Math.min(containerMaxRight, viewportMaxRight);

    // Min allowed left coordinate in viewport pixels
    const containerMinLeft = boundaryRect.left + paddingLeft + gap;
    const minLeft = Math.max(viewportMargin, containerMinLeft);

    let offsetLeft = 0;
    const rightEdge = containerRect.left + dropdownWidth;

    if (rightEdge > maxRight) {
      offsetLeft = maxRight - rightEdge;
    }

    if (containerRect.left + offsetLeft < minLeft) {
      offsetLeft = minLeft - containerRect.left;
    }

    setDropdownStyle({ left: `${offsetLeft}px` });
  }, [containerRef, dropdownRef, defaultWidth]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    calculatePosition();

    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
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
  maxDate,
  onChange,
  onBlur,
  className
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

  // Sync viewDate when value changes
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

  // Close calendar popup on outside click
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

  // Calendar grid calculations
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        isPrev: true,
        dateStr: ''
      });
    }

    // Current month days
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

    // Next month padding days to complete 35 or 42 cells
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
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full inline-flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none shadow-sm cursor-pointer transition-colors ${
          error ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'
        }`}
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
          className="lucide lucide-chevron-down-icon lucide-chevron-down shrink-0 text-gray-400"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="absolute top-[calc(100%+4px)] z-[100] bg-white border border-gray-100 rounded-xl shadow-xl p-3 w-[280px] max-w-[calc(100vw-32px)] focus:outline-none"
        >
          {/* Header Month / Year Navigation */}
          <div className="flex items-center justify-between mb-2 px-1">
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
              {MONTH_NAMES[viewDate.getMonth()]}, {viewDate.getFullYear()}
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
              <span key={wd} className="text-xs font-semibold text-gray-400">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((item, index) => {
              if (!item.isCurrentMonth) {
                return (
                  <div key={index} className="text-sm py-1 text-gray-300 select-none">
                    {item.day}
                  </div>
                );
              }

              const isSelected = item.dateStr === value;
              const isDisabled = maxDate ? item.dateStr > maxDate : false;

              return (
                <div
                  key={index}
                  onClick={() => !isDisabled && handleSelectDay(item.dateStr)}
                  className={`text-sm py-1 rounded-lg font-medium transition-colors select-none ${
                    isDisabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : isSelected
                      ? 'bg-primary text-white font-bold cursor-pointer'
                      : 'text-gray-800 hover:bg-gray-100 cursor-pointer'
                  }`}
                >
                  {item.day}
                </div>
              );
            })}
          </div>

          {/* Footer Today Button */}
          <div className="border-t border-gray-100 pt-2 mt-2 text-center">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface UryDateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  className?: string;
}

export function UryDateRangePicker({ value, onChange, className }: UryDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownStyle = useDropdownPosition(isOpen, containerRef, dropdownRef, 300);

  const [viewDate, setViewDate] = useState<Date>(() => value.from ?? new Date());

  useEffect(() => {
    setViewDate(value.from ?? new Date());
  }, [value.from]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setRangeSelection({ from: null, to: null });
        setHoverDate(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const applyPreset = (presetRange: DateRangeValue) => {
    onChange(presetRange);
    setIsOpen(false);
    setRangeSelection({ from: null, to: null });
    setHoverDate(null);
  };

  const presets = [
    {
      label: 'Today',
      getRange: (): DateRangeValue => {
        const today = new Date();
        return { from: startOfDay(today), to: endOfDay(today) };
      },
    },
    {
      label: 'This Week',
      getRange: (): DateRangeValue => {
        const today = new Date();
        return { from: startOfWeek(today), to: endOfWeek(today) };
      },
    },
    {
      label: 'This Month',
      getRange: (): DateRangeValue => {
        const today = new Date();
        return { from: startOfMonth(today), to: endOfMonth(today) };
      },
    },
  ];

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        dateObj: new Date(year, month - 1, prevMonthDays - i),
      });
    }

    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        dateObj: new Date(year, month, d),
      });
    }

    // Next month padding
    const remaining = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        dateObj: new Date(year, month + 1, i),
      });
    }

    return days;
  }, [viewDate]);

  const activeFrom = rangeSelection.from ?? value.from;
  const activeTo = rangeSelection.from && !rangeSelection.to ? hoverDate : (rangeSelection.to ?? value.to);

  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const handleDayClick = (dateObj: Date) => {
    if (!rangeSelection.from || (rangeSelection.from && rangeSelection.to)) {
      // First click: set start date
      setRangeSelection({ from: startOfDay(dateObj), to: null });
    } else {
      // Second click: set end date
      let fromDate = rangeSelection.from;
      let toDate = endOfDay(dateObj);

      if (dateObj < fromDate) {
        toDate = endOfDay(fromDate);
        fromDate = startOfDay(dateObj);
      }

      onChange({ from: fromDate, to: toDate });
      setRangeSelection({ from: null, to: null });
      setHoverDate(null);
      setIsOpen(false);
    }
  };

  const labelText = `${format(value.from, 'MMM d, yyyy')} - ${format(value.to, 'MMM d, yyyy')}`;

  return (
    <div ref={containerRef} className={`relative inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none shadow-sm"
      >
        <span>{labelText}</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="absolute top-[calc(100%+8px)] z-[100] bg-white border border-gray-100 rounded-2xl shadow-xl p-4 w-[300px] max-w-[calc(100vw-32px)] focus:outline-none"
        >
          {/* Presets Header */}
          <div className="flex items-center justify-between gap-1.5 pb-3 mb-3 border-b border-gray-100">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.getRange())}
                className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors text-center"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Month / Year Header */}
          <div className="flex items-center justify-between mb-4 px-1">
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
              {MONTH_NAMES[viewDate.getMonth()]}, {viewDate.getFullYear()}
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
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="text-xs font-semibold text-gray-400">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((item, index) => {
              if (!item.isCurrentMonth) {
                return (
                  <div key={index} className="text-sm py-1.5 text-gray-300 select-none">
                    {item.day}
                  </div>
                );
              }

              const isStart = isSameDay(item.dateObj, activeFrom);
              const isEnd = isSameDay(item.dateObj, activeTo);
              const inRange =
                activeFrom &&
                activeTo &&
                item.dateObj >= startOfDay(activeFrom < activeTo ? activeFrom : activeTo) &&
                item.dateObj <= endOfDay(activeFrom < activeTo ? activeTo : activeFrom);

              let styleClasses = 'text-gray-800 hover:bg-gray-100 rounded-lg';
              if (isStart && isEnd) {
                styleClasses = 'bg-primary text-white font-bold rounded-lg';
              } else if (isStart) {
                styleClasses = 'bg-primary text-white font-bold rounded-l-lg';
              } else if (isEnd) {
                styleClasses = 'bg-primary text-white font-bold rounded-r-lg';
              } else if (inRange) {
                styleClasses = 'bg-primary/10 text-primary font-medium rounded-none';
              }

              return (
                <div
                  key={index}
                  onClick={() => handleDayClick(item.dateObj)}
                  onMouseEnter={() => rangeSelection.from && !rangeSelection.to && setHoverDate(item.dateObj)}
                  className={`text-sm py-1.5 cursor-pointer transition-colors select-none ${styleClasses}`}
                >
                  {item.day}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

