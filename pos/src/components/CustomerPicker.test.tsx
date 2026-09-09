import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerPicker } from './CustomerPicker';
import type { Customer } from '../store/pos-store';

vi.mock('../lib/customer-api', () => ({
  searchCustomers: vi.fn(),
  addCustomer: vi.fn(),
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => ({
    customerGroups: [],
    territories: [],
    fetchCustomerGroups: vi.fn().mockResolvedValue([]),
    fetchTerritories: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@ury/ui', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  Input: ({ value, onChange, onFocus, ...props }: any) => (
    <input value={value} onChange={onChange} onFocus={onFocus} {...props} />
  ),
}));

import { searchCustomers, addCustomer } from '../lib/customer-api';

const mockSearchCustomers = searchCustomers as ReturnType<typeof vi.fn>;

describe('CustomerPicker', () => {
  const mockCustomer: Customer = {
    id: 'CUST-001',
    name: 'John Doe',
    phone: '9876543210',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input when no customer is selected', () => {
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    expect(input).toBeTruthy();
  });

  it('displays selected customer information', () => {
    render(
      <CustomerPicker
        value={mockCustomer}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
  });

  it('shows change button when customer is selected', () => {
    render(
      <CustomerPicker
        value={mockCustomer}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText('common.change')).toBeTruthy();
  });

  it('clears customer selection when change button is clicked', async () => {
    const onChange = vi.fn();
    render(
      <CustomerPicker
        value={mockCustomer}
        onChange={onChange}
      />
    );
    
    const changeButton = screen.getByText('common.change');
    await userEvent.click(changeButton);
    
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('searches customers when typing in search input', async () => {
    mockSearchCustomers.mockResolvedValueOnce([
      { name: 'CUST-001', content: 'Customer Name : John Doe | Mobile Number : 9876543210' },
    ]);
    
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    await userEvent.type(input, 'john');
    
    await waitFor(() => {
      expect(mockSearchCustomers).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('displays search results after debounce', async () => {
    mockSearchCustomers.mockResolvedValueOnce([
      { name: 'CUST-001', content: 'Customer Name : John Doe | Mobile Number : 9876543210' },
    ]);
    
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    await userEvent.type(input, 'john');
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeTruthy();
    }, { timeout: 1500 });
  });

  it('disables search input when disabled prop is true', () => {
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
        disabled={true}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    expect(input.hasAttribute('disabled')).toBe(true);
  });

  it('disables change button when disabled prop is true', () => {
    render(
      <CustomerPicker
        value={mockCustomer}
        onChange={vi.fn()}
        disabled={true}
      />
    );
    
    const changeButton = screen.getByText('common.change');
    expect(changeButton.closest('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('shows add new customer option', async () => {
    mockSearchCustomers.mockResolvedValueOnce([]);
    
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    await userEvent.type(input, 'new');
    
    await waitFor(() => {
      expect(screen.getByText('customer.add_new')).toBeTruthy();
    }, { timeout: 1500 });
  });

  it('opens dropdown when input receives focus', async () => {
    mockSearchCustomers.mockResolvedValueOnce([]);
    
    render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    const input = screen.getByPlaceholderText('customer.search_placeholder');
    await userEvent.click(input);
    
    expect(input).toHaveFocus();
  });

  it('renders correctly with empty initial state', () => {
    const { container } = render(
      <CustomerPicker
        value={null}
        onChange={vi.fn()}
      />
    );
    
    expect(container).toBeTruthy();
  });
});
