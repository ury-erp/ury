import { Card, CardContent } from '@ury/ui';
import { FieldRenderer } from './FieldRenderer';

interface FormSectionProps {
  section: any;
  values: Record<string, string>;
  errors: Record<string, string>;
  optionsMap: Record<string, { value: string; label: string }[]>;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
}

export function FormSection({ section, values, errors, optionsMap, onChange, onBlur }: FormSectionProps) {
  const fields = Array.isArray(section?.fields) ? section.fields : [];
  if (fields.length === 0) return null;

  return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {fields.map((field: any) => {
            const options = field.optionsKey ? optionsMap[field.optionsKey] : undefined;
            return (
              <FieldRenderer
                key={field.id}
                field={field}
                value={values[field.id] || ''}
                error={errors[field.id]}
                options={options}
                onChange={onChange}
                onBlur={onBlur}
              />
            );
          })}
        </div>
  );
}
