import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
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
  samples?: number;
  success?: number;
  failed?: number;
  success_rate?: number;
  summary_timestamp?: string;
  last_updated?: string;
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

interface PrinterWatchContextValue {
  isInstalled: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  printers: PrinterHealth[];
  loadState: LoadState;
  lastUpdated: string | null;
  hasIssue: boolean;
  refresh: () => void;
}

const PrinterWatchContext = createContext<PrinterWatchContextValue | null>(null);

function formatTime(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  try {
    return new Date(isoTimestamp).toLocaleString();
  } catch {
    return isoTimestamp;
  }
}

export function PrinterWatchProvider({ children }: { children: React.ReactNode }) {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState(false);
  const [printers, setPrinters] = useState<PrinterHealth[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [staleError, setStaleError] = useState<string | null>(null);

  const isCheckedRef = useRef(false);
  const latestSeq = useRef(0);
  const loadStateRef = useRef<LoadState>('idle');
  const lastUpdatedRef = useRef<string | null>(null);

  // Check app installation status once on mount
  useEffect(() => {
    if (isCheckedRef.current) return;
    isCheckedRef.current = true;

    let isMounted = true;
    const checkInstallation = async () => {
      try {
        const response = await call.get<{ message: { installed: boolean } }>(
          'ury.ury_pos.api.is_printer_watch_installed'
        );
        if (isMounted) {
          setIsInstalled(Boolean(response?.message?.installed));
        }
      } catch {
        // Fail closed: if check fails, do not initialize feature
        if (isMounted) {
          setIsInstalled(false);
        }
      }
    };

    checkInstallation();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    lastUpdatedRef.current = lastUpdated;
  }, [lastUpdated]);

  const hasIssue = useMemo(() => {
    if (!printers.length) return true;
    return printers.some((p) => p.status === 'fair' || p.status === 'critical');
  }, [printers]);

  const fetchHealth = useCallback(async () => {
    if (!isInstalled) return;
    const seq = ++latestSeq.current;

    try {
      const response = await call.get<{ message: PrinterHealthResponse }>(
        'ury_printer_watch.api.printer_health.get_printer_health'
      );

      if (seq < latestSeq.current) return;

      const data = response.message;
      setPrinters(data?.printers || []);
      setLastUpdated(data?.timestamp || (data?.printers && data?.printers[0]?.summary_timestamp) || null);
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
  }, [isInstalled]);

  useEffect(() => {
    if (!isInstalled || !isOpen) return;

    setStaleError(null);
    setLoadState('loading');
    loadStateRef.current = 'loading';
    fetchHealth();

    const intervalId = setInterval(fetchHealth, 30000);
    return () => clearInterval(intervalId);
  }, [isInstalled, isOpen, fetchHealth]);

  const handleRetry = () => {
    if (!isInstalled) return;
    setStaleError(null);
    setLoadState('loading');
    loadStateRef.current = 'loading';
    fetchHealth();
  };

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value: PrinterWatchContextValue = {
    isInstalled,
    isOpen,
    open,
    close,
    printers,
    loadState,
    lastUpdated,
    hasIssue,
    refresh: handleRetry,
  };

  return (
    <PrinterWatchContext.Provider value={value}>
      {children}
      {isInstalled && (
        <PrinterWatchDialog
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          printers={printers}
          loadState={loadState}
          lastUpdated={lastUpdated}
          staleError={staleError}
          onRetry={handleRetry}
        />
      )}
    </PrinterWatchContext.Provider>
  );
}

export function usePrinterWatch(): PrinterWatchContextValue {
  const context = useContext(PrinterWatchContext);
  if (!context) {
    throw new Error('usePrinterWatch must be used within a PrinterWatchProvider');
  }
  return context;
}

export function PrinterStatusButton() {
  const { open, hasIssue, isInstalled } = usePrinterWatch();

  if (!isInstalled) {
    return null;
  }

  const dotClass = hasIssue ? 'bg-rose-500' : 'bg-emerald-500';

  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none"
      aria-label="Printer Status"
    >
      <Printer className="h-4 w-4 text-gray-600" />
      <span>Printer Status</span>
      <span
        className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
    </button>
  );
}

interface PrinterWatchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  printers: PrinterHealth[];
  loadState: LoadState;
  lastUpdated: string | null;
  staleError: string | null;
  onRetry: () => void;
}

function PrinterWatchDialog({
  isOpen,
  onOpenChange,
  printers,
  loadState,
  lastUpdated,
  staleError,
  onRetry,
}: PrinterWatchDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        variant="large"
        className="flex max-h-[80vh] flex-col bg-white p-0"
        onClose={() => onOpenChange(false)}
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
              <Button onClick={onRetry} variant="outline" size="sm">
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
                    className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{printer.device_name}</p>
                        <p className="text-sm text-gray-500">{printer.ip_address}</p>
                      </div>
                      <Badge variant={status.badge}>
                        <span className="mr-1">●</span>
                        {status.label}
                      </Badge>
                    </div>

                    {printer.samples !== undefined && printer.samples > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 pt-2 text-xs text-gray-600">
                        <span>Success Rate: <strong className="text-gray-900">{Number(printer.success_rate ?? 0).toFixed(2)}%</strong></span>
                        <span>Samples: <strong className="text-gray-900">{printer.samples}</strong></span>
                        <span>Success: <strong className="text-emerald-700">{printer.success}</strong></span>
                        <span>Failed: <strong className="text-rose-700">{printer.failed}</strong></span>
                        {printer.summary_timestamp && (
                          <span className="text-gray-400">Time: {printer.summary_timestamp}</span>
                        )}
                      </div>
                    )}
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
  );
}

function PrinterWatch() {
  return null;
}

export default PrinterWatch;
