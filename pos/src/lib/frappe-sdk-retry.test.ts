import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the original frappe-sdk module
vi.mock('./frappe-sdk', () => ({
  call: {
    get: vi.fn(),
    post: vi.fn(),
  },
  db: {
    getDocList: vi.fn(),
    getDoc: vi.fn(),
    getValue: vi.fn(),
    getCount: vi.fn(),
  },
  auth: {
    getLoggedInUser: vi.fn(),
  },
}));

// Import after mock setup
import { call, db, auth } from './frappe-sdk-retry';
import { call as originalCall, db as originalDb } from './frappe-sdk';

describe('frappe-sdk-retry: call wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('call.get', () => {
    it('should return data on successful call', async () => {
      (originalCall.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message: 'ok' });

      const result = await call.get('ury_dashboard.api.summary');
      expect(result).toEqual({ message: 'ok' });
      expect(originalCall.get).toHaveBeenCalledWith('ury_dashboard.api.summary', undefined);
    });

    it('should retry on network error and succeed', async () => {
      const networkError = new Error('Network Error');
      (originalCall.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ message: 'recovered' });

      const result = await call.get('ury_dashboard.api.summary', undefined, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toEqual({ message: 'recovered' });
      expect(originalCall.get).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx client errors', async () => {
      const clientError = Object.assign(new Error('Not Found'), { httpStatus: 404 });
      (originalCall.get as ReturnType<typeof vi.fn>).mockRejectedValue(clientError);

      await expect(
        call.get('ury_dashboard.api.summary', undefined, {
          maxRetries: 3,
          initialDelay: 10,
        })
      ).rejects.toThrow('Not Found');

      expect(originalCall.get).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      const serverError = Object.assign(new Error('Internal Server Error'), { httpStatus: 500 });
      (originalCall.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ message: 'recovered' });

      const result = await call.get('ury_dashboard.api.summary', undefined, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toEqual({ message: 'recovered' });
      expect(originalCall.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('call.post', () => {
    it('should return data on successful call', async () => {
      (originalCall.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message: 'created' });

      const result = await call.post('ury_menu_management.api.create_item', { name: 'Test' });
      expect(result).toEqual({ message: 'created' });
      expect(originalCall.post).toHaveBeenCalledWith('ury_menu_management.api.create_item', { name: 'Test' });
    });

    it('should retry on network error with fewer retries than GET', async () => {
      const networkError = new Error('Network Error');
      (originalCall.post as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ message: 'recovered' });

      const result = await call.post('ury_menu_management.api.create_item', undefined, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toEqual({ message: 'recovered' });
      expect(originalCall.post).toHaveBeenCalledTimes(2);
    });

    it('should not retry on client errors', async () => {
      const validationError = Object.assign(new Error('ValidationError'), { httpStatus: 400 });
      (originalCall.post as ReturnType<typeof vi.fn>).mockRejectedValue(validationError);

      await expect(
        call.post('ury_menu_management.api.create_item', undefined, {
          maxRetries: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow('ValidationError');

      expect(originalCall.post).toHaveBeenCalledTimes(1);
    });
  });
});

describe('frappe-sdk-retry: db wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('db.getDocList', () => {
    it('should return data on successful call', async () => {
      (originalDb.getDocList as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ name: 'Item 1' }]);

      const result = await db.getDocList('URY Menu Item');
      expect(result).toEqual([{ name: 'Item 1' }]);
      expect(originalDb.getDocList).toHaveBeenCalledWith('URY Menu Item', undefined);
    });

    it('should retry on network error', async () => {
      const networkError = new Error('Network Error');
      (originalDb.getDocList as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce([{ name: 'Item 1' }]);

      const result = await db.getDocList('URY Menu Item', undefined, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toEqual([{ name: 'Item 1' }]);
      expect(originalDb.getDocList).toHaveBeenCalledTimes(2);
    });
  });

  describe('db.getDoc', () => {
    it('should return document on successful call', async () => {
      (originalDb.getDoc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ name: 'ITEM-001', item_name: 'Pizza' });

      const result = await db.getDoc('URY Menu Item', 'ITEM-001');
      expect(result).toEqual({ name: 'ITEM-001', item_name: 'Pizza' });
    });

    it('should retry on server error', async () => {
      const serverError = Object.assign(new Error('Server Error'), { httpStatus: 503 });
      (originalDb.getDoc as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ name: 'ITEM-001' });

      const result = await db.getDoc('URY Menu Item', 'ITEM-001', {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toEqual({ name: 'ITEM-001' });
      expect(originalDb.getDoc).toHaveBeenCalledTimes(2);
    });
  });

  describe('db.getValue', () => {
    it('should return field value on successful call', async () => {
      (originalDb.getValue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rate: 12.5 });

      const result = await db.getValue('URY Menu Item', 'ITEM-001', 'rate');
      expect(result).toEqual({ rate: 12.5 });
    });
  });

  describe('db.getCount', () => {
    it('should return count on successful call', async () => {
      (originalDb.getCount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(42);

      const result = await db.getCount('URY Menu Item');
      expect(result).toBe(42);
    });

    it('should retry on network error', async () => {
      const networkError = new Error('Network Error');
      (originalDb.getCount as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(10);

      const result = await db.getCount('URY Menu Item', undefined, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
      });

      expect(result).toBe(10);
      expect(originalDb.getCount).toHaveBeenCalledTimes(2);
    });
  });
});

describe('frappe-sdk-retry: auth pass-through', () => {
  it('should export auth without retry wrapper', () => {
    expect(auth).toBeDefined();
    expect(typeof auth.getLoggedInUser).toBe('function');
  });
});
