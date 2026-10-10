import type { ReactNode } from 'react';
import { Card, CardContent, EmptyState, SkeletonText, cn } from '@ury/ui';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n';

interface PanelProps {
  title: string;
  icon?: ReactNode;
  /** Right-aligned slot in the panel header (a count, a legend, a badge). */
  aside?: ReactNode;
  loading?: boolean;
  /** i18n key of the failure message, or null. */
  error?: string | null;
  /** True when the request succeeded but returned nothing. */
  empty?: boolean;
  emptyTitle?: string;
  emptyIcon?: ReactNode;
  skeletonLines?: number;
  className?: string;
  children: ReactNode;
}

/**
 * The card shell every dashboard panel shares.
 *
 * Each of the seven panels used to repeat the same
 * Card → CardContent → heading → error/loading/empty/content ladder inline,
 * which is how their spacing, heading sizes and error styling drifted apart.
 * Centralising it also means the loading and failure treatments only have to
 * be got right once.
 */
export function Panel({
  title, icon, aside, loading, error, empty, emptyTitle, emptyIcon,
  skeletonLines = 3, className, children,
}: PanelProps) {
  return (
    <Card padding="none" className={cn('animate-fade-in-up', className)}>
      <CardContent className="p-5 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {icon ? <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
            {title}
          </h3>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive animate-slide-in">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t(error)}</span>
          </div>
        ) : loading ? (
          <SkeletonText lines={skeletonLines} />
        ) : empty ? (
          <EmptyState size="sm" icon={emptyIcon} title={emptyTitle ?? ''} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
