import { useEffect, useState } from 'react';
import { UserPickerDialog } from '@ury/ui';
import { db } from '@ury/core';
import { t } from '../i18n';

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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [candidates, setCandidates] = useState<CaptainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDebouncedSearch('');
    setCandidates([]);
    setLoadError(null);
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
        setCandidates((rows as CaptainOption[]).filter((row) => row.name !== currentCaptain));
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

  return (
    <UserPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      sourceValue={currentCaptain}
      options={candidates.map((c) => ({
        name: c.name,
        label: c.full_name || c.name,
      }))}
      loading={loading}
      loadError={loadError}
      search={search}
      onSearchChange={setSearch}
      onConfirm={onConfirm}
      labels={{
        title: t('tables.transfer_captain'),
        description: t('tables.select_new_captain'),
        currentLabel: t('tables.current_captain'),
        searchPlaceholder: t('tables.search_captain_placeholder'),
        empty: t('tables.no_captains_found'),
        cancel: t('common.cancel'),
        confirm: t('tables.transfer_confirm'),
        loading: t('common.loading'),
        errorFallback: t('tables.transfer_failed'),
      }}
    />
  );
};

export default CaptainTransferDialog;
