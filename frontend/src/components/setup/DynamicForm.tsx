import React, { forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { defineRegistry, Renderer, JSONUIProvider, useBoundProp, createStateStore } from '@json-render/react';
import { z } from 'zod';
import { Input, Select, SelectItem } from '@ury/ui';
import { validateFieldValue } from '@ury/core';
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

// 1. Define the Catalog for our form components
const formCatalog = defineCatalog(schema, {
  components: {
    FormSection: {
      props: z.object({ label: z.string().optional() }),
      description: "Form section with a label"
    },
    FieldRenderer: {
      props: z.object({
        field: z.any(),
        value: z.any().optional(),
        error: z.string().optional(),
        options: z.array(z.any()).optional()
      }),
      description: "Generic field renderer"
    }
  }
});

// 2. Define the Component Registry
const { registry } = defineRegistry(formCatalog, {
  components: {
    FormSection: ({ props, children }) => (
      <div className="space-y-4">
        {props.label && (
          <h3 className="text-md font-semibold text-foreground">{props.label}</h3>
        )}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-4">
          {children}
        </div>
      </div>
    ),
    FieldRenderer: ({ props, bindings, emit }) => {
      const [val, setVal] = useBoundProp<string>(props.value, bindings?.value);
      const field = props.field;
      
      const getColSpanClass = (field: any) => {
        if (field.id === 'company_name') return 'col-span-12 md:col-span-7';
        if (field.id === 'company_abbr') return 'col-span-12 md:col-span-5';
        if (field.colSpan === 12) return 'col-span-12';
        return 'col-span-12 md:col-span-6';
      };

      const handleChange = (newVal: string) => {
        setVal(newVal);
        emit("change", { fieldId: field.id, value: newVal });
      };

      return (
        <div className={getColSpanClass(field)}>
          <div className="space-y-1.5">
            <label htmlFor={field.id} className="text-sm font-medium text-gray-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            
            {field.type === 'text' || field.type === 'password' || field.type === 'email' ? (
              <Input
                id={field.id}
                type={field.type}
                value={val || ''}
                placeholder={field.placeholder}
                onChange={(e) => handleChange(e.target.value)}
                error={!!props.error}
              />
            ) : field.type === 'select' ? (
              <Select
                id={field.id}
                value={val || ''}
                onValueChange={handleChange}
                error={!!props.error}
              >
                <SelectItem value="" disabled>Select {field.label}</SelectItem>
                {props.options?.map((opt: any) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </Select>
            ) : field.type === 'date' ? (
              <Input
                id={field.id}
                type="date"
                value={val || ''}
                onChange={(e) => handleChange(e.target.value)}
                error={!!props.error}
              />
            ) : null}
            
            {props.error && (
              <p className="text-sm text-red-500 mt-1">{props.error}</p>
            )}
            {field.description && !props.error && (
              <p className="text-xs text-gray-500 mt-1">{field.description}</p>
            )}
          </div>
        </div>
      );
    }
  }
});

// Convert old schema structure into @json-render/react element tree
function buildElementTree(oldSchema: any) {
  const sections = [];
  
  if (Array.isArray(oldSchema.fields) && oldSchema.fields.length > 0) {
    sections.push({ fields: oldSchema.fields });
  } else {
    if (oldSchema.company?.length) {
      sections.push({ label: 'Company Details', fields: oldSchema.company });
    }
    if (oldSchema.general?.length) {
      sections.push({ label: 'General Settings', fields: oldSchema.general });
    }
  }

  return {
    root: {
      type: "FormSection",
      children: sections.map((sec, i) => ({
        type: "FormSection",
        props: { label: sec.label },
        children: sec.fields.map((f: any) => ({
          type: "FieldRenderer",
          props: {
            field: f,
            value: { "$bindState": `/${f.id}` },
            options: f.optionsKey ? { "$state": `/options/${f.optionsKey}` } : undefined,
            error: { "$state": `/errors/${f.id}` }
          },
          on: {
            change: { action: "fieldChange" }
          }
        }))
      }))
    }
  };
}

export const DynamicForm = forwardRef<DynamicFormHandle, DynamicFormProps>(
  ({ schema: rawSchema, optionsMap, onFieldChange }, ref) => {
    
    // Manage state internally
    const store = useMemo(() => createStateStore({
      options: optionsMap,
      errors: {}
    }), []);

    // Keep options updated when they arrive from props
    useEffect(() => {
      store.set("/options", optionsMap);
    }, [optionsMap, store]);

    const spec = useMemo(() => buildElementTree(rawSchema), [rawSchema]);
    
    useImperativeHandle(ref, () => ({
      validate: () => {
        let isValid = true;
        const newErrors: Record<string, string> = {};
        const values = store.get("/") || {};

        const allFields = Array.isArray(rawSchema.fields) ? rawSchema.fields : [...(rawSchema.company || []), ...(rawSchema.general || [])];
        
        allFields.forEach((field: any) => {
          if (field.validations) {
            const { valid, message } = validateFieldValue((values as any)[field.id] || '', field.validations);
            if (!valid) {
              isValid = false;
              newErrors[field.id] = message;
            }
          }
        });

        store.set("/errors", newErrors);
        return isValid;
      },
      getValues: () => {
        const fullState = store.get("/") || {};
        // Strip options/errors
        const { options, errors, ...values } = fullState as any;
        return values as SetupPayload;
      },
      setFieldValue: (id: string, value: string) => {
        store.set(`/${id}`, value);
        store.set(`/errors/${id}`, '');
      }
    }), [rawSchema, store]);

    const handleAction = (action: string, params: any) => {
      if (action === "fieldChange") {
        store.set(`/errors/${params.fieldId}`, '');
        onFieldChange?.(params.fieldId, params.value);
      }
    };

    return (
      <JSONUIProvider store={store} onAction={handleAction}>
        <div className="space-y-6">
          <Renderer spec={spec} registry={registry} />
        </div>
      </JSONUIProvider>
    );
  }
);

DynamicForm.displayName = 'DynamicForm';
