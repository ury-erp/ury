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

  return (
    <CustomerPicker
      value={selectedCustomer}
      onChange={setSelectedCustomer}
      // The customer stays editable on an open (draft) order so staff can replace a walk-in
      // or provisional customer before payment. Order type stays locked while updating.
      disabled={disabled}
    />
  );
}

