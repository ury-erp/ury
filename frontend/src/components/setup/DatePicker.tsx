import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@ury/ui';

interface DatePickerProps {
  id: string;
  value: string; // Expects YYYY-MM-DD
  placeholder?: string;
  error?: boolean;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function DatePicker({
  id,
  value,
  placeholder = 'dd-mm-yyyy',
  error,
  onChange,
  onBlur
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

    setViewDate(today);
    onChange(id, todayStr);
    setIsOpen(false);
    onBlur?.(id);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        id={id}
        value={displayText}
        readOnly
        onClick={() => setIsOpen((prev) => !prev)}
        placeholder={placeholder}
        error={error}
        className="w-full cursor-pointer bg-card"
      />

      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-[100] bg-card border border-border rounded-lg shadow-xl p-4 w-[280px] focus:outline-none">
          {/* Header Month / Year Navigation */}
          <div className="flex items-center justify-between mb-4 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-muted-foreground hover:bg-muted transition-colors"
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
              onClick={handleNextMonth}
              className="p-1 rounded-full text-text-tertiary hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="text-xs font-semibold text-text-tertiary">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((item, index) => {
              if (!item.isCurrentMonth) {
                return (
                  <div key={index} className="text-sm py-1.5 text-text-tertiary select-none">
                    {item.day}
                  </div>
                );
              }

              const isSelected = item.dateStr === value;

              return (
                <div
                  key={index}
                  onClick={() => handleSelectDay(item.dateStr)}
                  className={`text-sm py-1.5 rounded-lg cursor-pointer font-medium transition-colors select-none ${
                    isSelected
                      ? 'bg-primary text-white font-bold'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {item.day}
                </div>
              );
            })}
          </div>

          {/* Footer Today Button */}
          <div className="border-t border-border pt-3 mt-3 text-center">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
