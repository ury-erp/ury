import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { cn, formatCurrency } from '../lib/utils';
import { t } from '../i18n';
import { showToast } from './ui/toast';
import { Spinner } from './ui/spinner';
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
  const [loading, setLoading] = useState(false);
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
      const setBusy = append ? setLoadingMore : setLoading;
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
    setLoading(true);
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
          setLoading(false);
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
    if (loading || loadingMore || !hasMore) return;
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={() => handleOpenChange(false)}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('bill_merge.merge_bill')}</DialogTitle>
          <DialogDescription>
            {t('bill_merge.select_secondary', { invoice: invoiceName })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('header.search_placeholder_orders')}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            disabled={isSubmitting || loading}
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner hideMessage />
            </div>
          ) : loadError ? (
            <p className="py-4 text-sm text-red-600">{loadError}</p>
          ) : candidates.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">{t('bill_merge.no_candidates')}</p>
          ) : (
            <div className="space-y-2">
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
                        ? 'border-primary bg-primary-50/40'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-500">
                        {row.customer_name || row.customer}
                        {tableLabel ? ` • Table ${tableLabel}` : ''}
                      </p>
                    </div>
                    <span className="ms-3 shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
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
          )}
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !selected || loading}>
            {isSubmitting ? t('common.loading') : t('bill_merge.merge_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillMergeDialog;
