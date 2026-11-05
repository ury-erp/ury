import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CustomerSelect } from './CustomerSelect';

let usePOSStoreMock = vi.fn(() => ({
  selectedCustomer: null,
  setSelectedCustomer: vi.fn(),
  selectedOrderType: 'Dine In',
  isUpdatingOrder: false,
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => usePOSStoreMock(),
}));

vi.mock('./AggregatorSelect', () => ({
  AggregatorSelect: () => <div>Aggregator Select</div>,
}));

const pickerProps = vi.fn();
vi.mock('./CustomerPicker', () => ({
  CustomerPicker: (props: any) => {
    pickerProps(props);
    const { value, onChange, disabled } = props;
    return (
    <div data-testid="customer-picker">
      <input
        type="text"
        value={value?.name || ''}
        onChange={(e) => onChange({ name: e.target.value })}
        disabled={disabled}
        placeholder="Select customer"
      />
    </div>
    );
  },
}));

describe('CustomerSelect', () => {
  beforeEach(() => {
    cleanup();
    usePOSStoreMock = vi.fn(() => ({
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: 'Dine In',
      isUpdatingOrder: false,
    }));
  });

  it('renders CustomerPicker for non-aggregator order types', () => {
    render(<CustomerSelect />);
    expect(screen.getByTestId('customer-picker')).toBeInTheDocument();
  });

  it('renders AggregatorSelect for aggregator order type', async () => {
    usePOSStoreMock = vi.fn(() => ({
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: 'Aggregators',
      isUpdatingOrder: false,
    }));
    render(<CustomerSelect />);
    expect(screen.getByText('Aggregator Select')).toBeInTheDocument();
  });

  it('passes disabled prop to CustomerPicker', () => {
    render(<CustomerSelect disabled={true} />);
    const input = screen.getByPlaceholderText('Select customer') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('disables CustomerPicker when isUpdatingOrder is true', async () => {
    usePOSStoreMock = vi.fn(() => ({
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: 'Dine In',
      isUpdatingOrder: true,
    }));

    render(<CustomerSelect />);
    const input = screen.getByPlaceholderText('Select customer') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('does not pass an orderType filter to the picker (picker always searches all customers)', () => {
    pickerProps.mockClear();
    render(<CustomerSelect />);
    expect(pickerProps).toHaveBeenCalled();
    expect(pickerProps.mock.calls[0][0]).not.toHaveProperty('orderType');
  });
});
