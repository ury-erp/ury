import { useState, useEffect, useRef, useMemo } from 'react';
import { Printer, RefreshCw, AlertCircle } from 'lucide-react';
import { call } from '@ury/core';
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@ury/ui';

type PrinterStatus = 'excellent' | 'fair' | 'critical';

interface PrinterHealth {
  device_name: string;
  ip_address: string;
  signal_status: string;
  status: PrinterStatus;
}

interface PrinterHealthResponse {
  success: boolean;
  printers: PrinterHealth[];
  count: number;
  status: string;
  message: string;
  timestamp: string;
}

type LoadState = 'idle' | 'loading' | 'error' | 'success';

const STATUS_VARIANTS: Record<
  PrinterStatus,
  { badge: 'success' | 'warning' | 'danger'; dot: string; label: string }
> = {
  excellent: { badge: 'success', dot: 'bg-green-500', label: 'Excellent' },
  fair: { badge: 'warning', dot: 'bg-orange-500', label: 'Fair' },
  critical: { badge: 'danger', dot: 'bg-red-500', label: 'Critical' },
};

function formatTime(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  try {
    return new Date(isoTimestamp).toLocaleString();
  } catch {
    return isoTimestamp;
  }
}

function PrinterWatch() {
  const [isOpen, setIsOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterHealth[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [staleError, setStaleError] = useState<string | null>(null);

  const latestSeq = useRef(0);
  const loadStateRef = useRef<LoadState>('idle');
  const lastUpdatedRef = useRef<string | null>(null);

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    lastUpdatedRef.current = lastUpdated;
  }, [lastUpdated]);

  const overallStatus = useMemo<PrinterStatus | null>(() => {
    if (!printers.length) return null;
    if (printers.some((p) => p.status === 'critical')) return 'critical';
    if (printers.some((p) => p.status === 'fair')) return 'fair';
    return 'excellent';
  }, [printers]);

  const fetchHealth = async () => {
    const seq = ++latestSeq.current;

    try {
      const response = await call.get<{ message: PrinterHealthResponse }>(
        'ury_printer_watch.api.printer_health.get_printer_health'
      );

      if (seq < latestSeq.current) return;

      const data = response.message;
      setPrinters(data.printers || []);
      setLastUpdated(data.timestamp);
      setLoadState('success');
      setStaleError(null);
    } catch (err) {
      if (seq < latestSeq.current) return;

      if (loadStateRef.current === 'idle' || loadStateRef.current === 'loading') {
        setLoadState('error');
      } else {
        const timeLabel = lastUpdatedRef.current
          ? formatTime(lastUpdatedRef.current)
          : 'earlier';
        setStaleError(`Unable to refresh. Displaying last status from ${timeLabel}.`);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setStaleError(null);
    setLoadState('loading');
    loadStateRef.current = 'loading';
    fetchHealth();

    const intervalId = setInterval(fetchHealth, 30000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleRetry = () => {
    setStaleError(null);
    setLoadState('loading');
    loadStateRef.current = 'loading';
    fetchHealth();
  };

  const dotClass = overallStatus
    ? STATUS_VARIANTS[overallStatus].dot
    : 'bg-gray-400';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[1040] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Printer Health"
      >
        <Printer className="h-6 w-6" />
        <span
          className={`absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${dotClass}`}
          aria-hidden="true"
        />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          variant="large"
          className="flex max-h-[80vh] flex-col bg-white p-0"
          onClose={() => setIsOpen(false)}
        >
          <DialogHeader className="border-b border-gray-200 p-4">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Printer Health
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Live printer status and connectivity
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {staleError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{staleError}</span>
              </div>
            )}

            {loadState === 'loading' && (
              <div className="py-8 text-center text-gray-600">
                Loading printer status...
              </div>
            )}

            {loadState === 'error' && (
              <div className="py-8 text-center">
                <p className="mb-4 text-gray-700">Unable to fetch printer health.</p>
                <Button onClick={handleRetry} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            )}

            {loadState === 'success' && printers.length === 0 && (
              <div className="py-8 text-center text-gray-600">No printers found.</div>
            )}

            {loadState === 'success' && printers.length > 0 && (
              <ul className="space-y-3">
                {printers.map((printer, index) => {
                  const status = STATUS_VARIANTS[printer.status] || STATUS_VARIANTS.critical;
                  return (
                    <li
                      key={`${printer.device_name}-${printer.ip_address}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{printer.device_name}</p>
                        <p className="text-sm text-gray-500">{printer.ip_address}</p>
                      </div>
                      <Badge variant={status.badge}>
                        <span className="mr-1">●</span>
                        {status.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200 p-4 text-right text-sm text-gray-500">
            {lastUpdated ? `Last updated: ${formatTime(lastUpdated)}` : 'Last updated: --'}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PrinterWatch;
