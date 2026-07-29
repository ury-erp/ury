import { storage } from './storage';

export function formatCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol');
  const roundedAmount = flt(amount, 2);
  return symbol ? `${symbol} ${roundedAmount}` : `${roundedAmount}`;
}

export function flt(v: number | string | null | undefined, decimals: number = 2): number {
  if (v == null || v === '') return 0;
  const num = typeof v === 'number' ? v : parseFloat(v as string);
  if (isNaN(num)) return 0;
  if (decimals != null) {
    const mult = Math.pow(10, decimals);
    const isNegative = num < 0;
    const absNum = Math.abs(num);
    const n = +(absNum * mult).toFixed(8);
    const rounded = Math.round(n) / mult;
    return isNegative ? -rounded : rounded;
  }
  return num;
} 

export const formatInvoiceTime = (timestamp: string | null) => {
    if (!timestamp) return 'No bill activity yet';

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
    }

    const timeOnlyMatch = timestamp.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (timeOnlyMatch) {
      const [, hours, minutes, seconds] = timeOnlyMatch;
      const date = new Date();
      date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
      const formatted = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (/^\d{1,2}:\d{2}$/.test(formatted)) {
        return formatted;
      }
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    }

    return timestamp;
  };
