import { formatCurrency, formatCompactCurrency } from './format';

// Minimal browser stand-ins: format.ts reads localStorage (via storage.ts) and,
// for sites that never ran the POS, the Frappe boot the page already injects
// (window.frappe.boot.sysdefaults), the same source Desk uses for currency.
type Boot = { sysdefaults?: { currency?: string; number_format?: string }; docs?: Array<{ doctype: string; name: string; symbol?: string }> };

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

function reset(boot?: Boot) {
  store.clear();
  (globalThis as any).window = boot ? { frappe: { boot } } : {};
}

interface Case {
  label: string;
  run: () => string;
  expected: string;
}

const cases: Case[] = [
  {
    label: 'stored symbol still wins (POS-seeded sites are unchanged)',
    run: () => {
      reset({ sysdefaults: { currency: 'UGX', number_format: '#,###.##' } });
      localStorage.setItem('currencySymbol', 'KSh');
      return formatCurrency(1500);
    },
    expected: 'KSh 1,500',
  },
  {
    label: 'no stored symbol, boot currency UGX: shows UGX, not the rupee',
    run: () => {
      reset({ sysdefaults: { currency: 'UGX', number_format: '#,###.##' } });
      return formatCurrency(7000);
    },
    expected: 'UGX 7,000',
  },
  {
    label: 'boot number format #,###.## groups in thousands, not lakhs',
    run: () => {
      reset({ sysdefaults: { currency: 'UGX', number_format: '#,###.##' } });
      return formatCurrency(150000);
    },
    expected: 'UGX 150,000',
  },
  {
    label: "unknown symbol falls back to the currency code (Frappe's get_currency_symbol rule)",
    run: () => {
      reset({ sysdefaults: { currency: 'KES', number_format: '#,###.##' } });
      return formatCurrency(12.5);
    },
    expected: 'KES 12.5',
  },
  {
    label: 'Desk boot docs carry the Currency symbol: use it',
    run: () => {
      reset({ sysdefaults: { currency: 'USD', number_format: '#,###.##' }, docs: [{ doctype: ':Currency', name: 'USD', symbol: '$' }] } as Boot);
      return formatCurrency(12.5);
    },
    expected: '$ 12.5',
  },
  {
    label: 'INR site keeps Indian grouping (no regression)',
    run: () => {
      reset({ sysdefaults: { currency: 'INR', number_format: '#,##,###.##' } });
      localStorage.setItem('currencySymbol', '₹');
      return formatCurrency(150000);
    },
    expected: '₹ 1,50,000',
  },
  {
    label: 'no boot and no stored symbol: keeps the historical ₹ default',
    run: () => {
      reset();
      return formatCurrency(100);
    },
    expected: '₹ 100',
  },
  {
    label: 'compact currency uses the boot currency too',
    run: () => {
      reset({ sysdefaults: { currency: 'UGX', number_format: '#,###.##' } });
      return formatCompactCurrency(8200);
    },
    expected: 'UGX8.2k',
  },
];

let failures = 0;
for (const { label, run, expected } of cases) {
  let actual: string;
  try {
    actual = run();
  } catch (e) {
    actual = `THREW ${(e as Error).message}`;
  }
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} => expected "${expected}", got "${actual}"`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
