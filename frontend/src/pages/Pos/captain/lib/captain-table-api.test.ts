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

  it('queries active (docstatus=0) POS Invoices for the given branch with the expected fields', async () => {
    getDocListMock.mockResolvedValueOnce([]);

    await getActiveTableOrders('Kozhikode');

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
      }),
    );
  });

  it('maps each row to its restaurant_table', async () => {
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

    expect(result.get('T-1')).toEqual({
      invoiceName: 'INV-1',
      waiter: 'waiter@example.com',
      grandTotal: 500,
      invoicePrinted: false,
    });
    expect(result.size).toBe(1);
  });

  it('also indexes merged-table partners under the same invoice info', async () => {
    getDocListMock.mockResolvedValueOnce([
      {
        name: 'INV-2',
        restaurant_table: 'T-2',
        custom_merged_tables: 'T-3, T-4',
        waiter: 'waiter2@example.com',
        grand_total: 1200,
        invoice_printed: 1,
      },
    ]);

    const result = await getActiveTableOrders('Kozhikode');

    expect(result.size).toBe(3);
    const expected = {
      invoiceName: 'INV-2',
      waiter: 'waiter2@example.com',
      grandTotal: 1200,
      invoicePrinted: true,
    };
    expect(result.get('T-2')).toEqual(expected);
    expect(result.get('T-3')).toEqual(expected);
    expect(result.get('T-4')).toEqual(expected);
  });

  it('skips indexing under restaurant_table when it is null (take-away/pickup invoices)', async () => {
    getDocListMock.mockResolvedValueOnce([
      {
        name: 'INV-3',
        restaurant_table: null,
        custom_merged_tables: null,
        waiter: 'waiter3@example.com',
        grand_total: 300,
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

  it('returns an empty map without calling the API when given no user names', async () => {
    const result = await getUserFullNames([]);

    expect(result.size).toBe(0);
    expect(getDocListMock).not.toHaveBeenCalled();
  });

  it('filters out falsy entries and de-duplicates before querying', async () => {
    getDocListMock.mockResolvedValueOnce([]);

    await getUserFullNames(['a@example.com', '', 'a@example.com', 'b@example.com']);

    expect(getDocListMock).toHaveBeenCalledWith(
      'User',
      expect.objectContaining({
        filters: [['name', 'in', ['a@example.com', 'b@example.com']]],
        limit: 2,
      }),
    );
  });

  it('maps user name -> full_name, falling back to the user id when full_name is missing', async () => {
    getDocListMock.mockResolvedValueOnce([
      { name: 'a@example.com', full_name: 'Alice A' },
      { name: 'b@example.com', full_name: '' },
    ]);

    const result = await getUserFullNames(['a@example.com', 'b@example.com']);

    expect(result.get('a@example.com')).toBe('Alice A');
    expect(result.get('b@example.com')).toBe('b@example.com');
  });
});
