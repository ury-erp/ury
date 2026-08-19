// The POS Dashboard route is reachable by every POS user (see Footer nav),
// but the insight / fast-moving / baseline endpoints are manager-gated
// server-side (require_manager). For a non-manager the correct behaviour is
// for those cards to be absent, not to show a red "Failed to load" error —
// the dashboard must degrade quietly, never look broken.
export function isPermissionError(err: any): boolean {
  const status = err?.httpStatus ?? err?.response?.status;
  if (status === 403) return true;
  const text = `${err?.exception ?? ''} ${err?.exc_type ?? ''} ${err?.message ?? ''}`;
  return /PermissionError/i.test(text);
}
