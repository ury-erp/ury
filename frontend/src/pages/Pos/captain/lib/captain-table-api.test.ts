import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocListMock = vi.fn();

vi.mock('@ury/core', () => ({
  db: {
    getDocList: (...args: unknown[]) => getDocListMock(...args),
  },
}));

import { getActiveTableOrders, getUserFullNames } from './captain-table-api';

describe('getActiveTableOrders', () => {
  beforeEach(() => {
    getDocListMock.mockReset();
  });

  it('fetches active (docstatus=0) invoices for the branch and maps by restaurant_table', async () => {
    getDocListMock.mockResolvedValueOnce([
      {
        name: 'INV-1',
        restaurant_table: 'T-1',
        custom_merged_tables: null,
        waiter: 'waiter@example.com',
        grand_total: 500,
        invoice_printed: 0,
      },
    ]);

    const result = await getActiveTableOrders('Kozhikode');

    expect(getDocListMock).toHaveBeenCalledWith(
      'POS Invoice',
      expect.objectContaining({
        fields: [
          'name',
          'restaurant_table',
          'custom_merged_tables',
          'waiter',
          'grand_total',
          'invoice_printed',
        ],
        filters: [
          ['branch', '=', 'Kozhikode'],
          ['docstatus', '=', 0],
        ],
      })
    );
    expect(result.get('T-1')).toEqual({
      invoiceName: 'INV-1',
      waiter: 'waiter@example.com',
      grandTotal: 500,
      invoicePrinted: false,
    });
  });

  it('maps the same invoice info onto every merged partner table, not just the primary table', async () => {
    getDocListMock.mockResolvedValueOnce([
      {
        name: 'INV-2',
        restaurant_table: 'T-1',
        custom_merged_tables: 'T-2, T-3',
        waiter: 'waiter@example.com',
        grand_total: 900,
        invoice_printed: 1,
      },
    ]);

    const result = await getActiveTableOrders('Kozhikode');

    expect(result.size).toBe(3);
    expect(result.get('T-1')?.invoiceName).toBe('INV-2');
    expect(result.get('T-2')?.invoiceName).toBe('INV-2');
    expect(result.get('T-3')?.invoiceName).toBe('INV-2');
    expect(result.get('T-2')?.invoicePrinted).toBe(true);
  });

  it('skips setting a primary-table entry when restaurant_table is null (e.g. a take-away invoice)', async () => {
    getDocListMock.mockResolvedValueOnce([
      {
        name: 'INV-3',
        restaurant_table: null,
        custom_merged_tables: null,
        waiter: 'waiter@example.com',
        grand_total: 200,
        invoice_printed: 0,
      },
    ]);

    const result = await getActiveTableOrders('Kozhikode');

    expect(result.size).toBe(0);
  });

  it('returns an empty map when no active invoices exist', async () => {
    getDocListMock.mockResolvedValueOnce([]);
    const result = await getActiveTableOrders('Kozhikode');
    expect(result.size).toBe(0);
  });
});

describe('getUserFullNames', () => {
  beforeEach(() => {
    getDocListMock.mockReset();
  });

  it('returns an empty map without calling the backend when given no user names', async () => {
    const result = await getUserFullNames([]);
    expect(result.size).toBe(0);
    expect(getDocListMock).not.toHaveBeenCalled();
  });

  it('dedupes and filters falsy user names before querying, using an `in` filter', async () => {
    getDocListMock.mockResolvedValueOnce([{ name: 'a@example.com', full_name: 'Alice A' }]);

    await getUserFullNames(['a@example.com', 'a@example.com', '', 'a@example.com']);

    expect(getDocListMock).toHaveBeenCalledWith(
      'User',
      expect.objectContaining({
        filters: [['name', 'in', ['a@example.com']]],
        limit: 1,
      })
    );
  });

  it('falls back to the raw user id when full_name is missing', async () => {
    getDocListMock.mockResolvedValueOnce([
      { name: 'a@example.com', full_name: 'Alice A' },
      { name: 'b@example.com', full_name: '' },
    ]);

    const result = await getUserFullNames(['a@example.com', 'b@example.com']);

    expect(result.get('a@example.com')).toBe('Alice A');
    expect(result.get('b@example.com')).toBe('b@example.com');
  });
});
