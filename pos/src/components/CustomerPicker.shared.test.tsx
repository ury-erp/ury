import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomerPicker, type CustomerOption } from '@ury/ui';

const labels = {
  placeholder: 'Search customer...',
  addNew: 'Add New Customer',
  nameLabel: 'Name',
  phoneLabel: 'Phone',
  addButton: 'Add Customer',
  adding: 'Adding…',
  cancel: 'Cancel',
  changeLabel: 'Change',
  noResults: 'No customers found',
  searchFailed: 'Failed to search customers',
  searching: 'Searching…',
  createTitle: 'Add New Customer',
};

const alice: CustomerOption = { id: 'CUST-1', name: 'Alice', phone: '999' };

describe('CustomerPicker keyboard and prefill', () => {
  it('selects a highlighted result with ArrowDown + Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSearch = vi.fn();

    render(
      <CustomerPicker
        value={null}
        onChange={onChange}
        results={[alice]}
        onSearch={onSearch}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    const input = screen.getByPlaceholderText('Search customer...');
    await user.click(input);
    await user.type(input, 'Ali');
    // First result is highlighted by default (index 0).
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(alice);
  });

  it('moves highlight to Add New with ArrowDown then opens create on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CustomerPicker
        value={null}
        onChange={onChange}
        results={[alice]}
        onSearch={vi.fn()}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    const input = screen.getByPlaceholderText('Search customer...');
    await user.click(input);
    await user.type(input, 'Ali');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Ali');
  });

  it('prefills phone when opening create from a digits-only query', async () => {
    const user = userEvent.setup();

    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        results={[]}
        onSearch={vi.fn()}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    const input = screen.getByPlaceholderText('Search customer...');
    await user.click(input);
    await user.type(input, '9876543210');
    await user.click(screen.getByRole('button', { name: /add new customer/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Phone')).toHaveValue('9876543210');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
  });

  it('uses Change for selected clear and Cancel in the create dialog', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <CustomerPicker
        value={alice}
        onChange={vi.fn()}
        results={[]}
        onSearch={vi.fn()}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();

    rerender(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        results={[]}
        onSearch={vi.fn()}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    await user.click(screen.getByPlaceholderText('Search customer...'));
    await user.click(screen.getByRole('button', { name: /add new customer/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows searchFailed copy for searchError, not noResults', async () => {
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        results={[]}
        searching={false}
        searchError="Failed to search customers"
        onSearch={vi.fn()}
        onCreate={vi.fn()}
        labels={labels}
      />
    );

    await userEvent.click(screen.getByPlaceholderText('Search customer...'));
    expect(await screen.findByText('Failed to search customers')).toBeInTheDocument();
    expect(screen.queryByText('No customers found')).not.toBeInTheDocument();
  });
});
