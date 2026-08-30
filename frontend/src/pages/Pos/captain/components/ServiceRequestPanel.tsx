import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Clock, Loader2, X } from 'lucide-react';
import { Button, cn, showToast } from '@ury/ui';
import {
  acknowledgeServiceRequest,
  listOpenServiceRequests,
  resolveServiceRequest,
  type ServiceRequest,
} from '../../lib/service-request-api';

const POLL_INTERVAL_MS = 15000;

/**
 * Live "Request Bill" / "Request Assistance" panel for the Captain shell.
 *
 * There is no realtime socket channel for URY Service Request yet (unlike
 * KOT errors — see KotAlertListener.tsx / lib/realtime.ts), so this polls
 * `list_open_service_requests` on an interval rather than subscribing to a
 * channel. A small badge/bell is always visible during floor work
 * (mounted once, inside CaptainRouteGuard, so it covers both `/order` and
 * `/order/table/:table`); tapping it expands a short list with per-row
 * Acknowledge/Resolve actions.
 */
function timeElapsed(requestedAt: string): string {
  const requested = new Date(requestedAt.replace(' ', 'T'));
  const minutes = Math.max(0, Math.round((Date.now() - requested.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  return `${minutes} min ago`;
}

interface Props {
  branch: string | null;
}

const ServiceRequestPanel: React.FC<Props> = ({ branch }) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branch) return;
    try {
      const result = await listOpenServiceRequests(branch);
      setRequests(result);
    } catch (error) {
      console.error('ServiceRequestPanel: failed to load service requests:', error);
    }
  }, [branch]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const handleAcknowledge = async (name: string) => {
    setBusyName(name);
    try {
      await acknowledgeServiceRequest(name);
      await load();
    } catch (error) {
      console.error('Failed to acknowledge service request:', error);
      showToast.error('Failed to acknowledge request');
    } finally {
      setBusyName(null);
    }
  };

  const handleResolve = async (name: string) => {
    setBusyName(name);
    try {
      await resolveServiceRequest(name);
      setRequests((current) => current.filter((request) => request.name !== name));
      showToast.success('Request resolved');
    } catch (error) {
      console.error('Failed to resolve service request:', error);
      showToast.error('Failed to resolve request');
    } finally {
      setBusyName(null);
    }
  };

  if (!branch) return null;

  const count = requests.length;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-80 max-w-[90vw] rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border p-3">
            <h2 className="text-sm font-semibold text-foreground">Service Requests</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close service requests"
              className="text-text-tertiary hover:text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <p className="p-4 text-center text-sm text-text-tertiary">No open requests</p>
            ) : (
              requests.map((request) => (
                <div
                  key={request.name}
                  className="flex items-center justify-between gap-2 border-b border-border p-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      Table {request.table} &middot; {request.request_type}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Clock className="h-3 w-3" />
                      {timeElapsed(request.requested_at)}
                      {request.status === 'Acknowledged' && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-warning">
                          Acknowledged
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {request.status === 'Open' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyName === request.name}
                        onClick={() => handleAcknowledge(request.name)}
                      >
                        Ack
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyName === request.name}
                      onClick={() => handleResolve(request.name)}
                    >
                      {busyName === request.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Toggle service requests"
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors',
          count > 0 ? 'bg-amber-500 text-white' : 'bg-white text-muted-foreground border border-border'
        )}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>
    </div>
  );
};

export default ServiceRequestPanel;
