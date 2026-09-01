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

type PrinterStatus = 'excellent' | 'fair' | 'critical' | 'no_data';

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
  { badge: 'success' | 'warning' | 'danger' | 'secondary'; dot: string; label: string }
> = {
  excellent: { badge: 'success', dot: 'bg-green-500', label: 'Excellent' },
  fair: { badge: 'warning', dot: 'bg-orange-500', label: 'Fair' },
  critical: { badge: 'danger', dot: 'bg-red-500', label: 'Critical' },
  no_data: { badge: 'secondary', dot: 'bg-gray-400', label: 'No Data' },
};

interface PrinterWatchContextValue {
  isInstalled: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  printers: PrinterHealth[];
  loadState: LoadState;
  isSyncing: boolean;
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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
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
    if (!printers.length) return false;
    return printers.some((p) => p.status === 'critical' || p.status === 'fair');
  }, [printers]);

  const fetchHealth = useCallback(async () => {
    if (!isInstalled) return;
    const seq = ++latestSeq.current;

    setIsSyncing(true);
    if (loadStateRef.current !== 'success') {
      setLoadState('loading');
    }

    try {
      const response = await call.get<any>(
        'ury_printer_watch.api.printer_health.get_printer_health'
      );

      if (seq < latestSeq.current) return;

      const data: PrinterHealthResponse = response?.message ?? response;
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
    } finally {
      if (seq === latestSeq.current) {
        setIsSyncing(false);
      }
    }
  }, [isInstalled]);

  // Initial one-time fetch on POS load (no recurring polling intervals)
  useEffect(() => {
    if (!isInstalled) return;
    fetchHealth();
  }, [isInstalled, fetchHealth]);

  // Trigger fresh fetch whenever the user opens the dialog
  const open = useCallback(() => {
    setIsOpen(true);
    setStaleError(null);
    fetchHealth();
  }, [fetchHealth]);

  const close = useCallback(() => setIsOpen(false), []);

  const value: PrinterWatchContextValue = {
    isInstalled,
    isOpen,
    open,
    close,
    printers,
    loadState,
    isSyncing,
    lastUpdated,
    hasIssue,
    refresh: fetchHealth,
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
          isSyncing={isSyncing}
          lastUpdated={lastUpdated}
          staleError={staleError}
          onSync={fetchHealth}
          onRetry={fetchHealth}
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
  const { open, printers, isInstalled } = usePrinterWatch();

  if (!isInstalled) {
    return null;
  }

  // Calculate status pointer color based on printer health
  let dotClass = 'bg-emerald-500';
  if (printers.length > 0) {
    const hasCritical = printers.some((p) => p.status === 'critical');
    const hasWarning = printers.some((p) => p.status === 'fair' || p.status === 'no_data');
    if (hasCritical) {
      dotClass = 'bg-rose-500';
    } else if (hasWarning) {
      dotClass = 'bg-amber-500';
    } else {
      dotClass = 'bg-emerald-500';
    }
  }

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

function formatLogTime(timestamp?: string): string {
  if (!timestamp) return '--:--:--';
  const match = timestamp.match(/(\d{2}:\d{2}:\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      const parts = d.toTimeString().split(' ');
      if (parts[0]) return parts[0];
    }
  } catch {}
  return timestamp;
}

interface PrinterWatchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  printers: PrinterHealth[];
  loadState: LoadState;
  isSyncing: boolean;
  lastUpdated: string | null;
  staleError: string | null;
  onSync: () => void;
  onRetry: () => void;
}

function PrinterWatchDialog({
  isOpen,
  onOpenChange,
  printers,
  loadState,
  isSyncing,
  lastUpdated,
  staleError,
  onSync,
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
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle className="text-xl font-semibold text-gray-900">
                Printer Health
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500 mt-0.5">
                {lastUpdated ? `Last synced: ${formatTime(lastUpdated)}` : 'Live printer status and connectivity'}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={isSyncing || loadState === 'loading'}
              className="h-8 gap-1.5 px-3 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {staleError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{staleError}</span>
            </div>
          )}

          {loadState === 'loading' && printers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Loading printer status...</p>
              <p className="text-xs text-gray-400 mt-1">Connecting to printer watch service</p>
            </div>
          )}

          {loadState === 'error' && printers.length === 0 && (
            <div className="py-8 text-center">
              <p className="mb-4 text-gray-700">Unable to fetch printer health.</p>
              <Button onClick={onRetry} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}

          {((loadState === 'success' || printers.length > 0) && printers.length === 0) && (
            <div className="py-8 text-center text-gray-600">No printers found.</div>
          )}

          {printers.length > 0 && (
            <ul className="space-y-3">
              {printers.map((printer, index) => {
                const status = STATUS_VARIANTS[printer.status] || STATUS_VARIANTS.critical;
                const successCount = printer.success ?? 0;
                const failedCount = printer.failed ?? 0;
                const timeStr = formatLogTime(printer.summary_timestamp || printer.last_updated);

                return (
                  <li
                    key={`${printer.device_name}-${printer.ip_address || index}-${index}`}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3.5 transition-colors"
                  >
                    {/* Top Row: Printer Name (left) & Health Status (right) */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 text-base leading-tight">
                        {printer.device_name}
                      </h3>
                      <Badge variant={status.badge} className="px-2.5 py-0.5 text-xs font-medium">
                        <span className="mr-1">●</span>
                        {status.label}
                      </Badge>
                    </div>

                    {/* Bottom Row: Success / Failed (left) & Timestamp HH:MM:SS (right) */}
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <div className="flex items-center gap-4">
                        <span>
                          Success: <strong className="text-gray-900 font-semibold">{successCount}</strong>
                        </span>
                        <span>
                          Failed: <strong className={failedCount > 0 ? "text-rose-600 font-semibold" : "text-gray-900 font-semibold"}>{failedCount}</strong>
                        </span>
                      </div>
                      <span className="text-gray-500 font-mono text-xs">
                        {timeStr}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrinterWatch() {
  return null;
}

export default PrinterWatch;
