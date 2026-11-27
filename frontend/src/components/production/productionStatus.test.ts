import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeApiError, describeBlocker, downloadCsv, fileSlug } from './productionStatus';
import { hasChefUiRole } from './chefRoles';

describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds a formula-safe CSV without a row key column', async () => {
    let captured: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:url';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadCsv(
      'hot-kitchen-2026-11-27-production.csv',
      [{ id: 'r1', name: '=cmd', qty: 4.5 }],
      [
        { header: 'Item Name', get: (row) => row.name },
        { header: 'Qty', get: (row) => row.qty },
      ],
    );

    expect(click).toHaveBeenCalledOnce();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(captured as unknown as Blob);
    });
    expect(text.split('\r\n')).toEqual(['Item Name,Qty', "'=cmd,4.5"]);
  });
});

describe('helpers', () => {
  it('slugs file names', () => {
    expect(fileSlug('Hot Kitchen / Main')).toBe('hot-kitchen-main');
  });

  it('describes blockers', () => {
    expect(describeBlocker({ message: 'Flour short' })).toBe('Flour short');
    expect(describeBlocker({ type: 'store_shortage', item_code: 'FLOUR' })).toBe('store_shortage: FLOUR');
  });

  it('reads frappe.throw text out of _server_messages', () => {
    const err = { _server_messages: JSON.stringify([JSON.stringify({ message: '<b>Not</b> allowed' })]) };
    expect(describeApiError(err, 'fallback')).toBe('Not allowed');
    expect(describeApiError({ exc_type: 'frappe.exceptions.PermissionError' }, 'fallback', 'no permission')).toBe(
      'no permission',
    );
    expect(describeApiError(null, 'fallback')).toBe('fallback');
  });

  it('gates the Chef UI by role', () => {
    expect(hasChefUiRole(['URY Department Head'])).toBe(true);
    expect(hasChefUiRole(['URY Manager'])).toBe(true);
    expect(hasChefUiRole(['URY Cashier'])).toBe(false);
  });
});
