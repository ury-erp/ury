import { storage } from './storage';

export function formatCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol') || '₹';
  const formattedVal = typeof amount === 'number' && !isNaN(amount) ? amount.toLocaleString('en-IN') : amount;
  return `${symbol} ${formattedVal}`;
}

/**
 * Formats a number as compact Indian-style currency for chart axes/labels,
 * e.g. 600000 -> "₹6L", 12500000 -> "₹1.25Cr", 8200 -> "₹8.2k".
 */
export function formatCompactCurrency(amount: number): string {
  const symbol = storage.getItem('currencySymbol') || '₹';
  if (typeof amount !== 'number' || isNaN(amount)) return `${symbol} ${amount}`;

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  const trim = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  if (abs >= 1_00_00_000) return `${sign}${symbol}${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}${symbol}${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
  return `${sign}${symbol}${trim(abs)}`;
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
