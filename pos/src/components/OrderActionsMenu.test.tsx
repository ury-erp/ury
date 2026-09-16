import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderActionsMenu from './OrderActionsMenu';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

describe('OrderActionsMenu', () => {
  it('returns null when no actions are available', () => {
    const { container } = render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showSplitBill={false}
        showMergeBill={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toggle button when actions are available', () => {
    render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showSplitBill={true}
      />
    );
    expect(screen.getByLabelText('order.order_actions')).toBeTruthy();
  });

  it('opens menu when toggle button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={onOpenChange}
        showSplitBill={true}
      />
    );
    
    await userEvent.click(screen.getByLabelText('order.order_actions'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('closes menu when toggle button is clicked again', async () => {
    const onOpenChange = vi.fn();
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showSplitBill={true}
      />
    );
    
    await userEvent.click(screen.getByLabelText('order.order_actions'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('displays split bill option when showSplitBill is true', () => {
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showSplitBill={true}
        onSplitBill={vi.fn()}
      />
    );
    expect(screen.getByText('bill_split.split_bill')).toBeTruthy();
  });

  it('displays merge bill option when showMergeBill is true', () => {
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showMergeBill={true}
        onMergeBill={vi.fn()}
      />
    );
    expect(screen.getByText('bill_merge.merge_bill')).toBeTruthy();
  });

  it('calls onSplitBill when split bill option is clicked', async () => {
    const onSplitBill = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showSplitBill={true}
        onSplitBill={onSplitBill}
      />
    );
    
    await userEvent.click(screen.getByText('bill_split.split_bill'));
    expect(onSplitBill).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onMergeBill when merge bill option is clicked', async () => {
    const onMergeBill = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showMergeBill={true}
        onMergeBill={onMergeBill}
      />
    );
    
    await userEvent.click(screen.getByText('bill_merge.merge_bill'));
    expect(onMergeBill).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes menu when clicking outside', async () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <div>
        <OrderActionsMenu
          isOpen={true}
          onOpenChange={onOpenChange}
          showSplitBill={true}
        />
        <div data-testid="outside-element">Outside</div>
      </div>
    );
    
    const outsideElement = screen.getByTestId('outside-element');
    fireEvent.mouseDown(outsideElement);
    
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('sets aria-expanded correctly based on isOpen', () => {
    const { rerender } = render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showSplitBill={true}
      />
    );
    
    let button = screen.getByLabelText('order.order_actions');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    
    rerender(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showSplitBill={true}
      />
    );
    
    button = screen.getByLabelText('order.order_actions');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});
