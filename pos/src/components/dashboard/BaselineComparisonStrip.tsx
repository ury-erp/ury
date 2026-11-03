import { Card, CardContent } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { useEffect, useState } from 'react';
import { isPermissionError } from './isPermissionError';
import { t } from '../../i18n';

interface BaselineComparison {
  window: string;
  sample_days: number;
  current: { sales: number; covers: number };
  baseline: { sales: number; covers: number };
  delta: {
    sales: number;
    covers: number;
    sales_pct: number | null;
    covers_pct: number | null;
  };
}

interface BaselineComparisonStripProps {
  branch?: string;
}

function DeltaLabel({ pct, positiveIsGood = true }: { pct: number | null; positiveIsGood?: boolean }) {
  if (pct === null) return <span className="text-gray-500">{t('dash_cards.no_baseline')}</span>;
  const isUp = pct >= 0;
  const isGood = positiveIsGood ? isUp : !isUp;
  return (
    <span className={isGood ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
      {isUp ? '+' : ''}
      {pct}%
    </span>
  );
}

// "Tonight vs a normal Tuesday" strip, matching the mockup's metrics-strip
// card language: current value, delta vs a rolling same-weekday/same-time
// baseline. Renders standalone; a missing/zero-sample baseline degrades to
// "no baseline yet" rather than blocking the strip.
export default function BaselineComparisonStrip({ branch }: BaselineComparisonStripProps) {
  const [comparison, setComparison] = useState<BaselineComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchComparison = async () => {
      setLoading(true);
      setError(null);
      try {
        const { call } = await import('@ury/core');
        const res = await call.get('ury.ury.api.ury_dashboard.get_baseline_comparison', {
          branch
        });
        if (!cancelled) setComparison(res.message);
      } catch (err) {
        if (!cancelled) {
          if (isPermissionError(err)) {
            // Not a manager — hide the card entirely rather than showing an error.
            setHidden(true);
          } else {
            setError(t('dash_cards.baseline_failed'));
            console.error('Error fetching baseline comparison:', err);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchComparison();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  if (hidden) return null;

  return (
    <Card className="bg-white border border-border">
      <CardContent className="p-6">
        <h3 className="font-display text-lg font-semibold text-gray-900">{t('dash_cards.baseline_title')}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {comparison && comparison.sample_days > 0
            ? t('dash_cards.compared_last_n', { n: comparison.sample_days })
            : t('dash_cards.compared_same_weekday')}
        </p>

        {error ? (
          <p className="text-red-600 text-sm">{t('dash_cards.baseline_failed')}</p>
        ) : loading ? (
          <p className="text-gray-600 text-sm">{t('common.loading')}</p>
        ) : !comparison ? (
          <p className="text-gray-600 text-sm">{t('dash_cards.no_data')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">{t('dash_cards.sales_so_far')}</p>
              <p className="font-mono text-xl font-semibold text-gray-900">
                {formatCurrency(comparison.current.sales)}
              </p>
              <p className="text-xs mt-1">
                <DeltaLabel pct={comparison.delta.sales_pct} />
                <span className="text-gray-500"> {t('dash_cards.vs_usual', { value: formatCurrency(comparison.baseline.sales) })}</span>
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">{t('dash_cards.covers')}</p>
              <p className="font-mono text-xl font-semibold text-gray-900">{comparison.current.covers}</p>
              <p className="text-xs mt-1">
                <DeltaLabel pct={comparison.delta.covers_pct} />
                <span className="text-gray-500"> {t('dash_cards.vs_usual', { value: comparison.baseline.covers })}</span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
