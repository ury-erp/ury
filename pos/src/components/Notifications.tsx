import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { call, getSessionUser } from '@ury/core';
import { useRootStore } from '../store/root-store';
import { getRealtimeSocket } from '../lib/realtime';

interface Notification {
  name: string;
  for_user: string;
  subject: string;
  email_content?: string;
  creation: string;
  read: number;
  document_type?: string;
  document_name?: string;
}

// Notification subjects/content are native rich text, never trusted markup.
function readableText(value: string | undefined): string {
  const doc = new DOMParser().parseFromString(value || '', 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  return doc.body.textContent || '';
}

function recordLink(notification: Notification): string | null {
  const { document_type: type, document_name: name } = notification;
  if (!type || !/^[A-Za-z][A-Za-z0-9 _-]*$/.test(type) || !name?.trim()) return null;
  return `/app/${type.toLowerCase().replace(/ /g, '-')}/${encodeURIComponent(name)}`;
}

function getRelativeTime(creationDate: string): string {
  const date = new Date(creationDate.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  const days = Math.floor(minutes / 1440);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

interface Props {
  title?: string;
  onOpenCheck?: (kot: string, isCurrentSession: () => boolean) => Promise<boolean>;
}

export default function Notifications(props: Props) {
  const { user } = useRootStore();
  const name = user?.name;
  // A keyed lifetime prevents even one render of the previous user's rows.
  if (!name || name === 'Guest') return null;
  return <UserNotifications key={name} user={name} {...props} />;
}

function UserNotifications({ user, title = 'Recent Notifications', onOpenCheck }: Props & { user: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const active = useRef(false);
  const readLocally = useRef(new Set<string>());
  const refreshRef = useRef<() => void>(() => {});
  const isCurrentSession = () => active.current && getSessionUser() === user;

  useEffect(() => {
    active.current = true;
    let requestId = 0;
    let controller: AbortController | undefined;
    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | undefined;

    function clearOldSession() {
      setNotifications([]);
      controller?.abort();
      socket?.off('notification', refresh);
      socket?.off('connect', reconnect);
      socket?.off('disconnect', disconnect);
      socket?.off('connect_error', disconnect);
    }

    async function refresh() {
      if (!isCurrentSession()) { clearOldSession(); return; }
      const id = ++requestId;
      controller?.abort();
      controller = new AbortController();
      setRefreshing(true);
      try {
        // Same native, permission-filtered list as Dashboard; explicit recipient
        // filtering also prevents Administrator's broader permission from leaking rows.
        const params = new URLSearchParams({
          doctype: 'Notification Log', filters: JSON.stringify({ for_user: user }),
          fields: JSON.stringify(['name', 'for_user', 'subject', 'email_content', 'creation', 'read', 'document_type', 'document_name']),
          order_by: 'creation desc', limit_page_length: '10',
        });
        const response = await fetch(`/api/method/frappe.client.get_list?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Notifications unavailable');
        const data = await response.json();
        if (!Array.isArray(data.message)) throw new Error('Invalid notification list');
        if (!isCurrentSession()) { if (active.current) clearOldSession(); return; }
        if (id !== requestId) return;
        setNotifications(data.message.filter((item: Notification) => item.for_user === user)
          .map((item: Notification) => readLocally.current.has(item.name) ? { ...item, read: 1 } : item));
        setFailed(false);
      } catch {
        if (isCurrentSession() && id === requestId) setFailed(true);
      } finally {
        if (isCurrentSession() && id === requestId) { setLoading(false); setRefreshing(false); }
      }
    }
    const reconnect = () => { setDisconnected(false); void refresh(); };
    const disconnect = () => setDisconnected(true);
    refreshRef.current = () => void refresh();
    void refresh();
    // Native Frappe notification events use the existing shared socket.
    // Polling is the same 30s fallback already used by BillRequestStrip.
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    getRealtimeSocket().then(s => {
      if (!isCurrentSession()) return;
      socket = s;
      s.on('notification', refresh);
      s.on('connect', reconnect);
      s.on('disconnect', disconnect);
      s.on('connect_error', disconnect);
    }).catch(() => { if (isCurrentSession()) setDisconnected(true); });
    return () => {
      active.current = false;
      ++requestId;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      socket?.off('notification', refresh);
      socket?.off('connect', reconnect);
      socket?.off('disconnect', disconnect);
      socket?.off('connect_error', disconnect);
    };
  }, [user]);

  async function markRead(notification: Notification) {
    if (!isCurrentSession()) return;
    setBusy(notification.name); setMessage('');
    try {
      await call.post('frappe.desk.doctype.notification_log.notification_log.mark_as_read', { docname: notification.name });
      if (!isCurrentSession()) return;
      readLocally.current.add(notification.name);
      setNotifications(rows => rows.map(row => row.name === notification.name ? { ...row, read: 1 } : row));
    } catch {
      if (isCurrentSession()) setMessage('Could not mark notification read');
    } finally { if (isCurrentSession()) setBusy(null); }
  }

  async function openCheck(notification: Notification) {
    if (!isCurrentSession() || !onOpenCheck || !notification.document_name) return;
    setBusy(notification.name); setMessage('');
    try {
      const opened = await onOpenCheck(notification.document_name, isCurrentSession);
      if (!isCurrentSession()) return;
      if (opened) { if (!Number(notification.read)) await markRead(notification); }
      else setMessage('Check unavailable; use the native record link in Desk.');
    } catch {
      if (isCurrentSession()) setMessage('Check unavailable; use the native record link in Desk.');
    } finally { if (isCurrentSession()) setBusy(null); }
  }

  return (
    <section aria-label={title} className="flex max-h-48 min-w-0 flex-col rounded-lg border border-gray-200 bg-white p-3 xl:max-h-full">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-blue-600" />{title}</h2>
        <button className="min-h-11 px-2 text-sm text-blue-700 underline" onClick={() => refreshRef.current()}>Refresh</button>
      </div>
      <div role="status" className="text-xs text-gray-600">
        {loading ? 'Loading notifications…' : failed ? notifications.length ? 'Notifications may be out of date; refresh failed.' : 'Notifications unavailable.' : refreshing ? 'Refreshing notifications…' : null}
        {disconnected && <p>Realtime disconnected; checking every 30 seconds.</p>}
        {message && <p>{message}</p>}
      </div>
      <div className="min-h-0 overflow-y-auto">
        {!loading && !failed && notifications.length === 0 && <p className="text-sm text-gray-600">No recent notifications.</p>}
        <ul className="divide-y divide-gray-100">
          {notifications.map(notification => {
            const href = recordLink(notification);
            const unread = !Number(notification.read);
            return <li key={notification.name} className="min-w-0 py-2 text-xs">
              <p className={`break-words ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{readableText(notification.subject)}</p>
              {notification.email_content && <p className="break-words text-gray-600">{readableText(notification.email_content)}</p>}
              <div className="mt-1 flex flex-wrap gap-x-2 text-gray-500">
                <span>{unread ? 'Unread' : 'Read'}</span>
                <time dateTime={notification.creation.replace(' ', 'T')} title={notification.creation}>{getRelativeTime(notification.creation)}</time>
              </div>
              <div className="flex flex-wrap items-center gap-x-3">
                {href ? <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={href}
                  onClick={() => { if (unread) void markRead(notification); }}>Open record</a> : <span>Record link unavailable</span>}
                {href && onOpenCheck && notification.document_type === 'URY KOT' &&
                  <button className="min-h-11 text-blue-700 underline" disabled={busy !== null} onClick={() => void openCheck(notification)}>Open check</button>}
                {unread && <button className="min-h-11 text-blue-700 underline" disabled={busy !== null} onClick={() => void markRead(notification)}>Mark read</button>}
              </div>
            </li>;
          })}
        </ul>
      </div>
    </section>
  );
}
