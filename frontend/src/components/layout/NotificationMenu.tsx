import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Bell, BellOff, CheckCheck, ExternalLink } from 'lucide-react';
import { call } from '@ury/core';
import { t, getActiveLanguage } from '../../i18n';

/**
 * The header's notification bell and its dropdown.
 *
 * This used to be a full-height slide-over rendered inside the sticky header.
 * The header has `backdrop-blur`, and a `backdrop-filter` makes an element
 * the containing block for its `position: fixed` descendants — so the
 * "full-screen" panel was clipped to the 70px header and never opened
 * properly. A dropdown anchored to the bell (like the user menu beside it)
 * needs no fixed positioning at all.
 */

interface NotificationRow {
  name: string;
  subject?: string;
  email_content?: string;
  creation: string;
  read: number;
  document_type?: string;
  document_name?: string;
}

const POLL_MS = 60_000;
const NOTIFICATION_API = 'frappe.desk.doctype.notification_log.notification_log';

/** Notification bodies are HTML written for email; show them as text. */
function plainText(html?: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function relativeTime(timestamp: string): string {
  const then = new Date(timestamp.replace(' ', 'T')).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(getActiveLanguage(), { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

function documentLink(row: NotificationRow, desk: boolean): string | null {
  // The linked document opens in Desk; without Desk access the row is just read.
  if (!desk || !row.document_type || !row.document_name) return null;
  const slug = row.document_type.toLowerCase().replace(/ /g, '-');
  return `/app/${slug}/${encodeURIComponent(row.document_name)}`;
}

export const NotificationMenu: React.FC = () => {
  const { access } = useAccess();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = rows.filter((r) => !r.read).length;

  const load = useCallback(async () => {
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Notification Log',
        fields: ['name', 'subject', 'email_content', 'creation', 'read', 'document_type', 'document_name'],
        order_by: 'creation desc',
        limit_page_length: 20,
      });
      setRows((res?.message || res || []) as NotificationRow[]);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Fetched on mount and kept fresh, so the dot is right without a reload.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((value) => !value);
    if (!open) load();
  };

  // Read state is saved on the server — marking only in the browser came
  // back unread on the next page load.
  const markAllRead = async () => {
    setRows((prev) => prev.map((r) => ({ ...r, read: 1 })));
    try {
      await call(`${NOTIFICATION_API}.mark_all_as_read`, {});
    } catch (err) {
      console.error('Failed to mark notifications read', err);
      load();
    }
  };

  const openRow = async (row: NotificationRow) => {
    if (!row.read) {
      setRows((prev) => prev.map((r) => (r.name === row.name ? { ...r, read: 1 } : r)));
      call(`${NOTIFICATION_API}.mark_as_read`, { docname: row.name }).catch(() => {});
    }
    const link = documentLink(row, access.desk);
    if (link) window.open(link, '_blank', 'noopener');
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        className={`relative p-2 rounded-xl transition-colors ${
          open ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
        aria-label={t('notifications.open')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold leading-[18px] text-white text-center ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute end-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">{t('notifications.title')}</h2>
              {unread > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold bg-primary/10 text-primary rounded-full">
                  {t('notifications.unread_count', { count: unread })}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('notifications.mark_all_read')}
              </button>
            )}
          </div>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain divide-y divide-gray-100">
            {!loaded ? (
              <div className="p-8 text-center text-sm text-gray-400">{t('common.loading')}</div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-500">
                <BellOff className="w-8 h-8 text-gray-300" />
                {t('notifications.empty')}
              </div>
            ) : (
              rows.map((row) => {
                const body = plainText(row.email_content);
                const title = plainText(row.subject) || t('notifications.fallback_title');
                const link = documentLink(row, access.desk);
                return (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => openRow(row)}
                    className={`w-full text-start flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
                      row.read ? '' : 'bg-primary/5'
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.read ? 'bg-transparent' : 'bg-primary'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-5 ${row.read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                        {title}
                      </span>
                      {body && body !== title && (
                        <span className="mt-0.5 block text-xs text-gray-500 line-clamp-2">{body}</span>
                      )}
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                        {relativeTime(row.creation)}
                        {link && <ExternalLink className="w-3 h-3" />}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationMenu;
