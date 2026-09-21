import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import {
  addDays,
  addMonths,
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

// The trigger is a button but it stands in for a form control, so its size
// scale is the Input/Select/Button one rather than a set of metrics of its
// own -- a DatePicker in a filter toolbar has to line up with whatever sits
// next to it.
const triggerVariants = cva(
  [
    'inline-flex items-center justify-between gap-2 rounded-md border bg-card',
    'font-medium text-foreground shadow-sm cursor-pointer transition-colors',
    'hover:bg-muted/50 focus:outline-none',
  ],
  {
    variants: {
      size: {
        default: 'h-11 px-3.5 py-2 text-sm',
        sm: 'h-9 px-3 py-1.5 text-xs',
        lg: 'h-12 px-4 py-3 text-base',
        compactLg: 'h-9 px-3.5 py-1.5 text-[13px] rounded-[7px]',
      },
    },
    defaultVariants: { size: 'default' },
  }
);

export type DatePickerSize = NonNullable<VariantProps<typeof triggerVariants>['size']>;

export interface DatePickerProps {
  id?: string;
  size?: DatePickerSize;
  value: string; // Expects YYYY-MM-DD
  placeholder?: string;
  error?: boolean;
  maxDate?: string;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
  className?: string;
  /** The trigger is a <button>, not an <input>, so a wrapping <label> gives
   *  it no accessible name -- filter call sites must pass one explicitly. */
  'aria-label'?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Full weekday names for the column headers' accessible text -- "SU" is a
 *  visual abbreviation, and a screen reader should not have to spell it. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local-calendar YYYY-MM-DD. Deliberately not toISOString().slice(0, 10),
 *  which converts to UTC first and lands on the wrong day either side of
 *  midnight -- the same bug SalesPlanPage's getToday() works around. */
const toDateStr = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const fromDateStr = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** Split the flat 35/42-cell run into weeks, so the grid can expose one
 *  `role="row"` per week the way a calendar grid is meant to be read. */
function chunkWeeks<T>(cells: T[]): T[][] {
  const weeks: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Roving-tabindex keyboard navigation for a calendar grid.
 *
 * The day cells were `<div onClick>`: not focusable, not in the tab order,
 * and with no way to pick a date from the keyboard at all. Making each one a
 * real `<button>` fixes that, but 42 buttons in the tab order is its own kind
 * of unusable -- so only the focused day is tabbable and the arrow keys move
 * between them, which is the grid pattern a date picker is expected to follow.
 *
 * Returns the focused day (as YYYY-MM-DD) plus the keydown handler; the
 * caller renders `tabIndex={dateStr === focusedDate ? 0 : -1}` and keeps its
 * own `viewDate` in step so the focused day is actually on screen.
 */
function useCalendarKeyboard(
  isOpen: boolean,
  initialDate: () => string,
  setViewDate: React.Dispatch<React.SetStateAction<Date>>
) {
  const [focusedDate, setFocusedDate] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setFocusedDate(initialDate());
    // `initialDate` is read only on the open transition -- re-running this
    // whenever the caller's closure changes would yank focus back mid-navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusedDate) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [isOpen, focusedDate]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!focusedDate) return;
    const current = fromDateStr(focusedDate);
    let next: Date;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = startOfWeek(current);
        break;
      case 'End':
        next = endOfWeek(current);
        break;
      case 'PageUp':
        next = addMonths(current, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(current, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    // Both updates have to land in the SAME commit. Paging the month from an
    // effect instead put the new month in a later render than the one the
    // focus effect saw, and because React reuses the day nodes across that
    // re-render, focus stayed put on a button that had silently become a
    // different date.
    setFocusedDate(toDateStr(next));
    setViewDate((prev) =>
      prev.getFullYear() === next.getFullYear() && prev.getMonth() === next.getMonth()
        ? prev
        : new Date(next.getFullYear(), next.getMonth(), 1)
    );
  };

  return { focusedDate, setFocusedDate, gridRef, handleKeyDown };
}

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
  className,
  size,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const { focusedDate, gridRef, handleKeyDown } = useCalendarKeyboard(
    isOpen,
    () => {
      const start = value || toDateStr(new Date());
      return maxDate && start > maxDate ? maxDate : start;
    },
    setViewDate
  );

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

  const closeAndRestoreFocus = () => {
    setIsOpen(false);
    onBlur?.(id);
    triggerRef.current?.focus();
  };

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
    <div
      ref={containerRef}
      className={cn('relative w-full', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          closeAndRestoreFocus();
        }
      }}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'w-full',
          triggerVariants({ size }),
          error ? 'border-destructive' : 'border-input hover:border-ring'
        )}
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
          className="lucide lucide-chevron-down-icon lucide-chevron-down shrink-0 text-text-tertiary"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label={ariaLabel ? `${ariaLabel} calendar` : 'Choose a date'}
          style={dropdownStyle}
          className="absolute top-[calc(100%+4px)] z-[100] bg-card border border-border rounded-xl shadow-xl p-3 w-[280px] max-w-[calc(100vw-32px)] focus:outline-none"
        >
          {/* Header Month / Year Navigation */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={handlePrevMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewDate.getMonth()]}, {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={handleNextMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Days Grid */}
          <div
            ref={gridRef}
            role="grid"
            aria-label={`${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`}
            onKeyDown={handleKeyDown}
          >
            <div role="row" className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAYS.map((wd, weekdayIndex) => (
                <span
                  key={wd}
                  role="columnheader"
                  aria-label={WEEKDAY_NAMES[weekdayIndex]}
                  className="text-xs font-semibold text-text-tertiary"
                >
                  {wd}
                </span>
              ))}
            </div>

            {chunkWeeks(calendarDays).map((week, weekIndex) => (
              <div role="row" key={weekIndex} className="grid grid-cols-7 gap-1 text-center">
                {week.map((item, index) => {
                  // Padding from the neighbouring months: shown for alignment,
                  // not selectable, so it stays out of the accessibility tree
                  // instead of announcing a day that does nothing.
                  if (!item.isCurrentMonth) {
                    return (
                      <div
                        key={index}
                        role="gridcell"
                        aria-hidden="true"
                        className="text-sm py-1 text-muted-foreground/50 select-none"
                      >
                        {item.day}
                      </div>
                    );
                  }

                  const isSelected = item.dateStr === value;
                  const isDisabled = maxDate ? item.dateStr > maxDate : false;
                  const isToday = item.dateStr === toDateStr(new Date());

                  return (
                    <div role="gridcell" key={index} aria-selected={isSelected}>
                      <button
                        type="button"
                        data-date={item.dateStr}
                        disabled={isDisabled}
                        tabIndex={item.dateStr === focusedDate ? 0 : -1}
                        aria-label={format(fromDateStr(item.dateStr), 'd MMMM yyyy')}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => handleSelectDay(item.dateStr)}
                        className={cn(
                          'w-full text-sm py-1 rounded-lg font-medium transition-colors select-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isDisabled
                            ? 'text-muted-foreground/50 cursor-not-allowed'
                            : isSelected
                              ? 'bg-foreground text-background font-bold cursor-pointer'
                              : 'text-foreground hover:bg-muted cursor-pointer'
                        )}
                      >
                        {item.day}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer Today Button */}
          <div className="border-t border-border pt-2 mt-2 text-center">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
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
  size?: DatePickerSize;
}

export function UryDateRangePicker({ value, onChange, className, size }: UryDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rangeSelection, setRangeSelection] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownStyle = useDropdownPosition(isOpen, containerRef, dropdownRef, 300);

  const [viewDate, setViewDate] = useState<Date>(() => value.from ?? new Date());

  const { focusedDate, gridRef, handleKeyDown } = useCalendarKeyboard(
    isOpen,
    () => toDateStr(value.from ?? new Date()),
    setViewDate
  );

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

  const closeAndRestoreFocus = () => {
    setIsOpen(false);
    setRangeSelection({ from: null, to: null });
    setHoverDate(null);
    triggerRef.current?.focus();
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
    <div
      ref={containerRef}
      className={`relative inline-block ${className ?? ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          closeAndRestoreFocus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Date range: ${labelText}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(triggerVariants({ size }), 'border-input')}
      >
        <span>{labelText}</span>
        <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Choose a date range"
          style={dropdownStyle}
          className="absolute top-[calc(100%+8px)] z-[100] bg-card border border-border rounded-2xl shadow-xl p-4 w-[300px] max-w-[calc(100vw-32px)] focus:outline-none"
        >
          {/* Presets Header */}
          <div className="flex items-center justify-between gap-1.5 pb-3 mb-3 border-b border-border">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.getRange())}
                className="flex-1 px-2 py-1 text-xs font-medium text-muted-foreground bg-muted hover:bg-primary/10 hover:text-primary rounded-lg transition-colors text-center"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Month / Year Header */}
          <div className="flex items-center justify-between mb-4 px-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={handlePrevMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewDate.getMonth()]}, {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={handleNextMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Days Grid */}
          <div
            ref={gridRef}
            role="grid"
            aria-label={`${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`}
            onKeyDown={handleKeyDown}
          >
            <div role="row" className="grid grid-cols-7 gap-1 text-center mb-2">
              {WEEKDAYS.map((wd, weekdayIndex) => (
                <span
                  key={wd}
                  role="columnheader"
                  aria-label={WEEKDAY_NAMES[weekdayIndex]}
                  className="text-xs font-semibold text-text-tertiary"
                >
                  {wd}
                </span>
              ))}
            </div>

            {chunkWeeks(calendarDays).map((week, weekIndex) => (
              <div role="row" key={weekIndex} className="grid grid-cols-7 gap-1 text-center">
                {week.map((item, index) => {
                  if (!item.isCurrentMonth) {
                    return (
                      <div
                        key={index}
                        role="gridcell"
                        aria-hidden="true"
                        className="text-sm py-1.5 text-muted-foreground/50 select-none"
                      >
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

                  let styleClasses = 'text-foreground hover:bg-muted rounded-lg';
                  if (isStart && isEnd) {
                    styleClasses = 'bg-foreground text-background font-bold rounded-lg';
                  } else if (isStart) {
                    styleClasses = 'bg-foreground text-background font-bold rounded-l-lg';
                  } else if (isEnd) {
                    styleClasses = 'bg-foreground text-background font-bold rounded-r-lg';
                  } else if (inRange) {
                    styleClasses = 'bg-primary/10 text-primary font-medium rounded-none';
                  }

                  const dateStr = toDateStr(item.dateObj);
                  const isToday = dateStr === toDateStr(new Date());

                  return (
                    <div role="gridcell" key={index} aria-selected={Boolean(isStart || isEnd || inRange)}>
                      <button
                        type="button"
                        data-date={dateStr}
                        tabIndex={dateStr === focusedDate ? 0 : -1}
                        aria-label={format(item.dateObj, 'd MMMM yyyy')}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => handleDayClick(item.dateObj)}
                        onFocus={() => rangeSelection.from && !rangeSelection.to && setHoverDate(item.dateObj)}
                        onMouseEnter={() => rangeSelection.from && !rangeSelection.to && setHoverDate(item.dateObj)}
                        className={cn(
                          'w-full text-sm py-1.5 cursor-pointer transition-colors select-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          styleClasses
                        )}
                      >
                        {item.day}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

