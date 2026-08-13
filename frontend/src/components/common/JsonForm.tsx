import React from 'react';
import { Input, Select } from '@ury/ui';

interface SchemaProperty {
  type: string;
  title: string;
  placeholder?: string;
  enum?: string[];
  default?: string | number;
  minimum?: number;
  maximum?: number;
  required?: boolean;
}

interface JsonSchema {
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

interface JsonFormProps {
  schema: JsonSchema;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
}

export const JsonForm: React.FC<JsonFormProps> = ({ schema, values, onChange, disabled }) => {
  return (
    <div className="space-y-4 text-xs">
      {Object.entries(schema?.properties ?? {}).map(([key, prop]) => {
        const isRequired = schema.required?.includes(key) || prop.required;
        const value = values[key] !== undefined ? values[key] : (prop.default || '');

        return (
          <div key={key}>
            <label className="block font-semibold text-gray-700 mb-1">
              {prop.title} {isRequired && <span className="text-red-500">*</span>}
            </label>
            
            {prop.enum ? (
              <Select
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                disabled={disabled}
              >
                {!isRequired && <option value="">Select {prop.title}</option>}
                {prop.enum.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            ) : prop.type === 'integer' || prop.type === 'number' ? (
              <Input
                type="number"
                placeholder={prop.placeholder}
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                min={prop.minimum}
                max={prop.maximum}
                required={isRequired}
                disabled={disabled}
              />
            ) : (
              <Input
                type={prop.type === 'string' ? 'text' : prop.type}
                placeholder={prop.placeholder}
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                required={isRequired}
                disabled={disabled}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
