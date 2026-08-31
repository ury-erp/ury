import { useEffect, useState } from 'react';
import { Card, CardContent, Spinner, DataTable, type DataTableColumn } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { getOpenPosOpeningEntries, type OpenPosOpeningEntry } from '../lib/pos-closing-api';
import { t } from '../i18n';

export default function OpenEntries() {
  const { posProfile } = usePOSStore();
  const [entries, setEntries] = useState<OpenPosOpeningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntries() {
      if (!posProfile?.name) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getOpenPosOpeningEntries(posProfile.name);
        setEntries(data);
      } catch (err) {
        console.error('Error fetching open entries:', err);
        setError('Failed to load open sessions');
      } finally {
        setLoading(false);
      }
    }

    fetchEntries();
  }, [posProfile?.name]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-muted">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-6">Open Sessions</h1>

        <Card className="bg-card border border-border overflow-hidden">
          <CardContent className="p-0">
            {error ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-hair text-destructive text-sm">
                <span>{error}</span>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center px-4 py-2 text-text-tertiary text-[12px] bg-card border-b border-hair">
                <span>No open POS sessions</span>
              </div>
            ) : (
              <>
                {(() => {
                  const entryColumns: DataTableColumn<OpenPosOpeningEntry>[] = [
                    { key: 'user', header: 'User' },
                    { key: 'period_start_date', header: 'Period Start Date', render: (entry) => formatDate(entry.period_start_date) },
                    { key: 'pos_profile', header: 'POS Profile' },
                  ];
                  return <DataTable columns={entryColumns} rows={entries} emptyMessage="No open POS sessions" />;
                })()}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
