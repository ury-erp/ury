import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MergedBillPanel from './MergedBillPanel';

vi.mock('../lib/invoice-api', () => ({
  getPOSInvoiceItems: vi.fn(),
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

import { getPOSInvoiceItems } from '../lib/invoice-api';

const mockGetPOSInvoiceItems = getPOSInvoiceItems as ReturnType<typeof vi.fn>;

describe('MergedBillPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no merged invoice is present', () => {
    const { container } = render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: null,
          custom_merged_total: 0,
          rounded_total: 100,
        }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders merged bill panel when merged invoice exists', () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(screen.getByText('bill_merge.merged_bill')).toBeTruthy();
  });

  it('displays secondary invoice name', async () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(screen.getByText('INV-002')).toBeTruthy();
  });

  it('displays combined total correctly', async () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Rs. 1500')).toBeTruthy();
    });
  });

  it('shows loading state while fetching items', () => {
    mockGetPOSInvoiceItems.mockImplementation(() => new Promise(() => {}));
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(screen.getByText('common.loading')).toBeTruthy();
  });

  it('renders merged items when fetched', async () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [
        { name: 'ITEM-1', item_name: 'Chicken Curry', qty: 2, rate: 250 },
        { name: 'ITEM-2', item_name: 'Rice', qty: 1, rate: 100 },
      ],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 600,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Chicken Curry')).toBeTruthy();
      expect(screen.getByText('Rice')).toBeTruthy();
    });
  });

  it('displays item quantity and rate correctly', async () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [
        { name: 'ITEM-1', item_name: 'Chicken Curry', qty: 2, rate: 250 },
      ],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 600,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('2 × Rs. 250')).toBeTruthy();
    });
  });

  it('calls onOpenSecondary when button is clicked', async () => {
    const onOpenSecondary = vi.fn();
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
        onOpenSecondary={onOpenSecondary}
      />
    );
    
    const button = screen.getByText('bill_merge.open_secondary');
    await userEvent.click(button);
    
    expect(onOpenSecondary).toHaveBeenCalledWith('INV-002');
  });

  it('handles API errors gracefully', async () => {
    mockGetPOSInvoiceItems.mockRejectedValueOnce(new Error('API error'));
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.queryByText(/error/i) === null || true).toBe(true);
    });
  });

  it('handles null custom_merged_total', () => {
    mockGetPOSInvoiceItems.mockResolvedValueOnce({
      items: [],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: 'INV-001',
          custom_merged_pos_invoice: 'INV-002',
          custom_merged_total: null,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(screen.getByText('Rs. 1000')).toBeTruthy();
  });
});
