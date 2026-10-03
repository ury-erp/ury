import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from '@ury/core';
import Dashboard from '../src/pages/Dashboard';

const session = vi.hoisted(() => ({ user: 'cashier@example.com' as string | null }));
vi.mock('../src/store/root-store', () => ({ useRootStore: (selector?: any) => {
  const state = { user: session.user ? { name: session.user, roles: ['URY Cashier'] } : null };
  return selector ? selector(state) : state;
} }));
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ posProfile: { branch: 'Branch A' } }) }));
const realtime = vi.hoisted(() => ({ handlers: new Map<string, Set<() => void>>(), on: vi.fn(), off: vi.fn() }));
vi.mock('../src/lib/realtime', () => ({ getRealtimeSocket: async () => realtime }));

let container: HTMLDivElement;
let root: Root;
let rows: any[];
let fetchAlerts: ReturnType<typeof vi.fn>;
const alert = (changes = {}) => ({
  name: 'ALERT-1', for_user: 'cashier@example.com', subject: '<b>Food ready: Table 1 (KOT-1)</b>',
  email_content: '<p>Collect soup</p><script>bad()</script>', creation: '2026-10-03 10:00:00',
  read: 0, document_type: 'URY KOT', document_name: 'KOT-1', ...changes,
});
async function render() { await act(async () => root.render(<Dashboard />)); }
function panel() { return container.querySelector('[aria-label="Recent Notifications"]') || container; }
async function emit(event: string) { await act(async () => {
  for (const handler of realtime.handlers.get(event) || []) handler();
}); }
async function click(label: string) {
  const button = Array.from(panel().querySelectorAll('button')).find(b => b.textContent === label);
  expect(button, `missing ${label} control`).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  session.user = 'cashier@example.com';
  document.cookie = 'user_id=cashier%40example.com';
  realtime.handlers.clear();
  realtime.on.mockImplementation((event, fn) => {
    if (!realtime.handlers.has(event)) realtime.handlers.set(event, new Set());
    realtime.handlers.get(event)!.add(fn);
  });
  realtime.off.mockImplementation((event, fn) => realtime.handlers.get(event)?.delete(fn));
  rows = [alert()];
  fetchAlerts = vi.fn(async () => ({ ok: true, json: async () => ({ message: rows }) }));
  vi.stubGlobal('fetch', fetchAlerts);
  vi.spyOn(call, 'get').mockResolvedValue({ message: [] });
  vi.spyOn(call, 'post').mockResolvedValue({ message: null });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('notification ages use the floor-plan site clock', () => {
  function siteClock(browserNow: string, serverNow: string, clock?: () => Promise<{ message: string }>) {
    vi.stubEnv('TZ', 'Europe/Berlin');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(browserNow));
    vi.mocked(call.get).mockImplementation(async <T,>(method: string): Promise<T> => {
      if (method === 'ury.ury.api.ury_server_time.get_server_time') {
        return (clock ? await clock() : { message: serverNow }) as T;
      }
      return { message: [] } as T;
    });
  }

  it.each([
    { label: 'Berlin summer time', browser: '2026-10-03T11:06:08+02:00', server: '2026-10-03T12:06:08.123456', creation: '2026-10-03 12:00:00.123456' },
    { label: 'Berlin winter time', browser: '2026-12-03T10:06:08+01:00', server: '2026-12-03T12:06:08', creation: '2026-12-03 12:00:00' },
    { label: 'a skewed browser clock', browser: '2026-10-03T06:06:08+02:00', server: '2026-10-03T12:06:08', creation: '2026-10-03 12:00:00' },
    { label: 'site midnight', browser: '2026-10-02T23:04:08+02:00', server: '2026-10-03T00:04:08', creation: '2026-10-02 23:58:00' },
  ])('shows six minutes for an Africa/Kampala notification with $label', async ({ browser, server, creation }) => {
    siteClock(browser, server);
    rows = [alert({ creation })];
    await render();
    expect(panel().querySelector('time')?.textContent).toBe('6 min ago');
  });

  it('advances ages on the existing poll without trusting a changed browser clock', async () => {
    siteClock('2026-10-03T11:06:08+02:00', '2026-10-03T12:06:08');
    rows = [alert({ creation: '2026-10-03 12:00:00' })];
    await render();
    expect(panel().querySelector('time')?.textContent).toBe('6 min ago');
    // Browser time jumps but server time advances by the actual elapsed minute.
    siteClock('2026-10-03T15:07:08+02:00', '2026-10-03T12:07:08');
    await emit('notification');
    expect(panel().querySelector('time')?.textContent).toBe('7 min ago');
    siteClock('2026-10-03T15:07:08+02:00', '', async () => { throw new Error('Clock unavailable'); });
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(panel().querySelector('time')?.textContent).toBe('8 min ago');
  });

  it.each(['rejected', 'invalid', 'pending'])('keeps notifications usable and does not invent an age when the site clock is %s', async (failure) => {
    siteClock('2026-10-03T11:06:08+02:00', 'invalid', async () => {
      if (failure === 'rejected') throw new Error('Offline');
      if (failure === 'pending') return new Promise(() => {});
      return { message: 'invalid' };
    });
    rows = [alert({ creation: '2026-10-03 12:00:00' })];
    await render();
    expect(panel().textContent).toContain('Food ready: Table 1 (KOT-1)');
    expect(panel().querySelector('time')?.textContent).toBe('Time unavailable');
    await click('Mark read');
    expect(panel().textContent).not.toContain('Unread');
  });

  it('discards a late clock sample from an earlier refresh', async () => {
    let finish!: (value: { message: string }) => void;
    siteClock('2026-10-03T11:06:08+02:00', '', () => new Promise(resolve => { finish = resolve; }));
    rows = [alert({ creation: '2026-10-03 12:00:00' })];
    await render();
    siteClock('2026-10-03T11:06:08+02:00', '2026-10-03T12:06:08');
    await emit('notification');
    expect(panel().querySelector('time')?.textContent).toBe('6 min ago');
    await act(async () => finish({ message: '2026-10-03T15:06:08' }));
    expect(panel().querySelector('time')?.textContent).toBe('6 min ago');
  });
});

describe('shared native operational notifications (Dashboard consumer)', () => {
  it('explicitly scopes the permission-filtered list to the current recipient, including Administrator', async () => {
    session.user = 'Administrator'; document.cookie = 'user_id=Administrator';
    rows = [alert({ for_user: 'Administrator' }), alert({ name: 'MANAGER', for_user: 'manager@example.com', subject: 'Private manager alert' })];
    await render();
    const url = new URL(fetchAlerts.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/api/method/frappe.client.get_list');
    expect(JSON.parse(url.searchParams.get('filters')!)).toEqual({ for_user: 'Administrator' });
    expect(JSON.parse(url.searchParams.get('fields')!)).toEqual(expect.arrayContaining(['read', 'document_type', 'document_name', 'for_user']));
    expect(url.searchParams.get('limit_page_length')).toBe('10');
    expect(panel().textContent).not.toContain('Private manager alert');
  });
  it('shows readable text, time and read/unread without injecting notification HTML', async () => {
    rows.push(alert({ name: 'SHIFT', subject: 'Shift opened', document_type: 'POS Opening Entry', document_name: 'OPEN-1', read: 1 }));
    await render();
    expect(panel().textContent).toContain('Food ready: Table 1 (KOT-1)');
    expect(panel().textContent).not.toContain('<b>');
    expect(panel().textContent).toContain('Collect soup');
    expect(panel().textContent).not.toContain('bad()');
    expect(panel().textContent).toContain('Unread'); expect(panel().textContent).toContain('Read');
    expect(panel().querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-03T10:00:00');
    expect(panel().querySelector('script')).toBeNull();
  });
  it('offers only validated native document links and safely handles a missing link', async () => {
    rows = [alert({ document_name: 'KOT/1?#' }), alert({ name: 'BAD', subject: 'Unsafe', document_type: 'javascript:alert(1)', document_name: 'x' }),
      alert({ name: 'MISSING', subject: 'Missing record', document_name: null })];
    await render();
    const links = Array.from(panel().querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links).toContain('/app/ury-kot/KOT%2F1%3F%23');
    expect(links.some(link => link?.includes('javascript'))).toBe(false);
    expect(panel().textContent).toContain('Record link unavailable');
  });
  it('opens native Desk records in a separate tab so navigation cannot cancel the native read write', async () => {
    await render();
    const link = panel().querySelector<HTMLAnchorElement>('a')!;
    expect(link?.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    await act(async () => link.click());
    expect(call.post).toHaveBeenCalledWith('frappe.desk.doctype.notification_log.notification_log.mark_as_read', { docname: 'ALERT-1' });
  });
  it('marks just the chosen notification read through the native method and keeps other alerts unread', async () => {
    rows.push(alert({ name: 'SHIFT', subject: 'Shift opened' }));
    await render(); await click('Mark read');
    expect(call.post).toHaveBeenCalledWith('frappe.desk.doctype.notification_log.notification_log.mark_as_read', { docname: 'ALERT-1' });
    expect(panel().querySelectorAll('button')).toHaveLength(2); // Refresh plus the other unread item
    expect(panel().textContent).toContain('Read'); expect(panel().textContent).toContain('Unread');
  });
  it('keeps unread and reports a failed native read-state write', async () => {
    vi.mocked(call.post).mockRejectedValue(new Error('Denied'));
    await render(); await click('Mark read');
    expect(panel().textContent).toContain('Unread'); expect(panel().textContent).toContain('Could not mark notification read');
  });
  it('preserves a native read write against an earlier in-flight refresh but trusts later native read state', async () => {
    await render();
    let finish!: (value: any) => void;
    fetchAlerts.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit('notification'); await click('Mark read');
    await act(async () => finish({ ok: true, json: async () => ({ message: [alert()] }) }));
    expect(panel().textContent).not.toContain('Unread');
    // A subsequent Desk change back to unread must not be hidden by local state.
    await emit('notification'); expect(panel().textContent).toContain('Unread');
  });
  it('distinguishes initial loading, empty and failed requests', async () => {
    let finish!: (value: any) => void;
    fetchAlerts.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); expect(panel().textContent).toContain('Loading notifications');
    await act(async () => finish({ ok: true, json: async () => ({ message: [] }) }));
    expect(panel().textContent).toContain('No recent notifications');
    fetchAlerts.mockRejectedValue(new Error('Offline')); await click('Refresh');
    expect(panel().textContent).toContain('Notifications unavailable');
    expect(panel().textContent).not.toContain('No recent notifications');
  });
  it('retains stale rows and focus during refresh, then recovers after reconnect', async () => {
    await render();
    const link = panel().querySelector<HTMLAnchorElement>('a')!;
    expect(link).not.toBeNull(); link.focus();
    fetchAlerts.mockRejectedValue(new Error('Offline')); await emit('notification');
    expect(panel().textContent).toContain('Food ready'); expect(panel().textContent).toContain('may be out of date');
    expect(document.activeElement).toBe(link);
    rows.push(alert({ name: 'NEW', subject: 'Shift closed' }));
    fetchAlerts.mockImplementation(async () => ({ ok: true, json: async () => ({ message: rows }) }));
    await emit('connect'); expect(panel().textContent).toContain('Shift closed');
    expect(panel().textContent).not.toContain('may be out of date');
    expect(document.activeElement).toBe(link);
  });
  it('polls at 30 seconds when events are missed and removes listeners/timer on unmount', async () => {
    vi.useFakeTimers(); await render();
    const calls = fetchAlerts.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(29999)); expect(fetchAlerts).toHaveBeenCalledTimes(calls);
    rows.push(alert({ name: 'NEW', subject: 'Posting alert' }));
    await act(async () => vi.advanceTimersByTimeAsync(1)); expect(panel().textContent).toContain('Posting alert');
    await act(async () => root.unmount());
    expect([...realtime.handlers.values()].every(handlers => handlers.size === 0)).toBe(true);
    const after = fetchAlerts.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60000)); expect(fetchAlerts).toHaveBeenCalledTimes(after);
    root = createRoot(container);
  });
  it('clears old-user rows immediately on switch/logout and rejects late responses', async () => {
    await render();
    let finish!: (value: any) => void;
    fetchAlerts.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit('notification');
    session.user = 'cashier1@example.com'; document.cookie = 'user_id=cashier1%40example.com';
    rows = [alert({ name: 'NEW', for_user: session.user, subject: 'Cashier1 only' })];
    await render(); expect(panel().textContent).not.toContain('Food ready'); expect(panel().textContent).toContain('Cashier1 only');
    await act(async () => finish({ ok: true, json: async () => ({ message: [alert({ subject: 'OLD RESPONSE' })] }) }));
    expect(panel().textContent).not.toContain('OLD RESPONSE');
    session.user = null; document.cookie = 'user_id=Guest'; await render();
    expect(panel().textContent).not.toContain('Cashier1 only');
    expect([...realtime.handlers.values()].every(handlers => handlers.size === 0)).toBe(true);
  });
  it('rejects a late response after the session cookie changed before the auth store updates', async () => {
    let finish!: (value: any) => void;
    fetchAlerts.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); document.cookie = 'user_id=cashier1%40example.com';
    await act(async () => finish({ ok: true, json: async () => ({ message: [alert()] }) }));
    expect(panel().textContent).not.toContain('Food ready');
  });
});
