import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * What report/dashboard the user currently has open, so the chat widget can
 * default its scope to "this report" (PLAN.md item 4) instead of asking the
 * user to restate it. `null` means "no specific report" (e.g. plain
 * dashboard view) — the widget falls back to a generic dashboard context.
 */
export interface ActiveReportContextValue {
  reportSlug: string;
  label: string;
  filters?: Record<string, unknown>;
}

interface ActiveReportContextShape {
  activeReport: ActiveReportContextValue | null;
  setActiveReport: (ctx: ActiveReportContextValue | null) => void;
}

const ActiveReportContext = createContext<ActiveReportContextShape | null>(null);

export function ActiveReportProvider({ children }: { children: ReactNode }) {
  const [activeReport, setActiveReportState] = useState<ActiveReportContextValue | null>(null);

  const setActiveReport = useCallback((ctx: ActiveReportContextValue | null) => {
    setActiveReportState(ctx);
  }, []);

  const value = useMemo(
    () => ({ activeReport, setActiveReport }),
    [activeReport, setActiveReport]
  );

  return <ActiveReportContext.Provider value={value}>{children}</ActiveReportContext.Provider>;
}

/**
 * Read the currently active report context. Report/dashboard pages that want
 * the chat widget to default to their scope should call the setter this hook
 * returns (via a `useEffect`) with `{ reportSlug, label, filters }` on mount,
 * and clear it (`setActiveReport(null)`) on unmount.
 */
export function useActiveReportContext() {
  const ctx = useContext(ActiveReportContext);
  if (!ctx) {
    throw new Error('useActiveReportContext must be used within an ActiveReportProvider');
  }
  return ctx;
}
