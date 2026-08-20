import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { storage } from './storage';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol');
  return `${symbol} ${amount}`;
} 

export const formatInvoiceTime = (timestamp: string | null) => {
    if (!timestamp) return 'No bill activity yet';

    // Always 24-hour HH:MM, whatever the shape of the stored value — the card
    // reserves one short row for it.
    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      const hours = String(parsedDate.getHours()).padStart(2, '0');
      const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    // A Time field comes back as a duration string, and Frappe drops the
    // zero-padding on the seconds once they carry microseconds: 16:45:01.323333
    // is serialised as "16:45:1.323333". Seconds are optional and may be one
    // digit or fractional — only the hour and minute are ever shown.
    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d+)?)?$/);
    if (timeOnlyMatch) {
      const [, hours, minutes] = timeOnlyMatch;
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }

    // Anything unrecognised is dropped rather than printed raw: a stray
    // duration string blows the card layout apart.
    return '';
  };