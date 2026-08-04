import { useCallback } from 'react';
import { Input } from '@ury/ui';
import { SearchableSelect } from './SearchableSelect';
import { DatePicker } from './DatePicker';

interface Option {
  value: string;
  label: string;
}

interface FieldRendererProps {
  field: any;
  value: string;
  error?: string;
  options?: Option[];
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
}

export function FieldRenderer({ field, value, error, options, onChange, onBlur }: FieldRendererProps) {
  const handleBlur = useCallback(() => {
    onBlur?.(field.id);
  }, [field.id, onBlur]);

  const handleChange = useCallback((e: any) => {
    onChange(field.id, e.target.value);
  }, [field.id, onChange]);

  return (
    <div className="flex flex-col space-y-1.5">
      <label htmlFor={field.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {field.type === 'select' ? (
        <SearchableSelect
          id={field.id}
          value={value || ''}
          options={options || []}
          placeholder={field.placeholder || 'Select...'}
          error={!!error}
          onChange={onChange}
          onBlur={onBlur}
        />
      ) : field.type === 'date' ? (
        <DatePicker
          id={field.id}
          value={value || ''}
          placeholder={field.placeholder}
          error={!!error}
          onChange={onChange}
          onBlur={onBlur}
        />
      ) : (
        <div className="relative">
          <Input
            id={field.id}
            type={field.type === 'date' ? 'date' : 'text'}
            value={value || ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={field.placeholder}
            className={`w-full ${error ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-[#2B5CE6] focus-visible:border-[#2B5CE6]'}`}
          />
        </div>
      )}
      
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
