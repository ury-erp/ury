import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button, Input } from '@ury/ui';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import { Spinner } from '@ury/ui';
import { db } from '@ury/core';

interface CaptainTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCaptain: string;
  onConfirm: (newCaptain: string) => Promise<void>;
}

interface CaptainOption {
  name: string;
  full_name?: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 20;

const CaptainTransferDialog = ({
  open,
  onOpenChange,
  currentCaptain,
  onConfirm,
}: CaptainTransferDialogProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [candidates, setCandidates] = useState<CaptainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch('');
    setDebouncedSearch('');
    setCandidates([]);
    setLoadError(null);
    setError(null);
    setIsSubmitting(false);
  }, [open, currentCaptain]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const q = debouncedSearch.trim();
    const pattern = q ? `%${q}%` : '%';

    db.getDocList('User', {
      fields: ['name', 'full_name'],
      filters: [['enabled', '=', 1]],
      orFilters: [
        ['name', 'like', pattern],
        ['full_name', 'like', pattern],
      ],
      limit: SEARCH_LIMIT,
      orderBy: { field: 'full_name', order: 'asc' },
    } as unknown as Parameters<typeof db.getDocList>[1])
      .then((rows) => {
        if (cancelled) return;
        setCandidates(
          (rows as CaptainOption[]).filter((row) => row.name !== currentCaptain)
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t('tables.transfer_failed'));
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch, currentCaptain]);

  const displayCandidates = useMemo(() => candidates, [candidates]);

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tables.transfer_failed'));
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
        className="max-h-dialog-max-h overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('tables.transfer_captain')}</DialogTitle>
          <DialogDescription>{t('tables.select_new_captain')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <label className="mb-1 block text-sm font-medium text-muted-foreground">
            {t('tables.current_captain')}
          </label>
          <Input
            type="text"
            readOnly
            value={currentCaptain}
            className="mb-4"
            variant="search"
          />

          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tables.search_captain_placeholder')}
            className="mb-3"
            disabled={isSubmitting}
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner hideMessage  message={t('common.loading')} />
            </div>
          ) : loadError ? (
            <p className="py-4 text-sm text-destructive">{loadError}</p>
          ) : displayCandidates.length === 0 ? (
            <p className="py-4 text-sm text-text-tertiary">{t('tables.no_captains_found')}</p>
          ) : (
            <div className="space-y-2">
              {displayCandidates.map((row) => {
                const isSelected = selected === row.name;
                return (
                  <Button
                    key={row.name}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setSelected(row.name)}
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'justify-start h-auto flex-col items-start px-3 py-3',
                      isSelected && 'bg-primary-50/40 border-primary'
                    )}
                  >
                    <p className="font-medium text-foreground">{row.full_name || row.name}</p>
                    <p className="text-xs text-text-tertiary">{row.name}</p>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !selected || loading}>
            {isSubmitting ? t('common.loading') : t('tables.transfer_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CaptainTransferDialog;
