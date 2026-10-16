/**
 * Per-tab selection storage (active company / branch).
 *
 * sessionStorage is per tab, so switching company in one tab never changes
 * what another open tab shows or reopens with on refresh. localStorage is
 * only the default a brand-new tab starts from (the last selection made
 * anywhere). Both accessors swallow errors: private mode / quota failures
 * keep the selection in memory only.
 */
export function readTabScoped(key: string): string {
  try {
    const tabValue = sessionStorage.getItem(key);
    if (tabValue) return tabValue;
  } catch {
    // fall through to the shared default
  }
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function writeTabScoped(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // in-memory only for this tab
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // new tabs just won't inherit it
  }
}
