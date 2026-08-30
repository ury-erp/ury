import { useEffect, useState } from 'react';
import { Card, CardContent, Spinner } from '@ury/ui';
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

        <Card className="bg-card border border-border">
          <CardContent className="p-6">
            {error ? (
              <div className="text-center py-8">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">No open POS sessions</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-sm">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-sm">Period Start Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-sm">POS Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.name} className="border-b border-border hover:bg-muted transition-colors">
                        <td className="px-4 py-3 text-foreground text-sm">{entry.user}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{formatDate(entry.period_start_date)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{entry.pos_profile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
