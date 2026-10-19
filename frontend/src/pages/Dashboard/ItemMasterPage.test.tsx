import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemMasterPage from './ItemMasterPage';
import { call } from '@ury/core';

vi.mock('../../context/CurrencyContext', () => ({
  useCurrency: () => ({
    symbol: '₹',
  }),
}));

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn(),
    formatCurrency: (amount: number) => `₹${amount}`,
  };
});

vi.mock('@ury/ui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    showToast: {
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../../components/DeskLink', () => ({
  DeskLink: () => <span data-testid="desk-link" />,
  useDeskPermission: () => ({ read: true, write: true }),
}));

vi.mock('../../components/common/SearchableSelect', () => ({
  SearchableSelect: ({ id, value, onChange, options, placeholder }: any) => (
    <select
      data-testid={id}
      value={value}
      onChange={(e) => onChange(id, e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../components/layout/SideDrawer', () => ({
  default: ({ isOpen, title, children }: any) => {
    return isOpen ? (
      <div data-testid="side-drawer">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null;
  },
}));

const mockItems = [
  {
    name: 'Lahm Mandhi',
    item_code: 'Lahm Mandhi',
    item_name: 'Lahm Mandhi',
    item_group: 'Main Course',
    stock_uom: 'Nos',
    standard_rate: 140,
    is_sales_item: 1,
    is_stock_item: 0,
    is_purchase_item: 1,
    include_item_in_manufacturing: 1,
    is_disposable: 0,
    disabled: 0,
    image: null,
    description: 'Delicious Lahm Mandhi',
  },
  {
    name: 'DRTST',
    item_code: 'DRTST',
    item_name: 'Cold Drink Can',
    item_group: 'Beverages',
    stock_uom: 'Nos',
    standard_rate: 45,
    is_sales_item: 1,
    is_stock_item: 1,
    is_purchase_item: 1,
    include_item_in_manufacturing: 0,
    is_disposable: 0,
    disabled: 1,
    image: null,
    description: 'Chilled drink',
  },
];

describe('ItemMasterPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    vi.mocked(call).mockImplementation(async (method: string, args?: any) => {
      if (method === 'frappe.client.get_list') {
        if (args?.doctype === 'Item') {
          return mockItems;
        }
        if (args?.doctype === 'Item Group') {
          return [{ name: 'Main Course' }, { name: 'Beverages' }, { name: 'All Item Groups' }];
        }
        if (args?.doctype === 'UOM') {
          return [{ name: 'Nos' }, { name: 'Unit' }, { name: 'Kg' }];
        }
      }
      if (method === 'frappe.client.insert') {
        return { name: args.doc.item_code, ...args.doc };
      }
      if (method === 'frappe.client.set_value') {
        return { name: args.name };
      }
      if (method === 'frappe.client.delete') {
        return { message: 'ok' };
      }
      return {};
    });
  });

  it('renders item master list with items from ERPNext', async () => {
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
      expect(screen.getByText('Cold Drink Can')).toBeInTheDocument();
    });

    expect(screen.getByText('2 Items')).toBeInTheDocument();
  });

  it('filters items by search query', async () => {
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText('Search items or codes...');
    fireEvent.change(searchInput, { target: { value: 'Cold' } });

    await waitFor(() => {
      expect(screen.getByText('Cold Drink Can')).toBeInTheDocument();
      expect(screen.queryByText('Lahm Mandhi')).not.toBeInTheDocument();
    });
  });

  it('filters items by item group', async () => {
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const groupFilter = screen.getByTestId('group-filter');
    fireEvent.change(groupFilter, { target: { value: 'Beverages' } });

    await waitFor(() => {
      expect(screen.getByText('Cold Drink Can')).toBeInTheDocument();
      expect(screen.queryByText('Lahm Mandhi')).not.toBeInTheDocument();
    });
  });

  it('switches between list and grid views', async () => {
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const gridBtn = screen.getByTitle('Grid View');
    fireEvent.click(gridBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const listBtn = screen.getByTitle('List View');
    fireEvent.click(listBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });
  });

  it('opens drawer to add item and submits insert to ERPNext', async () => {
    const user = userEvent.setup();
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const addBtn = screen.getByRole('button', { name: /add item/i });
    await user.click(addBtn);

    expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
    expect(screen.getByText('Add New Item')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g. Chicken Mandi, Cold Coffee');
    await user.type(nameInput, 'Special Falooda');

    const submitBtn = screen.getByRole('button', { name: /create item/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith('frappe.client.insert', expect.objectContaining({
        doc: expect.objectContaining({
          doctype: 'Item',
          item_name: 'Special Falooda',
          item_code: 'Special Falooda',
        }),
      }));
    });
  });

  it('opens drawer to edit item and submits set_value to ERPNext', async () => {
    const user = userEvent.setup();
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const editButtons = screen.getAllByTitle('Edit Item');
    await user.click(editButtons[0]);

    expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
    expect(screen.getByText('Edit Item: Lahm Mandhi')).toBeInTheDocument();

    const rateInput = screen.getByDisplayValue('140');
    await user.clear(rateInput);
    await user.type(rateInput, '160');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith('frappe.client.set_value', expect.objectContaining({
        doctype: 'Item',
        name: 'Lahm Mandhi',
        fieldname: expect.objectContaining({
          standard_rate: 160,
        }),
      }));
    });
  });

  it('allows deleting an item with confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<ItemMasterPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Lahm Mandhi').length).toBeGreaterThan(0);
    });

    const deleteButtons = screen.getAllByTitle('Delete Item');
    await user.click(deleteButtons[0]);

    expect(screen.getByRole('heading', { name: 'Delete Item' })).toBeInTheDocument();

    const confirmBtns = screen.getAllByRole('button', { name: 'Delete Item' });
    const confirmBtn = confirmBtns[confirmBtns.length - 1];
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Item',
        name: 'Lahm Mandhi',
      });
    });
  });
});
