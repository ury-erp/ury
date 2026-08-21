import { UryDateRangePicker, type DateRangeValue } from '../setup/DatePicker';

export type { DateRangeValue };

export interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  className?: string;
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  return <UryDateRangePicker value={value} onChange={onChange} className={className} />;
}

