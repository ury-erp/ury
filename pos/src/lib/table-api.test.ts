import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock frappe-sdk-retry
const mockGetDocList = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('./frappe-sdk-retry', () => ({
  db: {
    getDocList: (...args: any[]) => mockGetDocList(...args),
    updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  },
}));

// Mock error-utils
vi.mock('./error-utils', () => ({
  getErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

// Mock DOCTYPES
vi.mock('../data/doctypes', () => ({
  DOCTYPES: {
    URY_ROOM: 'URY Room',
    URY_TABLE: 'URY Table',
  },
}));

import { getRooms, getTables, getTableCount, updateTableLayout } from './table-api';

describe('getRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.getDocList with correct doctype and branch filter', async () => {
    mockGetDocList.mockResolvedValueOnce([]);
    await getRooms('Main Branch');
    expect(mockGetDocList).toHaveBeenCalledWith('URY Room', expect.objectContaining({
      fields: ['name', 'branch'],
      filters: [['branch', 'like', 'Main Branch']],
    }));
  });

  it('returns rooms data', async () => {
    const mockRooms = [{ name: 'Room 1', branch: 'Main Branch' }];
    mockGetDocList.mockResolvedValueOnce(mockRooms);
    const result = await getRooms('Main Branch');
    expect(result).toEqual(mockRooms);
  });

  it('throws error with descriptive message on failure', async () => {
    mockGetDocList.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getRooms('Main Branch')).rejects.toThrow("Failed to fetch rooms for branch 'Main Branch'");
  });
});

describe('getTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.getDocList with correct doctype and room filter', async () => {
    mockGetDocList.mockResolvedValueOnce([]);
    await getTables('Room 1');
    expect(mockGetDocList).toHaveBeenCalledWith('URY Table', expect.objectContaining({
      fields: [
        'name', 'occupied', 'latest_invoice_time', 'is_take_away',
        'restaurant_room', 'table_shape', 'no_of_seats',
        'layout_x', 'layout_y', 'minimum_seating'
      ],
      filters: [['restaurant_room', '=', 'Room 1']],
    }));
  });

  it('returns tables data', async () => {
    const mockTables = [
      { name: 'T1', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Room 1', table_shape: 'Circle' },
    ];
    mockGetDocList.mockResolvedValueOnce(mockTables);
    const result = await getTables('Room 1');
    expect(result).toEqual(mockTables);
  });

  it('throws error with descriptive message on failure', async () => {
    mockGetDocList.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getTables('Room 1')).rejects.toThrow("Failed to fetch tables for room 'Room 1'");
  });
});

describe('getTableCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.getDocList with count field', async () => {
    mockGetDocList.mockResolvedValueOnce([{ count: 5 }]);
    await getTableCount('Room 1');
    expect(mockGetDocList).toHaveBeenCalledWith('URY Table', expect.objectContaining({
      fields: ['count(name) as count'],
      filters: [['restaurant_room', '=', 'Room 1']],
      limit: 1,
    }));
  });

  it('returns count as number', async () => {
    mockGetDocList.mockResolvedValueOnce([{ count: 5 }]);
    const result = await getTableCount('Room 1');
    expect(result).toBe(5);
  });

  it('returns 0 when count is not available', async () => {
    mockGetDocList.mockResolvedValueOnce([{}]);
    const result = await getTableCount('Room 1');
    expect(result).toBe(0);
  });

  it('handles string count value', async () => {
    mockGetDocList.mockResolvedValueOnce([{ count: '7' }]);
    const result = await getTableCount('Room 1');
    expect(result).toBe(7);
  });

  it('includes branch filter when provided', async () => {
    mockGetDocList.mockResolvedValueOnce([{ count: 3 }]);
    await getTableCount('Room 1', 'Branch A');
    expect(mockGetDocList).toHaveBeenCalledWith('URY Table', expect.objectContaining({
      filters: [['restaurant_room', '=', 'Room 1'], ['branch', '=', 'Branch A']],
    }));
  });

  it('throws error with descriptive message on failure', async () => {
    mockGetDocList.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getTableCount('Room 1')).rejects.toThrow("Failed to fetch table count for room 'Room 1'");
  });
});

describe('updateTableLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.updateDoc with correct parameters', async () => {
    mockUpdateDoc.mockResolvedValueOnce({ name: 'T1' });
    await updateTableLayout('T1', { layout_x: 100, layout_y: 200 });
    expect(mockUpdateDoc).toHaveBeenCalledWith('URY Table', 'T1', { layout_x: 100, layout_y: 200 });
  });

  it('throws error with descriptive message on failure', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('Network Error'));
    await expect(updateTableLayout('T1', { layout_x: 100 })).rejects.toThrow("Failed to update layout for table 'T1'");
  });
});
