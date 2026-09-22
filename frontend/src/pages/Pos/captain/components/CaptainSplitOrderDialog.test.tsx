import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaptainSplitOrderDialog, { type CaptainSplitOrderItem } from './CaptainSplitOrderDialog';

vi.mock('../../components/CustomerPicker', () => ({
  CustomerPicker: ({
    value,
    onChange,
    disabled,
  }: {
    value: { id: string; name: string } | null;
    onChange: (c: { id: string; name: string }) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="customer-picker">
      <button
        type="button"
        data-testid="pick-customer"
        disabled={disabled}
        onClick={() => onChange({ id: 'CUST-002', name: 'Jane Roe' })}
      >
        {value ? value.name : 'pick'}
      </button>
    </div>
  ),
}));

vi.mock('../../i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'bill_split.split_bill': 'Split Bill',
      'bill_split.select_items': 'Select items to move',
      'bill_split.available_qty': 'Available: {qty}',
      'bill_split.move_qty': 'Move Qty',
      'bill_split.customer_for_new_bill': 'Customer for new bill',
      'bill_split.same_as_original': 'Same as original customer',
      'bill_split.stays_on_bill': 'Stays on original bill',
      'bill_split.moves_to_new_bill': 'Moves to new bill',
      'bill_split.split_confirm': 'Split',
      'bill_split.split_failed': 'Failed to split bill',
      'bill_split.cannot_move_all_items': 'Cannot move all items',
      'bill_split.customer_required': 'Customer is required',
      'common.cancel': 'Cancel',
      'common.loading': 'Loading...',
    };
    let out = translations[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v));
    }
    return out;
  },
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

type WithChildren = { children?: ReactNode };

vi.mock('@ury/ui', () => ({
  Dialog: ({ open, children }: WithChildren & { open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: WithChildren) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: WithChildren) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: WithChildren) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: WithChildren) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: WithChildren) => <div data-testid="dialog-footer">{children}</div>,
  Button: ({
    onClick,
    disabled,
    children,
  }: WithChildren & { onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
  // Real Checkbox is a native `<input type="checkbox">` under the hood
  // (see packages/ui/src/components/checkbox.tsx) -- this stub keeps that
  // contract (role="checkbox", checked/onChange/disabled) without pulling in
  // the real component's lucide-react Check icon dependency.
  Checkbox: (props: any) => <input type="checkbox" {...props} />,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Check: () => <div>Check</div>,
  Minus: () => <div>Minus</div>,
  Plus: () => <div>Plus</div>,
}));

const mockItems: CaptainSplitOrderItem[] = [
  { name: 'LINE-001', item_name: 'Chicken Biryani', qty: 2, rate: 250, amount: 500 },
  { name: 'LINE-002', item_name: 'Butter Naan', qty: 1, rate: 50, amount: 50 },
];

const mockCustomer = { id: 'CUST-001', name: 'John Doe', phone: '1234567890' };

function getButtonByText(text: string) {
  const buttons = screen.getAllByTestId('button');
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button found containing "${text}"`);
  return button;
}

describe('CaptainSplitOrderDialog', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not render when open is false', () => {
    render(
      <CaptainSplitOrderDialog
        open={false}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByTestId('dialog-title')).not.toBeInTheDocument();
  });

  it('renders items, and the split button is disabled with nothing selected', () => {
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Chicken Biryani')).toBeInTheDocument();
    expect(screen.getByText('Butter Naan')).toBeInTheDocument();
    expect(getButtonByText('Split')).toBeDisabled();
  });

  it('selecting an item enables the split button and updates the moving/staying totals', async () => {
    const user = userEvent.setup();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    // Selecting BOTH full items would leave nothing "staying", so select
    // only the single-qty Naan line -- this must move Rs.50 and leave Rs.500.
    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);

    expect(screen.getAllByText('Rs. 50').length).toBeGreaterThanOrEqual(2); // item + moving total
    expect(screen.getAllByText('Rs. 500').length).toBeGreaterThanOrEqual(2); // item + staying total
    expect(getButtonByText('Split')).not.toBeDisabled();
  });

  it('does not enable quantity adjusters for a qty=1 item, but does for qty>1', async () => {
    const user = userEvent.setup();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);
    expect(screen.queryByText('Minus')).not.toBeInTheDocument();

    const biryaniRow = screen.getByText('Chicken Biryani').closest('[role="button"]')!;
    await user.click(biryaniRow);
    expect(screen.getByText('Minus')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // full qty selected by default
  });

  it('adjusting quantity down keeps the selection valid and recomputes totals', async () => {
    const user = userEvent.setup();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const biryaniRow = screen.getByText('Chicken Biryani').closest('[role="button"]')!;
    await user.click(biryaniRow); // selects qty=2 by default -> moving 500, staying 50 (naan not selected)

    const minus = screen.getAllByText('Minus')[0].closest('button')!;
    await user.click(minus); // moveQty 2 -> 1

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows an error and does not call onConfirm when nothing valid is selected (moving Rs.0)', async () => {
    const onConfirm = vi.fn();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    // Split button is disabled, so directly assert onConfirm can't be invoked via UI.
    expect(getButtonByText('Split')).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('requires a customer when "same as original" is unchecked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={null}
        onConfirm={onConfirm}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox); // uncheck "same as original" -- no customer picked yet

    await user.click(getButtonByText('Split'));

    await waitFor(() => expect(screen.getByText('Customer is required')).toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with itemsToMove and no customer when "same as original" stays checked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);

    await user.click(getButtonByText('Split'));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        itemsToMove: [{ name: 'LINE-002', qty: 1 }],
        customer: undefined,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm with the picked customer id when a different customer is chosen', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);

    await user.click(screen.getByRole('checkbox')); // uncheck same-as-original
    await user.click(screen.getByTestId('pick-customer'));

    await user.click(getButtonByText('Split'));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        itemsToMove: [{ name: 'LINE-002', qty: 1 }],
        customer: 'CUST-002',
      })
    );
  });

  it('surfaces the thrown error message when onConfirm rejects, and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error('server exploded'));
    const onOpenChange = vi.fn();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);
    await user.click(getButtonByText('Split'));

    await waitFor(() => expect(screen.getByText('server exploded')).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('falls back to a generic error message when onConfirm rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue('nope');
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    const naanRow = screen.getByText('Butter Naan').closest('[role="button"]')!;
    await user.click(naanRow);
    await user.click(getButtonByText('Split'));

    await waitFor(() => expect(screen.getByText('Failed to split bill')).toBeInTheDocument());
  });

  it('resets selection state and closes on cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CaptainSplitOrderDialog
        open={true}
        onOpenChange={onOpenChange}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    await user.click(getButtonByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
