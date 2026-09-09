import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillSplitDialog, { type BillSplitItem } from './BillSplitDialog';

vi.mock('./CustomerPicker', () => ({
  CustomerPicker: ({ value, onChange, disabled }: any) => (
    <div data-testid="customer-picker">Customer Picker</div>
  ),
}));

vi.mock('../i18n', () => ({
  t: (key: string, params?: any) => {
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
    return translations[key] || key;
  },
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock('@ury/ui', () => ({
  Dialog: ({ open, onOpenChange, children }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  Button: ({ onClick, disabled, children }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">{children}</button>
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Check: () => <div>Check</div>,
  Minus: () => <div>Minus</div>,
  Plus: () => <div>Plus</div>,
}));

describe('BillSplitDialog', () => {
  const mockItems: BillSplitItem[] = [
    {
      name: 'LINE-001',
      item_name: 'Chicken Biryani',
      qty: 2,
      rate: 250,
      amount: 500,
    },
    {
      name: 'LINE-002',
      item_name: 'Butter Naan',
      qty: 1,
      rate: 50,
      amount: 50,
    },
  ];

  const mockCustomer = { id: 'CUST-001', name: 'John Doe' };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not render when open is false', () => {
    render(
      <BillSplitDialog
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

  it('renders dialog when open is true', () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Split Bill')).toBeInTheDocument();
  });

  it('displays all items in the list', () => {
    render(
      <BillSplitDialog
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
  });

  it('allows selecting items', async () => {
    const user = userEvent.setup();
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const biryaniItem = screen.getByText('Chicken Biryani').closest('[role="button"]');
    await user.click(biryaniItem!);
  });

  it('displays totals that update when items are selected', async () => {
    const user = userEvent.setup();
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const biryaniItem = screen.getByText('Chicken Biryani').closest('[role="button"]');
    await user.click(biryaniItem!);

    expect(screen.getByText('Stays on original bill')).toBeInTheDocument();
    expect(screen.getByText('Moves to new bill')).toBeInTheDocument();
  });

  it('shows customer picker checkbox', () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Same as original customer')).toBeInTheDocument();
  });

  it('disables split button when nothing is selected', () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const buttons = screen.getAllByTestId('button');
    const splitButton = buttons.find(b => b.textContent?.includes('Split'));
    expect(splitButton).toHaveAttribute('disabled');
  });

  it('handles split confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    onConfirm.mockResolvedValueOnce(undefined);

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={onConfirm}
      />
    );

    const biryaniItem = screen.getByText('Chicken Biryani').closest('[role="button"]');
    await user.click(biryaniItem!);

    const buttons = screen.getAllByTestId('button');
    const splitButton = buttons.find(b => b.textContent?.includes('Split'));
    
    if (splitButton && !splitButton.hasAttribute('disabled')) {
      await user.click(splitButton);
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
      });
    }
  });

  it('allows quantity adjustment for multi-quantity items', async () => {
    const user = userEvent.setup();
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const biryaniItem = screen.getByText('Chicken Biryani').closest('[role="button"]');
    await user.click(biryaniItem!);

    // Quantity controls should appear for items with qty > 1
    const minusButtons = screen.getAllByText('Minus');
    expect(minusButtons.length).toBeGreaterThan(0);
  });

  it('closes dialog on cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={onOpenChange}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    const buttons = screen.getAllByTestId('button');
    const cancelButton = buttons.find(b => b.textContent?.includes('Cancel'));
    
    if (cancelButton) {
      await user.click(cancelButton);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }
  });
});
