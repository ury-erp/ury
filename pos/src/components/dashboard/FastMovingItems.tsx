import { Flame } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';
import { useEffect, useState } from 'react';
import { isPermissionError } from './isPermissionError';

interface FastMovingItem {
  item: string;
  item_name: string | null;
  qty_sold: number;
  sell_rate_per_hour: number;
}

interface FastMovingItemsProps {
  branch?: string;
  windowDays?: number;
}

// Renders a ranked list of items by recent sell rate. This is explicitly a
// sell-rate ranking, not a live stock count — there is no per-item stock
// field backing it, so the label must say "based on recent sell rate" and
// never imply an "86" / running-low-on-stock reading.
export default function FastMovingItems({ branch, windowDays = 1 }: FastMovingItemsProps) {
  const [items, setItems] = useState<FastMovingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchFastMoving = async () => {
      setLoading(true);
      setError(null);
      try {
        const { call } = await import('@ury/core');
        const res = await call.get('ury.ury.api.ury_fast_moving.get_fast_moving_items', {
          branch,
          window_days: windowDays
        });
        if (!cancelled) {
          const data = Array.isArray(res.message) ? res.message : [];
          setItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (isPermissionError(err)) {
            // Not a manager — hide the card entirely rather than showing an error.
            setHidden(true);
          } else {
            setError('Failed to load fast-moving items');
            console.error('Error fetching fast-moving items:', err);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFastMoving();
    return () => {
      cancelled = true;
    };
  }, [branch, windowDays]);

  const maxRate = Math.max(...items.map((item) => item.sell_rate_per_hour), 0.001);

  if (hidden) return null;

  return (
    <Card className="bg-white border border-border">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-5 h-5 text-orange-600" />
          <h3 className="font-display text-lg font-semibold text-gray-900">Fast Moving</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Based on recent sell rate, not a live stock count</p>

        {error ? (
          <p className="text-red-600 text-sm">Failed to load fast-moving items</p>
        ) : loading ? (
          <p className="text-gray-600 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-600 text-sm">No sales activity to rank yet.</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 8).map((item) => (
              <div key={item.item} className="flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">
                  {item.item_name || item.item}
                </span>
                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${(item.sell_rate_per_hour / maxRate) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-gray-600 w-20 text-right flex-shrink-0">
                  {item.sell_rate_per_hour}/hr
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
