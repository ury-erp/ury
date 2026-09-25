import { beforeEach, describe, expect, it, vi } from 'vitest';

const callGetMock = vi.fn();
const callPostMock = vi.fn();
const getDocListMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: any[]) => callGetMock(...args),
    post: (...args: any[]) => callPostMock(...args),
  },
  db: {
    getDocList: (...args: any[]) => getDocListMock(...args),
  },
}));

import {
  getCombinedOrderTotals,
  getInvoicePrintHtml,
  getLinkedMergeSecondaries,
  getMergeBillCandidates,
  getOrdersTabForInvoice,
  getPOSInvoiceItems,
  getPOSInvoices,
  getSplitGroup,
  isMergedBill,
  mapSplitGroupInvoiceToPOSInvoice,
  mergeBills,
  MERGED_POS_INVOICE_PRINT_FORMAT,
  networkPrint,
  resolvePrintFormat,
  searchPosInvoice,
  selectNetworkPrinter,
  updateInvoiceStatus,
  updatePrintStatus,
} from './invoice-api';

describe('invoice-api', () => {
  beforeEach(() => {
    callGetMock.mockReset();
    callPostMock.mockReset();
    getDocListMock.mockReset();
    sessionStorage.clear();
  });

  describe('getPOSInvoices', () => {
    it('sends status/limit/limit_start and maps the response', async () => {
      const invoices = [{ name: 'INV-1' }];
      callGetMock.mockResolvedValueOnce({ message: { data: invoices, next: true } });

      const result = await getPOSInvoices({ status: 'Draft', limit: 20, limit_start: 0 });

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getPosInvoice', {
        status: 'Draft',
        limit: 20,
        limit_start: 0,
      });
      expect(result).toEqual({ invoices, hasMore: true });
    });

    it('uses paid_limit as the effective limit for Recently Paid status', async () => {
      callGetMock.mockResolvedValueOnce({ message: { data: [], next: false } });

      await getPOSInvoices({ status: 'Recently Paid', limit: 20, paid_limit: 5 });

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getPosInvoice', {
        status: 'Recently Paid',
        limit: 5,
        limit_start: undefined,
      });
    });

    it('wraps a server exception in a generic error', async () => {
      callGetMock.mockRejectedValueOnce(new Error('db down'));
      await expect(getPOSInvoices({ status: 'Draft' })).rejects.toThrow(
        'Failed to fetch POS invoices'
      );
    });

    it('wraps a 403 error in a generic error', async () => {
      callGetMock.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { httpStatus: 403 }));
      await expect(getPOSInvoices({ status: 'Draft' })).rejects.toThrow(
        'Failed to fetch POS invoices'
      );
    });

    it('wraps a network failure in a generic error', async () => {
      callGetMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(getPOSInvoices({ status: 'Draft' })).rejects.toThrow(
        'Failed to fetch POS invoices'
      );
    });
  });

  describe('getPOSInvoiceItems', () => {
    it('sends the invoice id and maps [items, taxes] tuple response', async () => {
      const items = [{ name: 'ITEM-1', item_name: 'Tea', qty: 2, rate: 50, price_list_rate: 50, amount: 100 }];
      const taxes = [{ description: 'VAT', rate: 5 }];
      callGetMock.mockResolvedValueOnce({ message: [items, taxes] });

      const result = await getPOSInvoiceItems('INV-1');

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getPosInvoiceItems', {
        invoice: 'INV-1',
      });
      expect(result).toEqual({ items, taxes });
      // amount fields must pass through unrounded/unmutated
      expect(result.items[0].amount).toBe(100);
      expect(result.items[0].rate).toBe(50);
    });

    it('wraps errors in a generic error', async () => {
      callGetMock.mockRejectedValueOnce(new Error('boom'));
      await expect(getPOSInvoiceItems('INV-1')).rejects.toThrow(
        'Failed to fetch POS invoice items'
      );
    });
  });

  describe('updateInvoiceStatus', () => {
    it('posts invoice and status to the correct method path', async () => {
      callPostMock.mockResolvedValueOnce({});

      await updateInvoiceStatus('INV-1', 'Paid');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury_pos.api.updatePosInvoiceStatus', {
        invoice: 'INV-1',
        status: 'Paid',
      });
    });

    it('wraps a server exception in a generic error', async () => {
      callPostMock.mockRejectedValueOnce(new Error('boom'));
      await expect(updateInvoiceStatus('INV-1', 'Paid')).rejects.toThrow(
        'Failed to update invoice status'
      );
    });

    it('wraps a 403 error', async () => {
      callPostMock.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { httpStatus: 403 }));
      await expect(updateInvoiceStatus('INV-1', 'Paid')).rejects.toThrow(
        'Failed to update invoice status'
      );
    });

    it('wraps a network failure', async () => {
      callPostMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(updateInvoiceStatus('INV-1', 'Paid')).rejects.toThrow(
        'Failed to update invoice status'
      );
    });
  });

  describe('searchPosInvoice', () => {
    it('sends query and status and returns message as-is', async () => {
      callGetMock.mockResolvedValueOnce({ message: [{ name: 'INV-1' }] });

      const result = await searchPosInvoice('98765', 'Draft');

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.searchPosInvoice', {
        query: '98765',
        status: 'Draft',
      });
      expect(result).toEqual([{ name: 'INV-1' }]);
    });

    it('propagates the raw error (not wrapped)', async () => {
      const error = new Error('search failed');
      callGetMock.mockRejectedValueOnce(error);
      await expect(searchPosInvoice('q', 'Draft')).rejects.toBe(error);
    });

    it('propagates a 403 error unwrapped', async () => {
      const error = Object.assign(new Error('Forbidden'), { httpStatus: 403 });
      callGetMock.mockRejectedValueOnce(error);
      await expect(searchPosInvoice('q', 'Draft')).rejects.toBe(error);
    });
  });

  describe('getSplitGroup', () => {
    it('sends invoice id and returns response.message directly', async () => {
      const payload = { invoices: [], current: 'INV-1', group: 'GRP-1' };
      callGetMock.mockResolvedValueOnce({ message: payload });

      const result = await getSplitGroup('INV-1');

      expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.get_split_group', {
        invoice: 'INV-1',
      });
      expect(result).toEqual(payload);
    });

    it('does not catch errors (propagates raw)', async () => {
      const error = new Error('split failed');
      callGetMock.mockRejectedValueOnce(error);
      await expect(getSplitGroup('INV-1')).rejects.toBe(error);
    });
  });

  describe('getOrdersTabForInvoice (pure mapping, no network)', () => {
    it('returns Recently Paid when paid and paidLimit > 0', () => {
      expect(
        getOrdersTabForInvoice(
          { invoice_printed: 1, restaurant_table: null, status: 'Paid' },
          { paidLimit: 5 }
        )
      ).toBe('Recently Paid');
    });

    it('returns Paid when paid, no paidLimit, and viewAllStatus is 1', () => {
      expect(
        getOrdersTabForInvoice(
          { invoice_printed: 1, restaurant_table: null, status: 'Paid' },
          { viewAllStatus: 1 }
        )
      ).toBe('Paid');
    });

    it('returns Unbilled for an unprinted invoice with a table', () => {
      expect(
        getOrdersTabForInvoice({ invoice_printed: 0, restaurant_table: 'T1', status: 'Draft' })
      ).toBe('Unbilled');
    });

    it('returns Draft otherwise', () => {
      expect(
        getOrdersTabForInvoice({ invoice_printed: 1, restaurant_table: null, status: 'Draft' })
      ).toBe('Draft');
    });
  });

  describe('mapSplitGroupInvoiceToPOSInvoice (pure mapping)', () => {
    it('preserves amount fields exactly without rounding', () => {
      const inv = {
        name: 'INV-1',
        invoice_printed: 1,
        grand_total: 199.99,
        restaurant_table: null,
        cashier: 'c',
        waiter: 'w',
        net_total: 180.5,
        posting_time: '10:00:00',
        total_taxes_and_charges: 19.49,
        customer: 'CUST-1',
        status: 'Draft' as const,
        mobile_number: '999',
        posting_date: '2026-09-26',
        rounded_total: 200,
        order_type: 'Dine In' as any,
        split_index: 1,
        split_total: 2,
        is_original: true,
        docstatus: 0,
      };

      const result = mapSplitGroupInvoiceToPOSInvoice(inv);

      expect(result.grand_total).toBe(199.99);
      expect(result.net_total).toBe(180.5);
      expect(result.total_taxes_and_charges).toBe(19.49);
      expect(result.rounded_total).toBe(200);
    });

    it('defaults missing cashier/waiter/mobile_number to empty string, and net_total to grand_total', () => {
      const inv = {
        name: 'INV-1',
        invoice_printed: 1,
        grand_total: 100,
        restaurant_table: null,
        cashier: undefined as any,
        waiter: undefined as any,
        net_total: undefined as any,
        posting_time: '10:00:00',
        total_taxes_and_charges: undefined as any,
        customer: 'CUST-1',
        status: 'Draft' as const,
        mobile_number: undefined as any,
        posting_date: '2026-09-26',
        rounded_total: 100,
        order_type: 'Dine In' as any,
        split_index: 1,
        split_total: 1,
        is_original: true,
        docstatus: 0,
      };

      const result = mapSplitGroupInvoiceToPOSInvoice(inv);

      expect(result.cashier).toBe('');
      expect(result.waiter).toBe('');
      expect(result.mobile_number).toBe('');
      expect(result.net_total).toBe(100);
      expect(result.total_taxes_and_charges).toBe(0);
    });
  });

  describe('getInvoicePrintHtml', () => {
    it('sends the correct fixed params along with doc/name/print_format', async () => {
      callGetMock.mockResolvedValueOnce({ message: { html: '<div>invoice</div>' } });

      const result = await getInvoicePrintHtml('INV-1', 'Standard');

      expect(callGetMock).toHaveBeenCalledWith('frappe.www.printview.get_html_and_style', {
        doc: 'POS Invoice',
        name: 'INV-1',
        print_format: 'Standard',
        _lang: 'en',
        no_letterhead: 1,
        letterhead: 'No Letterhead',
        settings: {},
      });
      expect(result).toBe('<div>invoice</div>');
    });

    it('wraps errors in a generic error', async () => {
      callGetMock.mockRejectedValueOnce(new Error('boom'));
      await expect(getInvoicePrintHtml('INV-1', 'Standard')).rejects.toThrow(
        'Failed to fetch invoice print HTML'
      );
    });
  });

  describe('networkPrint', () => {
    it('posts doctype/name/printer_setting/print_format', async () => {
      callPostMock.mockResolvedValueOnce({});

      await networkPrint('INV-1', 'Printer-1', 'Standard');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury.api.ury_print.network_printing', {
        doctype: 'POS Invoice',
        name: 'INV-1',
        printer_setting: 'Printer-1',
        print_format: 'Standard',
      });
    });

    it('propagates errors unwrapped', async () => {
      const error = new Error('printer offline');
      callPostMock.mockRejectedValueOnce(error);
      await expect(networkPrint('INV-1', 'Printer-1', 'Standard')).rejects.toBe(error);
    });
  });

  describe('selectNetworkPrinter', () => {
    it('posts invoice_id/pos_profile/print_format', async () => {
      callPostMock.mockResolvedValueOnce({});

      await selectNetworkPrinter('INV-1', 'PP-1', 'Standard');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury.api.ury_print.select_network_printer', {
        invoice_id: 'INV-1',
        pos_profile: 'PP-1',
        print_format: 'Standard',
      });
    });

    it('propagates errors unwrapped', async () => {
      const error = new Error('failed');
      callPostMock.mockRejectedValueOnce(error);
      await expect(selectNetworkPrinter('INV-1', 'PP-1', 'Standard')).rejects.toBe(error);
    });
  });

  describe('updatePrintStatus', () => {
    it('posts invoice id to the correct method path', async () => {
      callPostMock.mockResolvedValueOnce({});

      await updatePrintStatus('INV-1');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury.api.ury_print.qz_print_update', {
        invoice: 'INV-1',
      });
    });

    it('propagates errors unwrapped', async () => {
      const error = new Error('failed');
      callPostMock.mockRejectedValueOnce(error);
      await expect(updatePrintStatus('INV-1')).rejects.toBe(error);
    });
  });

  describe('getCombinedOrderTotals (pure)', () => {
    it('adds the rounded merged total to rounded_total without mutating the input', () => {
      const order = { rounded_total: 100, custom_merged_total: 49.6 };
      const result = getCombinedOrderTotals(order);

      expect(result).toEqual({ grandTotal: 150, roundedTotal: 150 });
      expect(order).toEqual({ rounded_total: 100, custom_merged_total: 49.6 });
    });

    it('defaults missing rounded_total and custom_merged_total to 0', () => {
      expect(getCombinedOrderTotals({} as any)).toEqual({ grandTotal: 0, roundedTotal: 0 });
    });
  });

  describe('isMergedBill / resolvePrintFormat (pure)', () => {
    it('isMergedBill is true only when custom_merged_pos_invoice is set', () => {
      expect(isMergedBill({ custom_merged_pos_invoice: 'INV-2' })).toBe(true);
      expect(isMergedBill({ custom_merged_pos_invoice: null })).toBe(false);
      expect(isMergedBill({ custom_merged_pos_invoice: undefined })).toBe(false);
    });

    it('resolvePrintFormat returns the merged format when merged', () => {
      expect(resolvePrintFormat({ custom_merged_pos_invoice: 'INV-2' }, 'Standard')).toBe(
        MERGED_POS_INVOICE_PRINT_FORMAT
      );
    });

    it('resolvePrintFormat falls back to defaultFormat when not merged', () => {
      expect(resolvePrintFormat({ custom_merged_pos_invoice: null }, 'Standard')).toBe('Standard');
    });
  });

  describe('getLinkedMergeSecondaries', () => {
    it('queries POS Invoice with docstatus=0 and custom_merged_pos_invoice set, filters undefined values', async () => {
      getDocListMock.mockResolvedValueOnce([
        { custom_merged_pos_invoice: 'INV-2' },
        { custom_merged_pos_invoice: undefined },
        { custom_merged_pos_invoice: 'INV-3' },
      ]);

      const result = await getLinkedMergeSecondaries();

      expect(getDocListMock).toHaveBeenCalledWith(
        'POS Invoice',
        expect.objectContaining({
          filters: [
            ['docstatus', '=', 0],
            ['custom_merged_pos_invoice', 'is', 'set'],
          ],
          limit: 500,
        })
      );
      expect(result).toEqual(['INV-2', 'INV-3']);
    });

    it('propagates errors unwrapped', async () => {
      const error = new Error('db query failed');
      getDocListMock.mockRejectedValueOnce(error);
      await expect(getLinkedMergeSecondaries()).rejects.toBe(error);
    });
  });

  describe('getMergeBillCandidates', () => {
    beforeEach(() => {
      sessionStorage.setItem('posProfile', JSON.stringify({ branch: 'Kozhikode' }));
    });

    it('excludes primary + linked secondaries and paginates with a lookahead row', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({
        name: `INV-${i}`,
        customer: 'CUST',
        grand_total: 100,
        rounded_total: 100,
        posting_date: '2026-09-26',
        posting_time: '10:00:00',
        order_type: 'Dine In',
        restaurant_table: null,
        status: 'Draft',
        invoice_printed: 0,
      }));
      getDocListMock.mockResolvedValueOnce(rows);

      const result = await getMergeBillCandidates({
        primaryInvoice: 'INV-PRIMARY',
        linkedSecondaries: ['INV-SEC-1'],
      });

      expect(getDocListMock).toHaveBeenCalledWith(
        'POS Invoice',
        expect.objectContaining({
          filters: expect.arrayContaining([
            ['branch', '=', 'Kozhikode'],
            ['docstatus', '=', 0],
            ['name', 'not in', ['INV-PRIMARY', 'INV-SEC-1']],
          ]),
          limit: 11,
          limit_start: 0,
        })
      );
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(10);
    });

    it('fetches linked secondaries from getLinkedMergeSecondaries when not provided', async () => {
      getDocListMock
        .mockResolvedValueOnce([{ custom_merged_pos_invoice: 'INV-SEC-2' }])
        .mockResolvedValueOnce([]);

      await getMergeBillCandidates({ primaryInvoice: 'INV-PRIMARY' });

      expect(getDocListMock).toHaveBeenNthCalledWith(2, 'POS Invoice', expect.objectContaining({
        filters: expect.arrayContaining([['name', 'not in', ['INV-PRIMARY', 'INV-SEC-2']]]),
      }));
    });

    it('throws when the branch is missing from the session POS profile', async () => {
      sessionStorage.setItem('posProfile', JSON.stringify({}));
      await expect(
        getMergeBillCandidates({ primaryInvoice: 'INV-PRIMARY', linkedSecondaries: [] })
      ).rejects.toThrow('Branch not found in POS profile');
    });

    it('throws when no POS profile is loaded at all', async () => {
      sessionStorage.clear();
      await expect(
        getMergeBillCandidates({ primaryInvoice: 'INV-PRIMARY', linkedSecondaries: [] })
      ).rejects.toThrow('POS profile not loaded');
    });

    it('propagates a network failure from db.getDocList', async () => {
      getDocListMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(
        getMergeBillCandidates({ primaryInvoice: 'INV-PRIMARY', linkedSecondaries: [] })
      ).rejects.toThrow('Failed to fetch');
    });
  });

  describe('mergeBills', () => {
    it('posts primary_invoice/secondary_invoice and returns the result on success', async () => {
      callPostMock.mockResolvedValueOnce({
        message: { status: 'success', message: 'merged', name: 'INV-1' },
      });

      const result = await mergeBills('INV-1', 'INV-2');

      expect(callPostMock).toHaveBeenCalledWith('ury.ury_pos.api.merge_bills', {
        primary_invoice: 'INV-1',
        secondary_invoice: 'INV-2',
      });
      expect(result).toEqual({ status: 'success', message: 'merged', name: 'INV-1' });
    });

    it('throws using the server message when status is error', async () => {
      callPostMock.mockResolvedValueOnce({
        message: { status: 'error', message: 'Invoice already merged' },
      });

      await expect(mergeBills('INV-1', 'INV-2')).rejects.toThrow('Invoice already merged');
    });

    it('throws a default message when status is error with no message', async () => {
      callPostMock.mockResolvedValueOnce({ message: { status: 'error', message: '' } });

      await expect(mergeBills('INV-1', 'INV-2')).rejects.toThrow('Failed to merge bills');
    });

    it('propagates a transport-level server exception unwrapped', async () => {
      const error = new Error('server exploded');
      callPostMock.mockRejectedValueOnce(error);
      await expect(mergeBills('INV-1', 'INV-2')).rejects.toBe(error);
    });

    it('propagates a 403 error unwrapped', async () => {
      const error = Object.assign(new Error('Forbidden'), { httpStatus: 403 });
      callPostMock.mockRejectedValueOnce(error);
      await expect(mergeBills('INV-1', 'INV-2')).rejects.toBe(error);
    });

    it('propagates a network failure unwrapped', async () => {
      const error = new TypeError('Failed to fetch');
      callPostMock.mockRejectedValueOnce(error);
      await expect(mergeBills('INV-1', 'INV-2')).rejects.toBe(error);
    });
  });
});
