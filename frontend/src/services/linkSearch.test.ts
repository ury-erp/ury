import { describe, expect, it, vi, beforeEach } from 'vitest';
import { searchLinkOptions, withSelectedOption } from './linkSearch';
import { call } from '@ury/core';

vi.mock('@ury/core', () => ({
  call: vi.fn(),
}));

describe('linkSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches with like or_filters and maps labels', async () => {
    vi.mocked(call).mockResolvedValue({
      message: [
        { name: 'ITEM-1', item_name: 'Caesar Salad' },
        { name: 'ITEM-2', item_name: 'Lemonade' },
      ],
    });

    const options = await searchLinkOptions({
      doctype: 'Item',
      query: 'cae',
      fields: ['name', 'item_name'],
      labelField: 'item_name',
      filters: [['disabled', '=', 0]],
    });

    expect(call).toHaveBeenCalledWith(
      'frappe.client.get_list',
      expect.objectContaining({
        doctype: 'Item',
        filters: [['disabled', '=', 0]],
        or_filters: [
          ['name', 'like', '%cae%'],
          ['item_name', 'like', '%cae%'],
        ],
      })
    );
    expect(options).toEqual([
      { value: 'ITEM-1', label: 'Caesar Salad (ITEM-1)' },
      { value: 'ITEM-2', label: 'Lemonade (ITEM-2)' },
    ]);
  });

  it('omits or_filters when query is empty', async () => {
    vi.mocked(call).mockResolvedValue({ message: [{ name: 'Main Kitchen' }] });

    await searchLinkOptions({
      doctype: 'URY Production Department',
      query: '',
      filters: [['branch', '=', 'Downtown']],
    });

    expect(call).toHaveBeenCalledWith(
      'frappe.client.get_list',
      expect.not.objectContaining({
        or_filters: expect.anything(),
      })
    );
  });

  it('withSelectedOption prepends missing committed value', () => {
    expect(withSelectedOption([{ value: 'a', label: 'A' }], 'b')).toEqual([
      { value: 'b', label: 'b' },
      { value: 'a', label: 'A' },
    ]);
    expect(withSelectedOption([{ value: 'a', label: 'A' }], 'a')).toEqual([{ value: 'a', label: 'A' }]);
  });
});
