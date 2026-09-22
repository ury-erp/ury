import { call } from '@ury/core';
import type { AutocompleteOption } from '@ury/ui';

export type LinkFilter = [string, string, unknown];

export interface SearchLinkOptionsArgs {
  doctype: string;
  query: string;
  /** Extra AND filters (Frappe list filter tuples). */
  filters?: LinkFilter[];
  fields?: string[];
  /** Field used for the option label. Defaults to `name`. */
  labelField?: string;
  /** Optional secondary line under the label. */
  descriptionField?: string;
  limit?: number;
}

function unwrapList<T>(res: unknown): T[] {
  const data = (res as { message?: T[] } | T[] | null | undefined);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { message?: T[] }).message)) {
    return (data as { message: T[] }).message;
  }
  return [];
}

/**
 * Debounced Autocomplete data source for Frappe Link fields.
 *
 * Uses `frappe.client.get_list` with a `like` filter on `name` (and the label
 * field when it differs). Callers own debounce via `@ury/ui` Autocomplete.
 */
export async function searchLinkOptions({
  doctype,
  query,
  filters = [],
  fields,
  labelField = 'name',
  descriptionField,
  limit = 20,
}: SearchLinkOptionsArgs): Promise<AutocompleteOption[]> {
  const txt = query.trim();
  const requestedFields = Array.from(
    new Set(['name', labelField, descriptionField].filter((f): f is string => !!f))
  );

  const orFilters: LinkFilter[] | undefined = txt
    ? labelField === 'name'
      ? [['name', 'like', `%${txt}%`]]
      : [
          ['name', 'like', `%${txt}%`],
          [labelField, 'like', `%${txt}%`],
        ]
    : undefined;

  const res = await call<unknown>('frappe.client.get_list', {
    doctype,
    fields: fields ?? requestedFields,
    filters,
    ...(orFilters ? { or_filters: orFilters } : {}),
    limit_page_length: limit,
    order_by: `${labelField} asc`,
  });

  const rows = unwrapList<Record<string, string>>(res);
  return rows.map((row) => {
    const value = row.name;
    const label = row[labelField] || row.name;
    const description = descriptionField ? row[descriptionField] : undefined;
    return {
      value,
      label: labelField !== 'name' && label !== value ? `${label} (${value})` : label,
      ...(description ? { description } : {}),
    };
  });
}

/** Keep a committed value visible even when it is outside the latest search page. */
export function withSelectedOption(
  options: AutocompleteOption[],
  value: string
): AutocompleteOption[] {
  if (!value) return options;
  if (options.some((opt) => opt.value === value)) return options;
  return [{ value, label: value }, ...options];
}
