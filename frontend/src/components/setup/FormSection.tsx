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

  const getColSpanClass = (field: any) => {
    if (field.id === 'company_name') return 'col-span-12 md:col-span-7';
    if (field.id === 'company_abbr') return 'col-span-12 md:col-span-5';
    if (field.colSpan === 12) return 'col-span-12';
    return 'col-span-12 md:col-span-6';
  };

  return (
    <div className="space-y-4">
      {section.label && (
        <h3 className="text-md font-semibold text-foreground">{section.label}</h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-4">
        {fields.map((field: any) => {
          const options = field.optionsKey ? optionsMap[field.optionsKey] : undefined;
          return (
            <div key={field.id} className={getColSpanClass(field)}>
              <FieldRenderer
                field={field}
                value={values[field.id] || ''}
                error={errors[field.id]}
                options={options}
                onChange={onChange}
                onBlur={onBlur}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
