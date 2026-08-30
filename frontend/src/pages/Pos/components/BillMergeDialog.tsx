import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { t } from '../i18n';
import { showToast } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { formatMergedTableLabel } from '../lib/table-utils';
import {
  getLinkedMergeSecondaries,
  getMergeBillCandidates,
  mergeBills,
  type MergeBillCandidate,
} from '../lib/invoice-api';

interface BillMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceName: string;
  onConfirm: (secondaryInvoice: string) => Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 300;

const BillMergeDialog = ({
  open,
  onOpenChange,
  invoiceName,
  onConfirm,
}: BillMergeDialogProps) => {
  const [candidates, setCandidates] = useState<MergeBillCandidate[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const linkedSecondariesRef = useRef<string[]>([]);
  const skipSearchFetchRef = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchCandidates = useCallback(
    async (nextPage: number, append: boolean) => {
      const setBusy = append ? setLoadingMore : setSearchLoading;
      setBusy(true);
      setLoadError(null);

      try {
        const { data, hasMore: more } = await getMergeBillCandidates({
          primaryInvoice: invoiceName,
          query: debouncedSearch,
          page: nextPage,
          linkedSecondaries: linkedSecondariesRef.current,
        });

        setCandidates((prev) => (append ? [...prev, ...data] : data));
        setPage(nextPage);
        setHasMore(more);
      } catch (err) {
        if (!append) {
          setCandidates([]);
        }
        setLoadError(err instanceof Error ? err.message : t('bill_merge.merge_failed'));
      } finally {
        setBusy(false);
      }
    },
    [debouncedSearch, invoiceName]
  );

  useEffect(() => {
    if (!open) {
      skipSearchFetchRef.current = true;
      return;
    }

    let cancelled = false;

    setCandidates([]);
    setInitialLoading(true);
    setSearchLoading(false);
    setLoadingMore(false);
    setLoadError(null);
    setSelected(null);
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setHasMore(false);
    setError(null);
    linkedSecondariesRef.current = [];
    skipSearchFetchRef.current = true;

    (async () => {
      try {
        linkedSecondariesRef.current = await getLinkedMergeSecondaries();
        if (cancelled) return;

        const { data, hasMore: more } = await getMergeBillCandidates({
          primaryInvoice: invoiceName,
          page: 1,
          linkedSecondaries: linkedSecondariesRef.current,
        });

        if (cancelled) return;
        setCandidates(data);
        setHasMore(more);
        setPage(1);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('bill_merge.merge_failed'));
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, invoiceName]);

  useEffect(() => {
    if (!open) return;
    if (skipSearchFetchRef.current) {
      skipSearchFetchRef.current = false;
      return;
    }

    void fetchCandidates(1, false);
  }, [debouncedSearch, fetchCandidates, open]);

  const handleLoadMore = () => {
    if (initialLoading || searchLoading || loadingMore || !hasMore) return;
    void fetchCandidates(page + 1, true);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await mergeBills(invoiceName, selected);
      showToast.success(t('bill_merge.merge_success', { invoice: invoiceName }));
      await onConfirm(selected);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bill_merge.merge_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderListContent = () => {
    if (initialLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner hideMessage  message={t('common.loading')} />
        </div>
      );
    }

    if (loadError) {
      return <p className="py-4 text-sm text-destructive">{loadError}</p>;
    }

    if (candidates.length === 0 && !searchLoading) {
      return <p className="py-4 text-sm text-text-tertiary">{t('bill_merge.no_candidates')}</p>;
    }

    return (
      <div className={cn('relative space-y-2', searchLoading && 'opacity-60')}>
        {searchLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Spinner hideMessage  message={t('common.loading')} />
          </div>
        )}
        {candidates.map((row) => {
          const isSelected = selected === row.name;
          const tableLabel = formatMergedTableLabel(
            row.restaurant_table,
            row.custom_merged_tables
          );

          return (
            <button
              key={row.name}
              type="button"
              disabled={isSubmitting}
              onClick={() => setSelected(row.name)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary-tint'
                  : 'border-border hover:border-border'
              )}
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{row.name}</p>
                <p className="text-xs text-text-tertiary">
                  {row.customer_name || row.customer}
                  {tableLabel ? ` • Table ${tableLabel}` : ''}
                </p>
              </div>
              <span className="ms-3 shrink-0 text-sm font-semibold text-foreground tabular-nums">
                {formatCurrency(row.rounded_total ?? row.grand_total)}
              </span>
            </button>
          );
        })}

        {hasMore && (
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleLoadMore}
              disabled={isSubmitting || loadingMore}
            >
              {loadingMore ? t('common.loading') : t('bill_merge.load_more')}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="large"
        onClose={() => handleOpenChange(false)}
        className="flex max-h-[85vh] flex-col overflow-hidden"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('bill_merge.merge_bill')}</DialogTitle>
          <DialogDescription>
            {t('bill_merge.select_secondary', { invoice: invoiceName })}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('header.search_placeholder_orders')}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex-1 min-h-[320px] max-h-[50vh] overflow-y-auto px-6 py-3">
          {renderListContent()}
        </div>

        {error && <p className="shrink-0 px-6 pb-2 text-sm text-destructive">{error}</p>}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !selected || initialLoading}
          >
            {isSubmitting ? t('common.loading') : t('bill_merge.merge_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillMergeDialog;
