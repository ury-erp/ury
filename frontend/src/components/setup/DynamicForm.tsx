import React, { forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { defineRegistry, Renderer, JSONUIProvider, useBoundProp, useStateBinding, createStateStore } from '@json-render/react';
import { z } from 'zod';
import { Input } from '@ury/ui';
import { SearchableSelect } from '../common/SearchableSelect';
import { DatePicker } from './DatePicker';
import { validateFieldValue } from '@ury/core';
import { SetupPayload } from '../../services/setup';
import validationMessages from '../../data/validations.json';

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

const FormCallbackContext = React.createContext<{
  onFieldChange?: (fieldId: string, value: string) => void;
}>({});

// 1. Define the Catalog for our form components
const formCatalog = defineCatalog(schema, {
  components: {
    FormRoot: {
      props: z.object({}),
      description: "Form root container"
    },
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
    FormRoot: ({ children }) => (
      <div className="w-full space-y-6">
        {children}
      </div>
    ),
    FormSection: ({ props, children }) => (
      <div className="w-full space-y-4">
        {props.label && (
          <h3 className="text-sm font-semibold text-foreground">{props.label}</h3>
        )}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-4 w-full">
          {children}
        </div>
      </div>
    ),
    FieldRenderer: ({ props, bindings, emit }) => {
      const { onFieldChange } = React.useContext(FormCallbackContext);
      const bindingPath = bindings?.value;
      const [boundVal, setBoundVal] = useStateBinding<string>(bindingPath || '');
      const val = bindingPath ? (boundVal ?? '') : (props.value ?? '');
      const field = props.field;
      
      const getColSpanClass = (field: any) => {
        if (field.id === 'company_name') return 'col-span-12 md:col-span-7';
        if (field.id === 'company_abbr') return 'col-span-12 md:col-span-5';
        if (field.colSpan === 12) return 'col-span-12';
        return 'col-span-12 md:col-span-6';
      };

      const handleChange = (newVal: string) => {
        if (bindingPath) {
          setBoundVal(newVal);
        }
        emit("change", { fieldId: field.id, value: newVal });
        onFieldChange?.(field.id, newVal);
      };

      return (
        <div className={getColSpanClass(field)}>
          <div className="space-y-1.5">
            <label htmlFor={field.id} className="text-sm font-medium text-foreground">
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
              <SearchableSelect
                id={field.id}
                value={val || ''}
                options={props.options || []}
                placeholder={`Select ${field.label}...`}
                error={!!props.error}
                onChange={(_fieldId, newVal) => handleChange(newVal)}
                strict={true}
              />
            ) : field.type === 'date' ? (
              <DatePicker
                id={field.id}
                value={val || ''}
                placeholder="dd-mm-yyyy"
                error={!!props.error}
                onChange={(_fieldId, newVal) => handleChange(newVal)}
              />
            ) : null}

            {props.error ? (
              <p className="text-xs text-red-500 pt-1">{props.error}</p>
            ) : field.description ? (
              <p className="text-xs text-muted-foreground pt-1">{field.description}</p>
            ) : null}
          </div>
        </div>
      );
    }
  }
});

// Convert old schema structure into @json-render/react element tree
function buildElementTree(oldSchema: any) {
  const elements: Record<string, any> = {};
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

  const rootChildren = sections.map((sec, i) => {
    const secId = `sec_${i}`;
    
    const secChildren = sec.fields.map((f: any) => {
      const fieldId = `field_${f.id}`;
      const fieldProps: any = {
        field: f,
        value: { "$bindState": `/${f.id}` },
        error: { "$state": `/errors/${f.id}` }
      };
      if (f.optionsKey) {
        fieldProps.options = { "$state": `/options/${f.optionsKey}` };
      }
      
      elements[fieldId] = {
        type: "FieldRenderer",
        props: fieldProps,
        on: {
          change: { action: "fieldChange" }
        }
      };
      return fieldId;
    });

    elements[secId] = {
      type: "FormSection",
      props: { label: sec.label ?? null },
      children: secChildren
    };
    return secId;
  });

  elements["root"] = {
    type: "FormRoot",
    props: {},
    children: rootChildren
  };

  return {
    root: "root",
    elements
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
      Object.entries(optionsMap).forEach(([key, val]) => {
        store.set(`/options/${key}`, val);
      });
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
            const { valid, message } = validateFieldValue((values as any)[field.id] || '', field.validations, validationMessages);
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
        store.set(`/errors/${params?.fieldId}`, '');
        onFieldChange?.(params?.fieldId, params?.value);
      }
    };

    return (
      <FormCallbackContext.Provider value={{ onFieldChange }}>
        <JSONUIProvider store={store} onAction={handleAction}>
          <div className="space-y-6">
            <Renderer spec={spec} registry={registry} />
          </div>
        </JSONUIProvider>
      </FormCallbackContext.Provider>
    );
  }
);

DynamicForm.displayName = 'DynamicForm';
