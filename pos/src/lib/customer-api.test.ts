import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock frappe-sdk-retry
const mockGetDocList = vi.fn();
const mockPost = vi.fn();

vi.mock('./frappe-sdk-retry', () => ({
  db: {
    getDocList: (...args: any[]) => mockGetDocList(...args),
  },
  call: {
    post: (...args: any[]) => mockPost(...args),
  },
}));

// Mock error-utils
vi.mock('./error-utils', () => ({
  getErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

// Mock DOCTYPES
vi.mock('../data/doctypes', () => ({
  DOCTYPES: {
    CUSTOMER: 'Customer',
    CUSTOMER_GROUP: 'Customer Group',
    CUSTOMER_TERRITORY: 'Territory',
  },
}));

import { searchCustomers, addCustomer, getCustomerGroups, getCustomerTerritories } from './customer-api';

describe('searchCustomers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty/whitespace search', async () => {
    const result = await searchCustomers('');
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only search', async () => {
    const result = await searchCustomers('   ');
    expect(result).toEqual([]);
  });

  it('calls db.getDocList with correct parameters', async () => {
    mockGetDocList.mockResolvedValueOnce([]);
    await searchCustomers('john');
    expect(mockGetDocList).toHaveBeenCalledWith('Customer', expect.objectContaining({
      fields: ['name', 'customer_name', 'mobile_number'],
      limit: 5,
      limit_start: 0,
    }));
  });

  it('returns formatted results with content field', async () => {
    mockGetDocList.mockResolvedValueOnce([
      { name: 'C-001', customer_name: 'John Doe', mobile_number: '1234567890' },
    ]);
    const result = await searchCustomers('john');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('content');
    expect(result[0].content).toContain('John Doe');
    expect(result[0].content).toContain('1234567890');
  });

  it('respects custom limit parameter', async () => {
    mockGetDocList.mockResolvedValueOnce([]);
    await searchCustomers('test', 10);
    expect(mockGetDocList).toHaveBeenCalledWith('Customer', expect.objectContaining({
      limit: 10,
    }));
  });

  it('handles missing customer_name gracefully', async () => {
    mockGetDocList.mockResolvedValueOnce([
      { name: 'C-002', mobile_number: '9876543210' },
    ]);
    const result = await searchCustomers('test');
    expect(result[0].content).toContain('Customer Name : ');
    expect(result[0].content).toContain('9876543210');
  });

  it('handles missing mobile_number gracefully', async () => {
    mockGetDocList.mockResolvedValueOnce([
      { name: 'C-003', customer_name: 'Jane' },
    ]);
    const result = await searchCustomers('jane');
    expect(result[0].content).toContain('Jane');
    expect(result[0].content).toContain('Mobile Number : ');
  });

  it('throws error with descriptive message on API failure', async () => {
    mockGetDocList.mockRejectedValueOnce(new Error('Network Error'));
    await expect(searchCustomers('test')).rejects.toThrow('Customer search failed');
  });

  it('uses scramble pattern for search', async () => {
    mockGetDocList.mockResolvedValueOnce([]);
    await searchCustomers('abc');
    expect(mockGetDocList).toHaveBeenCalledWith('Customer', expect.objectContaining({
      orFilters: expect.arrayContaining([
        ['customer_name', 'like', '%a%b%c%'],
      ]),
    }));
  });
});

describe('addCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls call.post with correct method and data', async () => {
    mockPost.mockResolvedValueOnce({
      message: {
        status: 'success',
        customer_name: 'John Doe',
        mobile_number: '1234567890',
        customer_group: 'Individual',
        territory: 'All Territories',
      },
    });
    await addCustomer({
      customer_name: 'John Doe',
      mobile_number: '1234567890',
    });
    expect(mockPost).toHaveBeenCalledWith(
      'ury.ury_pos.api.create_customer',
      expect.objectContaining({
        customer_name: 'John Doe',
        mobile_number: '1234567890',
      })
    );
  });

  it('returns created customer data on success', async () => {
    mockPost.mockResolvedValueOnce({
      message: {
        status: 'success',
        customer_name: 'John Doe',
        mobile_number: '1234567890',
        customer_group: 'Individual',
        territory: 'All Territories',
      },
    });
    const result = await addCustomer({
      customer_name: 'John Doe',
      mobile_number: '1234567890',
    });
    expect(result.data.customer_name).toBe('John Doe');
    expect(result.data.mobile_number).toBe('1234567890');
  });

  it('throws error when API response status is not success', async () => {
    mockPost.mockResolvedValueOnce({
      message: { status: 'error' },
    });
    await expect(addCustomer({
      customer_name: 'Test',
      mobile_number: '111',
    })).rejects.toThrow('Failed to create customer');
  });

  it('throws error when API response has no message', async () => {
    mockPost.mockResolvedValueOnce({});
    await expect(addCustomer({
      customer_name: 'Test',
      mobile_number: '111',
    })).rejects.toThrow('Failed to create customer');
  });

  it('throws error with descriptive message on network failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    await expect(addCustomer({
      customer_name: 'Test',
      mobile_number: '111',
    })).rejects.toThrow('Failed to create customer');
  });
});
