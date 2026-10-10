import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../../i18n';

/**
 * Shown when a list could not be loaded.
 *
 * The alternative — and what this replaces — was resolving a failed fetch to
 * an empty array. An empty list is a believable answer ("this branch has no
 * tables yet"), so a broken backend read as an empty module and invited
 * someone to create records that already existed. A list that failed and a
 * list that is empty must not look the same.
 */
export const LoadErrorBanner: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div
    role="alert"
    className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div className="flex items-start gap-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-red-800">{t('dash.common.load_failed')}</p>
        <p className="text-xs text-red-700">{t('dash.common.load_failed_hint')}</p>
      </div>
    </div>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 border-red-300 text-red-700 hover:bg-red-100">
        <RefreshCw className="me-2 h-3.5 w-3.5" />
        {t('dash.common.retry')}
      </Button>
    )}
  </div>
);

export default LoadErrorBanner;
