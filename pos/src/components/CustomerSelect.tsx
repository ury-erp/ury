import { usePOSStore } from '../store/pos-store';
import { AggregatorSelect } from './AggregatorSelect';
import { CustomerPicker } from './CustomerPicker';

interface CustomerSelectProps {
  disabled?: boolean;
}

export function CustomerSelect({ disabled }: CustomerSelectProps) {
  const { selectedCustomer, setSelectedCustomer, selectedOrderType } = usePOSStore();

  if (selectedOrderType === 'Aggregators') {
    return <AggregatorSelect />;
  }

  // Open draft orders stay editable (Dine In / Take Away / Delivery / Phone In)
  // so Walk-In or a provisional customer can be replaced before pay.
  return (
    <CustomerPicker
      value={selectedCustomer}
      onChange={setSelectedCustomer}
      disabled={disabled}
    />
  );
}
