import { usePOSStore } from '../store/pos-store';
import { AggregatorSelect } from './AggregatorSelect';
import { CustomerPicker } from './CustomerPicker';

interface CustomerSelectProps {
  disabled?: boolean;
}

export function CustomerSelect({ disabled }: CustomerSelectProps) {
  const { selectedCustomer, setSelectedCustomer, selectedOrderType, isUpdatingOrder } = usePOSStore();

  if (selectedOrderType === 'Aggregators') {
    return <AggregatorSelect />;
  }

  return (
    <CustomerPicker
      value={selectedCustomer}
      onChange={setSelectedCustomer}
      disabled={disabled || isUpdatingOrder}
    />
  );
}
