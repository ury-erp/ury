import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Input } from '@ury/ui';
import { validateFieldValue } from '@ury/core';
import { SearchableSelect } from '../common/SearchableSelect';
import { DatePicker } from './DatePicker';
import type { SetupPayload } from '../../services/setup';
import validationMessages from '../../data/validations.json';

type SelectOption = { value: string; label: string };

interface FormField {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  validations?: string[];
  description?: string;
  optionsKey?: string;
  colSpan?: number;
}

interface FormSection {
  label?: string;
  fields: FormField[];
}

interface FormSchema {
  fields?: FormField[];
  company?: FormField[];
  general?: FormField[];
}

export interface DynamicFormHandle {
  validate(): boolean;
  getValues(): SetupPayload;
  setFieldValue(id: string, value: string): void;
}

interface DynamicFormProps {
  schema: FormSchema;
  optionsMap: Record<string, SelectOption[]>;
  onFieldChange?: (fieldId: string, value: string) => void;
}

const getColSpanClass = (field: FormField) => {
  if (field.id === 'company_name') return 'col-span-12 md:col-span-7';
  if (field.id === 'company_abbr') return 'col-span-12 md:col-span-5';
  if (field.colSpan === 12) return 'col-span-12';
  return 'col-span-12 md:col-span-6';
};

export const DynamicForm = forwardRef<DynamicFormHandle, DynamicFormProps>(
  ({ schema, optionsMap, onFieldChange }, ref) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const sections = useMemo<FormSection[]>(() => {
      if (schema.fields?.length) return [{ fields: schema.fields }];

      const result: FormSection[] = [];
      if (schema.company?.length) {
        result.push({ label: 'Company Details', fields: schema.company });
      }
      if (schema.general?.length) {
        result.push({ label: 'General Settings', fields: schema.general });
      }
      return result;
    }, [schema]);

    const allFields = useMemo(
      () => sections.flatMap((section) => section.fields),
      [sections],
    );

    const setFieldValue = useCallback((id: string, value: string, notify = false) => {
      setValues((current) => ({ ...current, [id]: value }));
      setErrors((current) => ({ ...current, [id]: '' }));
      if (notify) onFieldChange?.(id, value);
    }, [onFieldChange]);

    useImperativeHandle(ref, () => ({
      validate: () => {
        let isValid = true;
        const nextErrors: Record<string, string> = {};

        allFields.forEach((field) => {
          const result = validateFieldValue(
            values[field.id] ?? '',
            field.validations ?? [],
            validationMessages,
          );
          if (!result.valid) {
            isValid = false;
            nextErrors[field.id] = result.message;
          }
        });

        setErrors(nextErrors);
        return isValid;
      },
      getValues: () => values as unknown as SetupPayload,
      setFieldValue: (id, value) => setFieldValue(id, value),
    }), [allFields, setFieldValue, values]);

    return (
      <div className="w-full space-y-6">
        {sections.map((section, sectionIndex) => (
          <section key={section.label ?? sectionIndex} className="w-full space-y-4">
            {section.label && (
              <h3 className="text-md font-semibold text-foreground">{section.label}</h3>
            )}

            <div className="grid w-full grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-12">
              {section.fields.map((field) => {
                const value = values[field.id] ?? '';
                const error = errors[field.id];
                const options = field.optionsKey ? optionsMap[field.optionsKey] ?? [] : [];

                return (
                  <div key={field.id} className={getColSpanClass(field)}>
                    <div className="space-y-1.5">
                      <label htmlFor={field.id} className="text-sm font-medium text-gray-700">
                        {field.label}
                        {field.required && <span className="text-red-500"> *</span>}
                      </label>

                      {field.type === 'select' ? (
                        <SearchableSelect
                          id={field.id}
                          value={value}
                          options={options}
                          placeholder={field.placeholder ?? `Select ${field.label}...`}
                          error={Boolean(error)}
                          onChange={(_, newValue) => setFieldValue(field.id, newValue, true)}
                          strict
                        />
                      ) : field.type === 'date' ? (
                        <DatePicker
                          id={field.id}
                          value={value}
                          placeholder={field.placeholder ?? 'dd-mm-yyyy'}
                          error={Boolean(error)}
                          onChange={(_, newValue) => setFieldValue(field.id, newValue, true)}
                        />
                      ) : (
                        <Input
                          id={field.id}
                          type={field.type}
                          value={value}
                          placeholder={field.placeholder}
                          error={Boolean(error)}
                          onChange={(event) => setFieldValue(field.id, event.target.value, true)}
                        />
                      )}

                      {error ? (
                        <p className="pt-1 text-xs text-red-500">{error}</p>
                      ) : field.description ? (
                        <p className="pt-1 text-xs text-gray-500">{field.description}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  },
);

DynamicForm.displayName = 'DynamicForm';
