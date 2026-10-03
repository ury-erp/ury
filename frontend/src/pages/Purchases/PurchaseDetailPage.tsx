import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Ban, CheckCircle2, ExternalLink, Pencil, Printer, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Badge, Button, Card, ErrorState, Input, Spinner, Textarea, showToast } from '@ury/ui';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { purchasePrintUrl, purchaseService, type PurchaseDetail, type PurchaseSetup } from '../../services/purchases';
import { formatServerDate, invoiceStatusLabel, invoiceStatusTone } from '../../lib/statusLabels';
import { useBranchContext } from '../../context/BranchContext';
import { t } from '../../i18n';
import { useAccess } from '../../hooks/useAccess';

/**
 * One supplier bill: what came in, where it went, what was paid and what is
 * still owed — with the actions its state allows.
 */

const qtyText = (qty: number) => (Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, ''));

type Action = '' | 'submit' | 'delete' | 'cancel' | 'pay';

export const PurchaseDetailPage: React.FC = () => {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const { activeBranchId } = useBranchContext();
  const [doc, setDoc] = useState<PurchaseDetail | null>(null);
  const [setup, setSetup] = useState<PurchaseSetup | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Action>('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [payMode, setPayMode] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const locale = getIntlLocale();
  const { access } = useAccess();

  const load = useCallback(async () => {
    setError('');
    try {
      setDoc(await purchaseService.detail(name));
    } catch (err) {
      setError(parseFrappeError(err, t('dash.purchases.load_failed')));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    purchaseService.setup(activeBranchId).then(setSetup).catch(() => setSetup(null));
  }, [activeBranchId]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/purchases'));

  const openPay = () => {
    if (!doc) return;
    const cash = setup?.modes_of_payment.find((m) => m.type === 'Cash') || setup?.modes_of_payment[0];
    setPayMode(cash?.name || '');
    setPayAmount(String(doc.totals.outstanding_amount));
    setPayRef('');
    setDialog('pay');
  };

  const run = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      if (dialog === 'submit') {
        await purchaseService.submit(doc.name);
        showToast.success(t('dash.purchases.posted'));
      } else if (dialog === 'cancel') {
        await purchaseService.cancel(doc.name, reason.trim() || undefined);
        showToast.success(t('dash.purchases.cancelled'));
      } else if (dialog === 'delete') {
        await purchaseService.remove(doc.name);
        showToast.success(t('dash.purchases.deleted'));
        navigate('/purchases', { replace: true });
        return;
      } else if (dialog === 'pay') {
        await purchaseService.pay(doc.name, payMode, Number(payAmount), payRef.trim() || undefined);
        showToast.success(t('dash.purchases.payment_recorded'));
      }
      setDialog('');
      setReason('');
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.purchases.action_failed')));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.purchases.load_failed')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  if (!doc) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const tot = doc.totals;
  const perms = doc.permissions;
  const cancelled = doc.docstatus === 2;
  const deskUrl = `/app/purchase-invoice/${encodeURIComponent(doc.name)}`;
  const warehouseLabel = (w?: string | null) => (w && setup?.warehouses.find((x) => x.name === w)?.label) || w || '—';
  const payAmountNum = Number(payAmount);
  const payInvalid = !payMode || !(payAmountNum > 0) || payAmountNum > tot.outstanding_amount + 0.0001;

  const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) =>
    value ? (
      <div className="flex items-start justify-between gap-4 py-2 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-900 text-end">{value}</span>
      </div>
    ) : null;

  const TotalRow = ({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-600'}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone || ''}`}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={back} className="mt-0.5 h-9 w-9 p-0" aria-label={t('common.back')}>
            <ArrowRight className="w-5 h-5 ltr:rotate-180" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{doc.name}</h1>
              <Badge variant={invoiceStatusTone(doc.status)}>{invoiceStatusLabel(doc.status)}</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {doc.supplier_name || doc.supplier} · {formatServerDate(doc.posting_date, locale)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} aria-label={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {access.desk && (
            <a href={deskUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-4 h-4" /> {t('dash.invoice.open_in_system')}
              </Button>
            </a>
          )}
          {perms.print && (
            <a href={purchasePrintUrl(doc.name)} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Printer className="w-4 h-4" /> {t('dash.invoice.print')}
              </Button>
            </a>
          )}
          {perms.delete && (
            <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => setDialog('delete')}>
              <Trash2 className="w-4 h-4" /> {t('dash.purchases.delete')}
            </Button>
          )}
          {perms.write && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/purchases/${encodeURIComponent(doc.name)}/edit`)}>
              <Pencil className="w-4 h-4" /> {t('dash.purchases.edit')}
            </Button>
          )}
          {perms.cancel && (
            <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => setDialog('cancel')}>
              <Ban className="w-4 h-4" /> {t('dash.purchases.cancel_purchase')}
            </Button>
          )}
          {perms.pay && setup && setup.modes_of_payment.length > 0 && (
            <Button size="sm" className="gap-1.5 bg-primary text-white" onClick={openPay}>
              <Wallet className="w-4 h-4" /> {t('dash.purchases.record_payment')}
            </Button>
          )}
          {perms.submit && (
            <Button size="sm" className="gap-1.5 bg-primary text-white" onClick={() => setDialog('submit')}>
              <CheckCircle2 className="w-4 h-4" /> {t('dash.purchases.post')}
            </Button>
          )}
        </div>
      </div>

      {doc.docstatus === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('dash.purchases.draft_notice')}</div>
      )}
      {cancelled && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t('dash.purchases.cancelled_notice')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">{t('dash.purchases.items')}</h2>
              <span className="text-xs text-gray-500">{t('dash.invoice.items_count', { count: doc.items.length })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 text-start">{t('fields.item')}</th>
                    <th className="px-3 py-2.5 text-center">{t('fields.qty')}</th>
                    <th className="px-3 py-2.5 text-end">{t('dash.purchases.unit_price')}</th>
                    <th className="px-5 py-2.5 text-end">{t('fields.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {doc.items.map((row, i) => (
                    <tr key={`${row.item_code}-${i}`}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{row.item_name}</p>
                        {row.uom !== row.stock_uom && (
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            {t('dash.purchases.conversion', { factor: row.conversion_factor, uom: row.uom, stock_uom: row.stock_uom })}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap">
                        {qtyText(row.qty)} <span className="text-xs text-gray-500">{row.uom}</span>
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums text-gray-600 whitespace-nowrap">{formatCurrency(row.rate)}</td>
                      <td className="px-5 py-3 text-end tabular-nums font-semibold whitespace-nowrap">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
              <div className="ms-auto max-w-sm">
                <TotalRow label={t('dash.invoice.subtotal')} value={tot.total} />
                {tot.discount_amount > 0 && <TotalRow label={t('dash.invoice.discount')} value={-tot.discount_amount} tone="text-red-600" />}
                {doc.taxes.map((tax, i) => (
                  <TotalRow key={i} label={tax.description} value={tax.amount} />
                ))}
                {Math.abs(tot.rounding_adjustment) > 0.0001 && <TotalRow label={t('dash.invoice.rounding')} value={tot.rounding_adjustment} />}
                <div className="my-2 border-t border-gray-200" />
                <TotalRow label={t('dash.invoice.total')} value={tot.rounded_total || tot.grand_total} strong />
                {doc.docstatus === 1 && (
                  <>
                    <TotalRow label={t('dash.purchases.paid')} value={tot.paid_amount} tone="text-green-700" />
                    <TotalRow
                      label={t('dash.purchases.outstanding')}
                      value={tot.outstanding_amount}
                      strong
                      tone={tot.outstanding_amount > 0 ? 'text-amber-600' : 'text-green-700'}
                    />
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Wallet className="w-4 h-4 text-primary" /> {t('dash.invoice.payments')}
            </h2>
            {doc.payments.length === 0 ? (
              <p className="text-sm text-gray-500">
                {doc.docstatus === 0
                  ? doc.is_paid
                    ? t('dash.purchases.will_be_paid', { mode: doc.mode_of_payment || '' })
                    : t('dash.purchases.on_credit')
                  : t('dash.purchases.no_payments')}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {doc.payments.map((p, i) => (
                  <li key={p.name || i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">{p.mode_of_payment || '—'}</p>
                      <p className="text-[11px] text-gray-500">
                        {[formatServerDate(p.posting_date, locale), p.reference_no, p.name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums text-green-700">{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border border-gray-200 px-5 py-3 divide-y divide-gray-100">
            <InfoRow label={t('dash.purchases.supplier')} value={doc.supplier_name || doc.supplier} />
            <InfoRow label={t('dash.purchases.bill_no')} value={doc.bill_no} />
            <InfoRow label={t('dash.purchases.bill_date')} value={doc.bill_date ? formatServerDate(doc.bill_date, locale) : null} />
            <InfoRow label={t('dash.purchases.purchase_date')} value={formatServerDate(doc.posting_date, locale)} />
            <InfoRow
              label={t('dash.purchases.due_date')}
              value={doc.due_date && !doc.is_paid ? formatServerDate(doc.due_date, locale) : null}
            />
            <InfoRow label={t('dash.purchases.receive_into')} value={warehouseLabel(doc.warehouse)} />
            <InfoRow label={t('dash.purchases.created_by')} value={doc.created_by} />
          </Card>
          {doc.remarks && (
            <Card className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 text-xs font-bold">{t('dash.purchases.notes')}</p>
              {doc.remarks}
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={dialog === 'submit'}
        title={t('dash.purchases.confirm_post_title')}
        description={t('dash.purchases.confirm_post_body', { warehouse: warehouseLabel(doc.warehouse) })}
        confirmLabel={t('dash.purchases.confirm_post')}
        busy={busy}
        onConfirm={() => void run()}
        onClose={() => setDialog('')}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        tone="danger"
        title={t('dash.purchases.confirm_delete_title')}
        description={t('dash.purchases.confirm_delete_body')}
        confirmLabel={t('dash.purchases.delete')}
        busy={busy}
        onConfirm={() => void run()}
        onClose={() => setDialog('')}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        tone="danger"
        title={t('dash.purchases.confirm_cancel_title')}
        description={t('dash.purchases.confirm_cancel_body')}
        confirmLabel={t('dash.purchases.cancel_purchase')}
        busy={busy}
        onConfirm={() => void run()}
        onClose={() => setDialog('')}
      >
        <label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="cancel-reason">
          {t('dash.purchases.cancel_reason')}
        </label>
        <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'pay'}
        title={t('dash.purchases.record_payment')}
        description={t('dash.purchases.outstanding_now', { amount: formatCurrency(tot.outstanding_amount) })}
        confirmLabel={t('dash.purchases.pay')}
        busy={busy}
        confirmDisabled={payInvalid}
        onConfirm={() => void run()}
        onClose={() => setDialog('')}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="pay-mode">{t('dash.purchases.paid_from')}</label>
            <select
              id="pay-mode"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
              className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="">{t('dash.purchases.choose_mode')}</option>
              {setup?.modes_of_payment.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="pay-amount">{t('fields.amount')}</label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              min="0"
              max={tot.outstanding_amount}
              step="any"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="tabular-nums"
            />
            {payAmountNum > tot.outstanding_amount + 0.0001 && (
              <p className="mt-1 text-xs text-red-600">{t('dash.purchases.err_overpay')}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="pay-ref">{t('dash.purchases.reference')}</label>
            <Input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={t('dash.purchases.reference_hint')} />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
};

export default PurchaseDetailPage;
