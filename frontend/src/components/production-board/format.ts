/** Quantity display, matching the Sales Plan page (integers as-is, else one decimal). */
export const formatQty = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};
