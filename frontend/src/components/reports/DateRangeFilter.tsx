import { useState } from "react";
import {
  DayPicker,
  type DateRange,
} from "react-day-picker";
import "react-day-picker/style.css";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export interface DateRangeValue {
  from: Date;
  to: Date;
}

export interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
}

const PRESETS = [
  {
    label: "Today",
    getRange: (): DateRangeValue => {
      const today = new Date();
      return { from: startOfDay(today), to: endOfDay(today) };
    },
  },
  {
    label: "This Week",
    getRange: (): DateRangeValue => {
      const today = new Date();
      return { from: startOfWeek(today), to: endOfWeek(today) };
    },
  },
  {
    label: "This Month",
    getRange: (): DateRangeValue => {
      const today = new Date();
      return { from: startOfMonth(today), to: endOfMonth(today) };
    },
  },
];

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange = { from: value.from, to: value.to };

  const handleSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
    }
  };

  const applyPreset = (range: DateRangeValue) => {
    onChange(range);
    setOpen(false);
  };

  const label = `${format(value.from, "MMM d, yyyy")} - ${format(
    value.to,
    "MMM d, yyyy"
  )}`;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-between gap-2 rounded-md border border-input bg-muted px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80"
      >
        <span className="font-mono tabular-nums">{label}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-2 w-auto min-w-[20rem] rounded-md border bg-white p-3 shadow-md">
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.getRange())}
                className="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <DayPicker
            mode="range"
            selected={selectedRange}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  );
}
