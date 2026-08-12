import { usePOSStore } from '../store/pos-store';
import { Select, SelectItem } from '@ury/ui';
import { useAggregators } from '../hooks/useMasterData';

interface AggregatorSelectProps {
  disabled?: boolean;
}

export function AggregatorSelect({ disabled }: AggregatorSelectProps) {
  const { selectedAggregator, setSelectedAggregator } = usePOSStore();
  const { data: aggregators = [], isLoading: loading } = useAggregators();

  const handleAggregatorChange = (value: string) => {
    if (!value) {
      setSelectedAggregator(null);
      return;
    }
    const aggregator = aggregators.find(a => a.customer === value) || { customer: value };
    setSelectedAggregator(aggregator);
  };

  return (
    <div>
      <Select
        value={selectedAggregator?.customer || ''}
        onValueChange={handleAggregatorChange}
        disabled={disabled || loading}
        placeholder={loading ? 'Loading aggregators...' : 'Select an aggregator'}
      >
        {aggregators.map((aggregator) => (
          <SelectItem 
            key={aggregator.customer} 
            value={aggregator.customer}
            className="capitalize"
          >
            {aggregator.customer}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
