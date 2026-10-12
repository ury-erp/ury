import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, Loader2, ReceiptText, ConciergeBell } from 'lucide-react';
import { showToast } from '@ury/ui';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';
import { useServiceRequestChannel, type ServiceRequestPayload } from '../lib/realtime';
import {
  acknowledgeServiceRequests,
  getOpenServiceRequests,
  resolveServiceRequest,
  type ServiceRequest,
} from '../lib/service-request-api';

/**
 * ServiceRequestBell: the cashier's end of the self-ordering "Request Bill"
 * button.
 *
 * A customer tapping "Request Bill" on their table tablet/QR page creates a
 * URY Service Request; before this component existed that row went nowhere
 * and the customer simply waited. Here it arrives on the POS as a toast, a
 * beep and a badge that stays lit until someone marks it done — a toast alone
 * would be missed by a cashier who is, by definition, looking at a different
 * screen when a table calls.
 */

/** Short beep, so a call is heard across a noisy floor and not only seen. */
function playAlertTone() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close().catch(() => undefined);
  } catch {
    // Autoplay policy or no audio device: the visual alert still stands.
  }
}

function requestLabel(request: Pick<ServiceRequest, 'request_type' | 'table'>): string {
  const key =
    request.request_type === 'Assistance'
      ? 'service_requests.assistance_at'
      : 'service_requests.bill_at';
  return t(key, { table: request.table });
}

function formatRequestedAt(value?: string): string {
  if (!value) return '';
  // Frappe hands back "YYYY-MM-DD HH:MM:SS" in site time; Safari refuses that
  // form, so normalise before parsing and fall back to the raw clock part.
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value.slice(11, 16);
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const ServiceRequestBell: React.FC = () => {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch || '';

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadRequests = useCallback(async () => {
    if (!branch) {
      setRequests([]);
      return;
    }
    setRequests(await getOpenServiceRequests());
  }, [branch]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // A socket that dropped while the terminal was backgrounded takes its
  // missed events with it, so re-sync whenever the tab comes back into view.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadRequests();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadRequests]);

  const handleIncoming = useCallback((payload: ServiceRequestPayload) => {
    if (payload.status === 'Resolved') {
      setRequests((prev) => prev.filter((r) => r.name !== payload.name));
      return;
    }

    setRequests((prev) => {
      const without = prev.filter((r) => r.name !== payload.name);
      return [...without, payload];
    });

    // Another terminal acknowledging a request is a state update, not a new
    // call: merge it quietly instead of beeping at this cashier again.
    if (payload.status !== 'Open') {
      return;
    }

    // Both a first request and a customer asking again deserve the alert;
    // only the wording differs.
    showToast.warning(
      payload.repeat
        ? `${requestLabel(payload)} — ${t('service_requests.repeat_hint')}`
        : requestLabel(payload),
    );
    playAlertTone();
  }, []);

  useServiceRequestChannel(branch, handleIncoming);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Opening the list is the cashier reading the alert, and that is what the
  // customer's own screen is waiting on: until a request is acknowledged the
  // table is told only "requested", with no sign anyone has noticed.
  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;

    const unseen = requests.filter((r) => r.status === 'Open').map((r) => r.name);
    if (unseen.length === 0) return;

    setRequests((prev) =>
      prev.map((r) => (unseen.includes(r.name) ? { ...r, status: 'Acknowledged' } : r)),
    );
    acknowledgeServiceRequests(unseen).catch((error) => {
      console.error('Failed to acknowledge service requests:', error);
      // The customer was not actually told: put the badge back to "new" so
      // the cashier does not believe the table has been answered.
      setRequests((prev) =>
        prev.map((r) => (unseen.includes(r.name) ? { ...r, status: 'Open' } : r)),
      );
    });
  };

  const handleResolve = async (name: string) => {
    setResolving(name);
    try {
      await resolveServiceRequest(name, 'Resolved');
      setRequests((prev) => prev.filter((r) => r.name !== name));
    } catch (error) {
      showToast.error(t('service_requests.resolve_failed'));
    } finally {
      setResolving(null);
    }
  };

  const count = requests.length;
  // Red and pulsing only while something is genuinely unread; once every
  // table has been answered the bell settles down but keeps its count.
  const unseen = requests.some((r) => r.status === 'Open');

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleToggle}
        title={t('service_requests.title')}
        aria-label={
          count
            ? `${t('service_requests.title')} (${count})`
            : t('service_requests.title')
        }
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-fast press ${
          unseen
            ? 'bg-[#f05b42] text-white hover:bg-[#d94f38]'
            : count
              ? 'bg-white/10 text-white hover:bg-white/15'
              : 'text-white/65 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Bell className={`w-4 h-4 ${unseen ? 'animate-pulse' : ''}`} />
        {count > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[#ffca4b] text-[#241914] text-[0.65rem] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900">
              {t('service_requests.title')}
            </p>
          </div>

          {count === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              {t('service_requests.empty')}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {requests.map((request) => (
                <li key={request.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff0d9] text-[#b4611a]">
                    {request.request_type === 'Assistance' ? (
                      <ConciergeBell className="w-4 h-4" />
                    ) : (
                      <ReceiptText className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {requestLabel(request)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatRequestedAt(request.requested_at)}
                      {request.status === 'Acknowledged' && (
                        <span className="ms-2 text-green-700">
                          {t('service_requests.customer_notified')}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResolve(request.name)}
                    disabled={resolving === request.name}
                    title={t('service_requests.mark_done')}
                    aria-label={t('service_requests.mark_done')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    {resolving === request.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ServiceRequestBell;
