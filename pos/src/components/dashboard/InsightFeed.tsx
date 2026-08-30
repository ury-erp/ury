import { X, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';
import { useEffect, useState } from 'react';
import { isPermissionError } from './isPermissionError';

interface UryInsight {
  name: string;
  title: string;
  severity: 'Info' | 'Warning' | 'Critical';
  rule_key: string;
  branch: string | null;
  source_tool: string | null;
  body: string | null;
  creation: string;
}

// Left-rail color per severity, matching the mockup's r-alert/r-warn/r-brand
// language (Critical -> alert red, Warning -> warn amber, Info -> brand blue).
const RAIL_CLASS: Record<UryInsight['severity'], string> = {
  Critical: 'border-l-red-600',
  Warning: 'border-l-amber-600',
  Info: 'border-l-blue-600'
};

interface InsightFeedProps {
  branch?: string;
}

export default function InsightFeed({ branch }: InsightFeedProps) {
  const [insights, setInsights] = useState<UryInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [dismissing, setDismissing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const fetchInsights = async () => {
      setLoading(true);
      setError(null);
      try {
        const { call } = await import('@ury/core');
        const res = await call.get('ury.ury.api.ury_insight.get_active_insights', {
          branch
        });
        if (!cancelled) {
          const data = Array.isArray(res.message) ? res.message : [];
          setInsights(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (isPermissionError(err)) {
            // Not a manager — hide the card entirely rather than showing an error.
            setHidden(true);
          } else {
            setError('Failed to load insights');
            console.error('Error fetching insights:', err);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  const handleDismiss = async (name: string) => {
    setDismissing((prev) => ({ ...prev, [name]: true }));
    try {
      const { call } = await import('@ury/core');
      await call.post('ury.ury.api.ury_insight.dismiss_insight', { name });
      setInsights((prev) => prev.filter((item) => item.name !== name));
    } catch (err) {
      console.error('Error dismissing insight:', err);
      setDismissing((prev) => ({ ...prev, [name]: false }));
    }
  };

  if (hidden) return null;

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h3 className="font-display text-lg font-semibold text-gray-900">Act now</h3>
          </div>
          {insights.length > 0 && (
            <span className="text-xs text-gray-500">
              {insights.length} thing{insights.length !== 1 ? 's' : ''} worth your attention
            </span>
          )}
        </div>

        {error ? (
          <p className="text-red-600 text-sm">Failed to load insights</p>
        ) : loading ? (
          <p className="text-gray-600 text-sm">Loading...</p>
        ) : insights.length === 0 ? (
          <p className="text-gray-600 text-sm">Nothing needs attention right now.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.name}
                className={`flex items-start gap-3 rounded border-l-4 bg-gray-50 p-3 ${RAIL_CLASS[insight.severity] ?? RAIL_CLASS.Info}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
                  {insight.body && (
                    <p className="text-sm text-gray-600 mt-1">{insight.body}</p>
                  )}
                  {insight.branch && (
                    <span className="inline-block mt-2 text-xs text-gray-500">{insight.branch}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDismiss(insight.name)}
                  disabled={dismissing[insight.name]}
                  aria-label="Dismiss"
                  className="flex-shrink-0 text-gray-400 hover:text-gray-700 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
