import { useEffect, useState } from 'react';
import { usePOSStore } from '../store/pos-store';
import { t } from '../i18n';
import { Select, SelectItem } from './ui/select';
import { getAggregators, type Aggregator } from '../lib/aggregator-api';

interface AggregatorSelectProps {
  disabled?: boolean;
}

export function AggregatorSelect({ disabled }: AggregatorSelectProps) {
  const { selectedAggregator, setSelectedAggregator, fetchAggregatorMenu } = usePOSStore();
  const [aggregators, setAggregators] = useState<Aggregator[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAggregatorsList = async () => {
      setLoading(true);
      try {
        const data = await getAggregators();
        setAggregators(data);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to fetch aggregators:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAggregatorsList();
  }, []);

  const handleAggregatorChange = async (value: string) => {
    const aggregator = aggregators.find(a => a.customer === value);
    setSelectedAggregator(aggregator || null);

    if (aggregator) {
      try {
        await fetchAggregatorMenu(aggregator.customer);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to fetch aggregator menu:', error);
      }
    }
  };

  return (
    <div>
      <Select
        value={selectedAggregator?.customer || ''}
        onValueChange={handleAggregatorChange}
        disabled={disabled || loading}
        placeholder={loading ? t('aggregator.loading') : t('aggregator.select_placeholder')}
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