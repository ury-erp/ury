import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocListMock = vi.fn();
const postMock = vi.fn();

vi.mock('@ury/core', () => ({
  db: {
    getDocList: (...args: unknown[]) => getDocListMock(...args),
  },
  call: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

import { addCustomer, getCustomerGroups, getCustomerTerritories, searchCustomers } from './customer-api';

describe('getCustomerGroups', () => {
  beforeEach(() => {
    getDocListMock.mockReset();
  });

  it('queries Customer Group ordered by name ascending', async () => {
    getDocListMock.mockResolvedValueOnce([{ name: 'Retail' }]);

    const result = await getCustomerGroups();

    expect(getDocListMock).toHaveBeenCalledWith(
      'Customer Group',
      expect.objectContaining({
        fields: ['name'],
        orderBy: { field: 'name', order: 'asc' },
      }),
    );
    expect(result).toEqual([{ name: 'Retail' }]);
  });
});

describe('getCustomerTerritories', () => {
  beforeEach(() => {
    getDocListMock.mockReset();
  });

  it('queries Territory ordered by name ascending', async () => {
    getDocListMock.mockResolvedValueOnce([{ name: 'Kerala' }]);

    const result = await getCustomerTerritories();

    expect(getDocListMock).toHaveBeenCalledWith(
      'Territory',
      expect.objectContaining({
        fields: ['name'],
        orderBy: { field: 'name', order: 'asc' },
      }),
    );
    expect(result).toEqual([{ name: 'Kerala' }]);
  });
});

describe('addCustomer', () => {
  beforeEach(() => {
    postMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  it('posts to create_customer and returns the created customer data on success', async () => {
    postMock.mockResolvedValueOnce({
      message: {
        status: 'success',
        customer_name: 'John Doe',
        mobile_number: '9999999999',
        customer_group: 'Retail',
        territory: 'Kerala',
      },
    });

    const result = await addCustomer({ customer_name: 'John Doe', mobile_number: '9999999999' });

    expect(postMock).toHaveBeenCalledWith('ury.ury_pos.api.create_customer', {
      customer_name: 'John Doe',
      mobile_number: '9999999999',
    });
    expect(result).toEqual({
      data: {
        customer_name: 'John Doe',
        mobile_number: '9999999999',
        customer_group: 'Retail',
        territory: 'Kerala',
      },
    });
  });

  it('throws and logs when the response message is missing', async () => {
    postMock.mockResolvedValueOnce({ message: undefined });

    await expect(addCustomer({ customer_name: 'John Doe', mobile_number: '9999999999' })).rejects.toThrow(
      'Failed to create Customer,API Response error',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('throws when the response status is not "success"', async () => {
    postMock.mockResolvedValueOnce({ message: { status: 'error' } });

    await expect(addCustomer({ customer_name: 'John Doe', mobile_number: '9999999999' })).rejects.toThrow(
      'Failed to create Customer,API Response error',
    );
  });

  it('re-throws (and logs) when the underlying call rejects', async () => {
    postMock.mockRejectedValueOnce(new Error('network down'));

    await expect(addCustomer({ customer_name: 'John Doe', mobile_number: '9999999999' })).rejects.toThrow(
      'network down',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating customer:', expect.any(Error));
  });
});

describe('searchCustomers', () => {
  beforeEach(() => {
    getDocListMock.mockReset();
    consoleErrorSpy.mockClear();
  });

  it('returns [] without querying when the search string is blank/whitespace', async () => {
    expect(await searchCustomers('')).toEqual([]);
    expect(await searchCustomers('   ')).toEqual([]);
    expect(getDocListMock).not.toHaveBeenCalled();
  });

  it('builds a scramble-match "like" pattern across name/customer_name/mobile_number', async () => {
    getDocListMock.mockResolvedValueOnce([]);

    await searchCustomers('ab', 5);

    expect(getDocListMock).toHaveBeenCalledWith(
      'Customer',
      expect.objectContaining({
        fields: ['name', 'customer_name', 'mobile_number'],
        orFilters: [
          ['customer_name', 'like', '%a%b%'],
          ['mobile_number', 'like', '%a%b%'],
          ['name', 'like', '%a%b%'],
        ],
        limit: 5,
        limit_start: 0,
      }),
    );
  });

  it('defaults limit to 5 when not provided', async () => {
    getDocListMock.mockResolvedValueOnce([]);

    await searchCustomers('a');

    expect(getDocListMock).toHaveBeenCalledWith('Customer', expect.objectContaining({ limit: 5 }));
  });

  it('annotates each result with a human-readable content summary, defaulting missing fields to blank', async () => {
    getDocListMock.mockResolvedValueOnce([
      { name: 'CUST-1', customer_name: 'Jane', mobile_number: '8888888888' },
      { name: 'CUST-2', customer_name: undefined, mobile_number: undefined },
    ]);

    const result = await searchCustomers('jane');

    expect(result[0]).toMatchObject({
      name: 'CUST-1',
      content: 'Customer Name : Jane | Mobile Number : 8888888888',
    });
    expect(result[1]).toMatchObject({
      name: 'CUST-2',
      content: 'Customer Name :  | Mobile Number : ',
    });
  });

  it('logs and re-throws when the underlying query rejects', async () => {
    getDocListMock.mockRejectedValueOnce(new Error('db down'));

    await expect(searchCustomers('jane')).rejects.toThrow('db down');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Customer search error:', expect.any(Error));
  });
});
