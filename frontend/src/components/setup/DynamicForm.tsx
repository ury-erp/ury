import { forwardRef, useImperativeHandle, useState, useCallback, useMemo } from 'react';
import { validateFieldValue } from '@ury/core';
import { FormSection } from './FormSection';
import { SetupPayload } from '../../services/setup';

export interface DynamicFormHandle {
  validate(): boolean;
  getValues(): SetupPayload;
  setFieldValue(id: string, value: string): void;
}

interface DynamicFormProps {
  schema: any;
  optionsMap: Record<string, { value: string; label: string }[]>;
  onFieldChange?: (fieldId: string, value: string) => void;
}

export const DynamicForm = forwardRef<DynamicFormHandle, DynamicFormProps>(
  ({ schema, optionsMap, onFieldChange }, ref) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const setFieldValue = useCallback((id: string, value: string) => {
      setValues((prev) => ({ ...prev, [id]: value }));
      setErrors((prev) => ({ ...prev, [id]: '' }));
    }, []);

    const allFields = useMemo(() => {
      return [...(schema.general || []), ...(schema.company || [])];
    }, [schema]);

    const sections = useMemo(() => {
      const result = [];
      if (schema.general?.length) {
        result.push({
          label: 'General Settings',
          fields: schema.general
        });
      }
      if (schema.company?.length) {
        result.push({
          label: 'Company Details',
          fields: schema.company
        });
      }
      return result;
    }, [schema]);

    useImperativeHandle(ref, () => ({
      validate: () => {
        let isValid = true;
        const newErrors: Record<string, string> = {};

        allFields.forEach((field: any) => {
          if (field.validations) {
            const { valid, message } = validateFieldValue(values[field.id] || '', field.validations);
            if (!valid) {
              isValid = false;
              newErrors[field.id] = message;
            }
          }
        });

        setErrors(newErrors);
        return isValid;
      },
      getValues: () => {
        return values as unknown as SetupPayload;
      },
      setFieldValue
    }), [allFields, values, setFieldValue]);

    const handleChange = useCallback((id: string, value: string) => {
      setFieldValue(id, value);
      onFieldChange?.(id, value);
    }, [setFieldValue, onFieldChange]);

    const handleBlur = useCallback((id: string) => {
      const fieldSchema = allFields.find((f: any) => f.id === id);
      if (fieldSchema && fieldSchema.validations) {
        const { valid, message } = validateFieldValue(values[id] || '', fieldSchema.validations);
        setErrors((prev) => ({ ...prev, [id]: valid ? '' : message }));
      }
    }, [allFields, values]);

    return (
      <div className="space-y-6">
        {sections.map((section: any, idx: number) => (
          <FormSection 
            key={`section-${idx}`} 
            section={section} 
            values={values} 
            errors={errors} 
            optionsMap={optionsMap} 
            onChange={handleChange}
            onBlur={handleBlur}
          />
        ))}
      </div>
    );
  }
);

DynamicForm.displayName = 'DynamicForm';
