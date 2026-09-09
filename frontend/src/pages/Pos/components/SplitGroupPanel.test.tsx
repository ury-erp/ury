import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SplitGroupPanel from './SplitGroupPanel';
import type { SplitGroupInvoice } from '../lib/invoice-api';

vi.mock('../i18n', () => ({
  t: (key: string, params?: any) => key,
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

const mockGetSplitGroup = vi.fn();

vi.mock('../lib/invoice-api', () => ({
  getSplitGroup: (...args: any[]) => mockGetSplitGroup(...args),
}));

const mockInvoice = (name: string, overrides?: Partial<SplitGroupInvoice>): SplitGroupInvoice => ({
  name,
  customer: 'CUST-001',
  customer_name: 'John Doe',
  rounded_total: 1000,
  split_index: 1,
  split_total: 2,
  is_original: false,
  docstatus: 0,
  ...overrides,
});

describe('SplitGroupPanel', () => {
  beforeEach(() => {
    cleanup();
    mockGetSplitGroup.mockReset();
  });

  it('returns null when there are less than 2 invoices', async () => {
    mockGetSplitGroup.mockResolvedValue({
      invoices: [mockInvoice('INV-001')],
    });

    const { container } = render(
      <SplitGroupPanel invoiceName="INV-001" onOpenInvoice={() => {}} />
    );

    await waitFor(() => {
      expect(mockGetSplitGroup).toHaveBeenCalledWith('INV-001');
      expect(container.firstChild).toBeNull();
    });
  });

  it('displays related invoices when 2 or more exist', async () => {
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001', { is_original: true }),
        mockInvoice('INV-002'),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-001" onOpenInvoice={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
      expect(screen.getByText('INV-002')).toBeInTheDocument();
    });
  });

  it('marks the current invoice', async () => {
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001', { is_original: true }),
        mockInvoice('INV-002'),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-002" onOpenInvoice={() => {}} />
    );

    await waitFor(() => {
      const currentInvoice = screen.getByText('bill_split.current_bill');
      expect(currentInvoice).toBeInTheDocument();
    });
  });

  it('calls onOpenInvoice when another invoice is clicked', async () => {
    const onOpenInvoice = vi.fn();
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001'),
        mockInvoice('INV-002'),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-001" onOpenInvoice={onOpenInvoice} />
    );

    const inv2Button = await screen.findByText('INV-002');
    await userEvent.click(inv2Button);

    expect(onOpenInvoice).toHaveBeenCalled();
  });

  it('navigates to previous invoice with prev button', async () => {
    const onOpenInvoice = vi.fn();
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001'),
        mockInvoice('INV-002'),
        mockInvoice('INV-003'),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-002" onOpenInvoice={onOpenInvoice} />
    );

    const prevButton = await screen.findByLabelText('bill_split.prev_bill');
    await userEvent.click(prevButton);

    expect(onOpenInvoice).toHaveBeenCalled();
  });

  it('navigates to next invoice with next button', async () => {
    const onOpenInvoice = vi.fn();
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001'),
        mockInvoice('INV-002'),
        mockInvoice('INV-003'),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-002" onOpenInvoice={onOpenInvoice} />
    );

    const nextButton = await screen.findByLabelText('bill_split.next_bill');
    await userEvent.click(nextButton);

    expect(onOpenInvoice).toHaveBeenCalled();
  });

  it('shows loading state initially', () => {
    mockGetSplitGroup.mockImplementation(() => new Promise(() => {}));

    render(
      <SplitGroupPanel invoiceName="INV-001" onOpenInvoice={() => {}} />
    );

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows paid badge for paid invoices', async () => {
    mockGetSplitGroup.mockResolvedValue({
      invoices: [
        mockInvoice('INV-001', { docstatus: 1 }),
        mockInvoice('INV-002', { docstatus: 0 }),
      ],
    });

    render(
      <SplitGroupPanel invoiceName="INV-001" onOpenInvoice={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByText('bill_split.paid_bill')).toBeInTheDocument();
    });
  });
});
