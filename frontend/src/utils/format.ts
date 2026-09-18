import { getManagementLocale } from '../i18n/language';
import { storage } from '@ury/core';

export function formatCurrency(amount: number): string {
  const symbol = (storage as any)?.getItem?.('currencySymbol') || '₹';
  const formattedVal = typeof amount === 'number' && !isNaN(amount) ? amount.toLocaleString(getManagementLocale('en-IN')) : amount;
  return `${symbol} ${formattedVal}`;
}

export function formatInvoiceTime(timestamp: string | null): string {
  if (!timestamp) return 'No bill activity yet';
  const parsedDate = new Date(timestamp);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleTimeString(getManagementLocale(), { hour: 'numeric', minute: 'numeric' });
  }
  return timestamp;
}
