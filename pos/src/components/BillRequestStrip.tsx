import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '@ury/core';
import { Button } from '@ury/ui';
import { getSplitGroup, mapSplitGroupInvoiceToPOSInvoice, searchPosInvoice, type POSInvoice } from '../lib/invoice-api';
import { t } from '../i18n';

interface BillRequest {
  name: string;
  table: string | null;
  invoice: string | null;
  status: string;
  requested_at: string;
}

function isOpen(invoice: POSInvoice & { docstatus?: number }) {
  return (invoice.status === 'Draft' || invoice.status === 'Unbilled') &&
    (invoice.docstatus === undefined || invoice.docstatus === 0);
}

export default function BillRequestStrip({ orders, selectOrder }: {
  orders: POSInvoice[];
  selectOrder: (invoice: POSInvoice) => Promise<void>;
}) {
  const [requests, setRequests] = useState<BillRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState<POSInvoice[]>([]);
  const active = useRef(false);
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setLoading(true);
    setUnavailable(false);
    try {
      const response = await call.get<{ message: BillRequest[] }>('frappe.client.get_list', {
        doctype: 'URY Service Request',
        filters: { request_type: 'Bill', status: ['!=', 'Resolved'] },
        fields: ['name', 'table', 'invoice', 'status', 'requested_at'],
        limit_page_length: 0,
      });
      if (active.current && id === refreshId.current) setRequests(response.message);
    } catch {
      if (active.current && id === refreshId.current) setUnavailable(true);
    } finally {
      if (active.current && id === refreshId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => { active.current = false; clearInterval(interval); };
  }, [refresh]);

  async function pickUp(request: BillRequest) {
    setLookupLoading(true);
    setMessage('');
    setChoices([]);
    try {
      if (request.invoice) {
        const loaded = orders.find(inv => inv.name === request.invoice && isOpen(inv));
        if (loaded) { await selectOrder(loaded); return; }
        const result = await searchPosInvoice(request.invoice, 'Outstanding');
        if (!active.current) return;
        const exact = (result.data as POSInvoice[]).find(inv => inv.name === request.invoice && isOpen(inv));
        if (exact) { await selectOrder(exact); return; }
        const group = await getSplitGroup(request.invoice).catch((error: { httpStatus?: number }) => {
          if (error.httpStatus === 404) return { invoices: [], current: request.invoice!, group: null };
          throw error;
        });
        if (!active.current) return;
        const unpaid = group.invoices.filter(isOpen).map(mapSplitGroupInvoiceToPOSInvoice);
        if (unpaid.length) setChoices(unpaid);
        else setMessage(t('bill_requests.not_open', { invoice: request.invoice }));
      } else if (request.table) {
        // The visible queue is paginated; native permission-filtered reads find all table checks.
        const response = await call.get<{ message: POSInvoice[] }>('frappe.client.get_list', {
          doctype: 'POS Invoice',
          filters: { restaurant_table: request.table, status: 'Draft', docstatus: 0 },
          fields: ['name', 'restaurant_table', 'status', 'docstatus', 'invoice_printed',
            'grand_total', 'rounded_total', 'net_total', 'total_taxes_and_charges',
            'customer', 'mobile_number', 'cashier', 'waiter', 'order_type', 'posting_date', 'posting_time'],
          limit_page_length: 0,
        });
        if (!active.current) return;
        const checks = response.message.filter(inv => inv.restaurant_table === request.table && isOpen(inv));
        if (checks.length === 1) await selectOrder(checks[0]);
        else if (checks.length) setChoices(checks);
        else setMessage(t('bill_requests.no_open_checks', { table: request.table }));
      } else {
        setMessage(t('bill_requests.no_link'));
      }
    } catch {
      if (active.current) setMessage(t('bill_requests.lookup_unavailable'));
    } finally {
      if (active.current) setLookupLoading(false);
    }
  }

  return (
    <section aria-label={t('bill_requests.title')} className="mb-4 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold" aria-live="polite">
          {loading ? t('bill_requests.loading') : unavailable ? t('bill_requests.unavailable')
            : t('bill_requests.waiting', { count: requests.length })}
        </h2>
        <Button variant="outline" className="min-h-11" disabled={loading} onClick={() => void refresh()}>
          {t('bill_requests.refresh')}
        </Button>
      </div>
      {!loading && !unavailable && (requests.length === 0
        ? <p className="mt-2 text-sm text-gray-500">{t('bill_requests.empty')}</p>
        : <ul className="mt-2 space-y-2">
          {requests.map(request => (
            <li key={request.name} className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={lookupLoading}
                onClick={() => void pickUp(request)}>
                {request.table || request.name} {request.invoice && `· ${request.invoice}`} · {request.requested_at} · {request.status}
              </Button>
              <a className="inline-flex min-h-11 items-center text-sm text-blue-600 underline"
                href={`/app/ury-service-request/${encodeURIComponent(request.name)}`}>
                {t('bill_requests.open_record')}
              </a>
            </li>
          ))}
        </ul>)}
      <div aria-live="polite">
        {lookupLoading && <p>{t('bill_requests.lookup_loading')}</p>}
        {message && <p className="mt-2 text-sm">{message}</p>}
        {choices.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
          <p className="w-full text-sm">{t('bill_requests.choose_check')}</p>
          {choices.map(invoice => <Button key={invoice.name} variant="outline" className="min-h-11"
            onClick={async () => {
              setChoices([]);
              try { await selectOrder(invoice); }
              catch { if (active.current) setMessage(t('bill_requests.lookup_unavailable')); }
            }}>{invoice.name}</Button>)}
        </div>}
      </div>
    </section>
  );
}
