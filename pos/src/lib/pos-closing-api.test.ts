import { beforeEach, describe, expect, it, vi } from 'vitest';

const callGetMock = vi.fn();
const createDocMock = vi.fn();
const updateDocMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: any[]) => callGetMock(...args),
  },
  db: {
    createDoc: (...args: any[]) => createDocMock(...args),
    updateDoc: (...args: any[]) => updateDocMock(...args),
  },
}));

import {
  createPosClosingEntry,
  createSubPosClosing,
  getMainCashierPosInvoices,
  getOpenPosOpeningEntries,
  getPosClosingEntryCashiers,
  getSubCashierPosInvoices,
  getSubPosClosingCashiers,
  getSubPosClosingProfile,
  submitPosClosingEntry,
  submitSubPosClosing,
} from './pos-closing-api';

describe('pos-closing-api', () => {
  beforeEach(() => {
    callGetMock.mockReset();
    createDocMock.mockReset();
    updateDocMock.mockReset();
  });

  describe('getSubPosClosingProfile', () => {
    it('calls the correct method path and returns the message', async () => {
      callGetMock.mockResolvedValueOnce({ message: 'POS Profile A' });

      const result = await getSubPosClosingProfile();

      expect(callGetMock).toHaveBeenCalledWith(
        'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_profile'
      );
      expect(result).toBe('POS Profile A');
    });

    it('propagates a server exception', async () => {
      callGetMock.mockRejectedValueOnce(new Error('boom'));
      await expect(getSubPosClosingProfile()).rejects.toThrow('boom');
    });

    it('propagates a 403 error', async () => {
      callGetMock.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { httpStatus: 403 }));
      await expect(getSubPosClosingProfile()).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('propagates a network failure', async () => {
      callGetMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(getSubPosClosingProfile()).rejects.toThrow('Failed to fetch');
    });
  });

  describe('getSubPosClosingCashiers / getPosClosingEntryCashiers', () => {
    const args = {
      doctype: 'Sub POS Closing',
      txt: '',
      searchfield: 'user',
      start: 0,
      page_len: 20,
      filters: { pos_profile: 'PP-1' },
    };

    it('sends the args verbatim to the sub-cashier method path', async () => {
      callGetMock.mockResolvedValueOnce({ message: [['user1@ury.com']] });

      const result = await getSubPosClosingCashiers(args);

      expect(callGetMock).toHaveBeenCalledWith(
        'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_cashiers',
        args
      );
      expect(result).toEqual([['user1@ury.com']]);
    });

    it('sends the args verbatim to the main-cashier method path', async () => {
      callGetMock.mockResolvedValueOnce({ message: [['user2@ury.com']] });

      const result = await getPosClosingEntryCashiers(args);

      expect(callGetMock).toHaveBeenCalledWith(
        'erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_cashiers',
        args
      );
      expect(result).toEqual([['user2@ury.com']]);
    });

    it('propagates errors from the sub-cashier path', async () => {
      callGetMock.mockRejectedValueOnce(new Error('down'));
      await expect(getSubPosClosingCashiers(args)).rejects.toThrow('down');
    });

    it('propagates errors from the main-cashier path', async () => {
      callGetMock.mockRejectedValueOnce(new Error('down'));
      await expect(getPosClosingEntryCashiers(args)).rejects.toThrow('down');
    });
  });

  describe('getOpenPosOpeningEntries', () => {
    it('sends pos_profile and returns the message list', async () => {
      const entries = [
        { name: 'OE-1', period_start_date: '2026-09-01', user: 'u@ury.com', pos_profile: 'PP-1' },
      ];
      callGetMock.mockResolvedValueOnce({ message: entries });

      const result = await getOpenPosOpeningEntries('PP-1');

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.get_open_pos_opening_entries', {
        pos_profile: 'PP-1',
      });
      expect(result).toEqual(entries);
    });

    it('propagates a network failure', async () => {
      callGetMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(getOpenPosOpeningEntries('PP-1')).rejects.toThrow('Failed to fetch');
    });
  });

  describe('getSubCashierPosInvoices / getMainCashierPosInvoices', () => {
    const invoice = {
      name: 'POS-INV-1',
      grand_total: 123.45,
      net_total: 100.5,
      total_qty: 3,
      change_amount: 0,
      account_for_change_amount: 'Cash - URY',
      taxes: [{ account_head: 'VAT', rate: 5, tax_amount: 5.5 }],
      payments: [{ mode_of_payment: 'Cash', amount: 123.45, account: 'Cash - URY' }],
    };

    it('sub-cashier: sends start/end/pos_profile/user and does not mutate amount fields', async () => {
      callGetMock.mockResolvedValueOnce({ message: [invoice] });

      const result = await getSubCashierPosInvoices('2026-09-01', '2026-09-02', 'PP-1', 'u@ury.com');

      expect(callGetMock).toHaveBeenCalledWith(
        'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_invoices',
        { start: '2026-09-01', end: '2026-09-02', pos_profile: 'PP-1', user: 'u@ury.com' }
      );
      expect(result[0].grand_total).toBe(123.45);
      expect(result[0].net_total).toBe(100.5);
      expect(result).toEqual([invoice]);
    });

    it('main-cashier: sends start/end/pos_profile/user and preserves amounts exactly', async () => {
      callGetMock.mockResolvedValueOnce({ message: [invoice] });

      const result = await getMainCashierPosInvoices('2026-09-01', '2026-09-02', 'PP-1', 'u@ury.com');

      expect(callGetMock).toHaveBeenCalledWith(
        'erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_pos_invoices',
        { start: '2026-09-01', end: '2026-09-02', pos_profile: 'PP-1', user: 'u@ury.com' }
      );
      expect(result).toEqual([invoice]);
    });

    it('sub-cashier: propagates a server exception', async () => {
      callGetMock.mockRejectedValueOnce(new Error('server exploded'));
      await expect(
        getSubCashierPosInvoices('s', 'e', 'PP-1', 'u@ury.com')
      ).rejects.toThrow('server exploded');
    });

    it('main-cashier: propagates a 403 error', async () => {
      callGetMock.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { httpStatus: 403 }));
      await expect(
        getMainCashierPosInvoices('s', 'e', 'PP-1', 'u@ury.com')
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('main-cashier: propagates a network failure', async () => {
      callGetMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(
        getMainCashierPosInvoices('s', 'e', 'PP-1', 'u@ury.com')
      ).rejects.toThrow('Failed to fetch');
    });
  });

  describe('createSubPosClosing / submitSubPosClosing', () => {
    it('creates with docstatus forced to 0 and passes other fields through', async () => {
      createDocMock.mockResolvedValueOnce({ name: 'SPC-1' });

      const data = {
        pos_profile: 'PP-1',
        pos_opening_entry: 'OE-1',
        user: 'u@ury.com',
        period_start_date: '2026-09-01',
        extra_field: 'x',
      };

      const result = await createSubPosClosing(data);

      expect(createDocMock).toHaveBeenCalledWith('Sub POS Closing', { ...data, docstatus: 0 });
      expect(result).toEqual({ name: 'SPC-1' });
    });

    it('submit forces docstatus to 1', async () => {
      updateDocMock.mockResolvedValueOnce({ name: 'SPC-1' });

      const result = await submitSubPosClosing('SPC-1');

      expect(updateDocMock).toHaveBeenCalledWith('Sub POS Closing', 'SPC-1', { docstatus: 1 });
      expect(result).toEqual({ name: 'SPC-1' });
    });

    it('create propagates errors', async () => {
      createDocMock.mockRejectedValueOnce(new Error('validation failed'));
      await expect(
        createSubPosClosing({
          pos_profile: 'PP-1',
          pos_opening_entry: 'OE-1',
          user: 'u@ury.com',
          period_start_date: '2026-09-01',
        })
      ).rejects.toThrow('validation failed');
    });

    it('submit propagates errors', async () => {
      updateDocMock.mockRejectedValueOnce(new Error('cannot submit'));
      await expect(submitSubPosClosing('SPC-1')).rejects.toThrow('cannot submit');
    });
  });

  describe('createPosClosingEntry / submitPosClosingEntry', () => {
    it('creates with docstatus forced to 0 and passes other fields through', async () => {
      createDocMock.mockResolvedValueOnce({ name: 'PCE-1' });

      const data = {
        pos_profile: 'PP-1',
        pos_opening_entry: 'OE-1',
        user: 'u@ury.com',
        company: 'URY',
        period_start_date: '2026-09-01',
        period_end_date: '2026-09-02',
      };

      const result = await createPosClosingEntry(data);

      expect(createDocMock).toHaveBeenCalledWith('POS Closing Entry', { ...data, docstatus: 0 });
      expect(result).toEqual({ name: 'PCE-1' });
    });

    it('submit forces docstatus to 1', async () => {
      updateDocMock.mockResolvedValueOnce({ name: 'PCE-1' });

      const result = await submitPosClosingEntry('PCE-1');

      expect(updateDocMock).toHaveBeenCalledWith('POS Closing Entry', 'PCE-1', { docstatus: 1 });
      expect(result).toEqual({ name: 'PCE-1' });
    });

    it('create propagates errors', async () => {
      createDocMock.mockRejectedValueOnce(new Error('validation failed'));
      await expect(
        createPosClosingEntry({
          pos_profile: 'PP-1',
          pos_opening_entry: 'OE-1',
          user: 'u@ury.com',
          company: 'URY',
          period_start_date: '2026-09-01',
          period_end_date: '2026-09-02',
        })
      ).rejects.toThrow('validation failed');
    });

    it('submit propagates errors', async () => {
      updateDocMock.mockRejectedValueOnce(new Error('cannot submit'));
      await expect(submitPosClosingEntry('PCE-1')).rejects.toThrow('cannot submit');
    });
  });
});
