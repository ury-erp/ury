import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  messageToPlainText,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { db, formatCurrency } from '@ury/core';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import ClosingPaymentTable from './ClosingPaymentTable';
import ChecklistGateDialog from './ChecklistGateDialog';
import { getChecklist } from '../../../lib/pos/checklist-api';
import {
  getOpenPosOpeningEntries,
  getSubCashierPosInvoices,
  getMainCashierPosInvoices,
  createSubPosClosing,
  submitSubPosClosing,
  createPosClosingEntry,
  submitPosClosingEntry,
  type OpenPosOpeningEntry,
  type POSClosingInvoice,
  type POSClosingPayment,
  type ClosingPaymentSummary,
} from '../lib/pos-closing-api';

interface POSClosingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Extension point for the CLOSING checklist gate (task E3). Called after
   * the cashier clears the Closing checklist (post successful POS close
   * submission), right before the dialog itself closes.
   */
  onClosingSubmitted?: () => void | Promise<void>;
}

interface OpeningBalanceDetail {
  mode_of_payment: string;
  opening_amount: number;
}

interface OpeningEntryDoc {
  name: string;
  balance_details?: OpeningBalanceDetail[];
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Formats a Date as 'YYYY-MM-DD HH:mm:ss', matching the backend's expected format. */
function formatDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Generic frappe-js-sdk fallbacks that carry no actionable detail. */
const GENERIC_ERROR_MESSAGES = new Set([
  'there was an error while updating the document.',
  'there was an error while creating the document.',
  'request failed with status code 500',
  'there was an error.',
  'internal server error',
]);

function readErrorProp(source: unknown, key: string): unknown {
  if (source && typeof source === 'object' && key in source) {
    return (source as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Returns the substring after the first colon, or null when there is none. */
function detailAfterColon(text: string): string | null {
  const idx = text.indexOf(':');
  if (idx === -1) return null;
  return text.slice(idx + 1).trim() || null;
}

function combineWithFallback(fallback: string, detail: string): string {
  if (fallback && !detail.includes(fallback)) return `${fallback}: ${detail}`;
  return detail;
}

/**
 * Extracts a human-readable message from a Frappe API error. Frappe answers
 * errors in several shapes depending on where the exception was raised:
 * `_server_messages` (frappe.throw), `exception` / `exc` (uncaught exceptions
 * such as NegativeStockError, returned on HTTP 500 without _server_messages),
 * or a plain `message`. Each shape is checked on the error object directly
 * and on its axios `response.data` envelope. When a specific detail is found
 * it is prefixed with the fallback (e.g. "Failed to close POS: ..."), unless
 * the detail already contains it.
 */
function extractServerErrorMessage(error: unknown, fallback: string): string {
  const response = readErrorProp(error, 'response');
  const responseData =
    response && typeof response === 'object' ? readErrorProp(response, 'data') : undefined;
  const sources = [error, responseData];

  // a. _server_messages: JSON array of JSON-encoded { message: ... } entries.
  for (const source of sources) {
    const raw = readErrorProp(source, '_server_messages');
    if (typeof raw !== 'string') continue;
    try {
      const messages = JSON.parse(raw);
      const first = JSON.parse(messages[0]);
      if (first?.message) {
        return combineWithFallback(fallback, messageToPlainText(first.message as string));
      }
    } catch {
      // fall through to other extraction strategies
    }
  }

  // b. exception: "module.ClassName: human readable detail".
  for (const source of sources) {
    const raw = readErrorProp(source, 'exception');
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const detail = detailAfterColon(raw);
    if (detail) return combineWithFallback(fallback, messageToPlainText(detail));
  }

  // c. exc: JSON array or newline-separated traceback; use its last line.
  for (const source of sources) {
    const raw = readErrorProp(source, 'exc');
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let lastLine = raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        lastLine = String(parsed[parsed.length - 1]);
      }
    } catch {
      const lines = raw.trim().split('\n');
      lastLine = lines[lines.length - 1];
    }
    const detail = detailAfterColon(lastLine);
    if (detail) return combineWithFallback(fallback, messageToPlainText(detail));
  }

  // d. message: usable only when it isn't a generic SDK fallback string.
  for (const source of sources) {
    const raw = readErrorProp(source, 'message');
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (GENERIC_ERROR_MESSAGES.has(raw.trim().toLowerCase())) continue;
    return combineWithFallback(fallback, messageToPlainText(raw));
  }

  return fallback;
}

interface AggregatedTotals {
  grandTotal: number;
  netTotal: number;
  totalQty: number;
}

/**
 * Aggregates raw POS Invoice dicts into closing totals and per-mode expected
 * amounts. When `paymentsByMode` is provided (ERPNext v16 main-cashier path),
 * those payments are already pre-aggregated server-side by mode_of_payment
 * with change_amount already deducted, so they are summed verbatim. When it
 * is absent (sub-cashier path / legacy invoice-list shape), expected amounts
 * are accumulated per-invoice, subtracting the invoice's change_amount when
 * the payment account matches account_for_change_amount (mirroring
 * sub_pos_closing.js refresh_payments / set_form_data).
 */
function aggregateInvoices(invoices: POSClosingInvoice[], paymentsByMode?: POSClosingPayment[]): {
  totals: AggregatedTotals;
  expectedByMode: Record<string, number>;
} {
  const totals: AggregatedTotals = { grandTotal: 0, netTotal: 0, totalQty: 0 };
  const expectedByMode: Record<string, number> = {};

  invoices.forEach((invoice) => {
    totals.grandTotal += Number(invoice.grand_total) || 0;
    totals.netTotal += Number(invoice.net_total) || 0;
    totals.totalQty += Number(invoice.total_qty) || 0;

    if (!paymentsByMode) {
      (invoice.payments || []).forEach((payment) => {
        let amount = Number(payment.amount) || 0;
        if (payment.account === invoice.account_for_change_amount) {
          amount -= Number(invoice.change_amount) || 0;
        }
        expectedByMode[payment.mode_of_payment] =
          (expectedByMode[payment.mode_of_payment] || 0) + amount;
      });
    }
  });

  if (paymentsByMode) {
    paymentsByMode.forEach((payment) => {
      expectedByMode[payment.mode_of_payment] =
        (expectedByMode[payment.mode_of_payment] || 0) + (Number(payment.amount) || 0);
    });
  }

  return { totals, expectedByMode };
}

function buildRows(
  openingBalances: OpeningBalanceDetail[],
  expectedByMode: Record<string, number>
): ClosingPaymentSummary[] {
  const rows = new Map<string, ClosingPaymentSummary>();

  openingBalances.forEach((detail) => {
    const opening = Number(detail.opening_amount) || 0;
    rows.set(detail.mode_of_payment, {
      mode_of_payment: detail.mode_of_payment,
      opening_amount: opening,
      // Matches ERPNext Desk / Sub POS Closing: expected_amount =
      // opening_amount + sales_amount.
      expected_amount: opening,
      closing_amount: 0,
      difference: 0,
    });
  });

  Object.entries(expectedByMode).forEach(([mode, sales]) => {
    const existing = rows.get(mode);
    if (existing) {
      existing.expected_amount += sales;
    } else {
      rows.set(mode, {
        mode_of_payment: mode,
        opening_amount: 0,
        expected_amount: sales,
        closing_amount: 0,
        difference: 0,
      });
    }
  });

  return Array.from(rows.values());
}

const POSClosingDialog = ({ open, onOpenChange, onClosingSubmitted }: POSClosingDialogProps) => {
  const { posProfile } = usePOSStore();
  const { user } = useRootStore();

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingEntry, setOpeningEntry] = useState<OpenPosOpeningEntry | null>(null);
  const [isSubCashier, setIsSubCashier] = useState(false);
  const [periodEndDate, setPeriodEndDate] = useState<Date>(new Date());
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [totals, setTotals] = useState<AggregatedTotals>({ grandTotal: 0, netTotal: 0, totalQty: 0 });
  const [rows, setRows] = useState<ClosingPaymentSummary[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set once the close submission (Sub POS Closing / POS Closing Entry) has
  // succeeded. Per plan decision D8, the Closing checklist gate hangs off
  // this success -- not off validatePOSClose() -- so it renders in place of
  // the closing form until the cashier clears it.
  const [showClosingChecklist, setShowClosingChecklist] = useState(false);
  // True when the Closing checklist gate fired BEFORE the close submission:
  // completing the checklist must resume the submission (the grillax
  // validations reject closing doc creation while role-based goals are
  // pending, so the checklist is a hard precondition in this mode).
  const [preCloseGate, setPreCloseGate] = useState(false);

  const loadClosingDetails = useCallback(async () => {
    if (!posProfile || !user) return;

    setIsLoading(true);
    setLoadError(null);
    setSubmitError(null);

    try {
      const openEntries = await getOpenPosOpeningEntries(posProfile.name);
      const ownEntry = openEntries.find((entry) => entry.user === user.name) ?? null;

      if (!ownEntry) {
        setOpeningEntry(null);
        setLoadError(t('pos_closing.no_open_entry'));
        return;
      }
      setOpeningEntry(ownEntry);

      // Multi-cashier mode + current user is not the POS Profile's main
      // cashier (custom_main_cashier on applicable_for_users, surfaced here
      // as posProfile.owner) => this session closes via Sub POS Closing.
      const subCashier = posProfile.multiple_cashier === 1 && posProfile.owner !== user.name;
      setIsSubCashier(subCashier);

      const now = new Date();
      setPeriodEndDate(now);
      const end = formatDateTime(now);

      const [invoiceResult, openingDoc] = await Promise.all([
        subCashier
          ? getSubCashierPosInvoices(ownEntry.period_start_date, end, posProfile.name, user.name)
          : getMainCashierPosInvoices(ownEntry.period_start_date, end, posProfile.name, user.name),
        db.getDoc<OpeningEntryDoc>('POS Opening Entry', ownEntry.name),
      ]);

      const invoices = Array.isArray(invoiceResult) ? invoiceResult : (invoiceResult?.invoices || []);
      const payments = Array.isArray(invoiceResult) ? undefined : invoiceResult?.payments;
      setInvoiceCount(invoices.length);
      const { totals: aggregatedTotals, expectedByMode } = aggregateInvoices(invoices, payments);
      setTotals(aggregatedTotals);
      setRows(buildRows(openingDoc?.balance_details ?? [], expectedByMode));
    } catch (error) {
      console.error('Failed to load POS closing details:', error);
      setLoadError(extractServerErrorMessage(error, t('pos_closing.load_failed')));
    } finally {
      setIsLoading(false);
    }
  }, [posProfile, user]);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    loadClosingDetails();
  }, [open, loadClosingDetails]);

  const handleRowChange = (modeOfPayment: string, closingAmount: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.mode_of_payment === modeOfPayment ? { ...row, closing_amount: closingAmount } : row
      )
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) {
      setPreCloseGate(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!openingEntry || !posProfile || !user) return;

    // Gate on the Closing checklist BEFORE creating the closing doc: the
    // role-based Dependent Checklist validations (grillax port) throw on
    // POS Closing Entry creation while pending goals have no Quality
    // Review, so collecting the checklist first is the only UI path that
    // lets the cashier actually clear the block.
    if (posProfile.name) {
      try {
        const { logStatus } = await getChecklist(posProfile.name, 'Closing');
        if (logStatus !== 'Complete') {
          setPreCloseGate(true);
          setShowClosingChecklist(true);
          return;
        }
      } catch (error) {
        console.error('Failed to check closing checklist status:', error);
        setPreCloseGate(true);
        setShowClosingChecklist(true);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const paymentReconciliation = rows.map((row) => ({
      mode_of_payment: row.mode_of_payment,
      opening_amount: row.opening_amount,
      expected_amount: row.expected_amount,
      closing_amount: row.closing_amount,
      difference: row.closing_amount - row.expected_amount,
    }));

    try {
      if (isSubCashier) {
        const doc = await createSubPosClosing({
          pos_profile: posProfile.name,
          pos_opening_entry: openingEntry.name,
          user: user.name,
          period_start_date: openingEntry.period_start_date,
          period_end_date: formatDateTime(periodEndDate),
          payment_reconciliation: paymentReconciliation,
          grand_total: totals.grandTotal,
          net_total: totals.netTotal,
          total_quantity: totals.totalQty,
        });
        await submitSubPosClosing(doc.name);
      } else {
        const doc = await createPosClosingEntry({
          pos_profile: posProfile.name,
          pos_opening_entry: openingEntry.name,
          user: user.name,
          company: posProfile.company,
          period_start_date: openingEntry.period_start_date,
          period_end_date: formatDateTime(periodEndDate),
          posting_date: formatDate(periodEndDate),
          posting_time: formatTime(periodEndDate),
          payment_reconciliation: paymentReconciliation,
          grand_total: totals.grandTotal,
          net_total: totals.netTotal,
          total_quantity: totals.totalQty,
        });
        await submitPosClosingEntry(doc.name);
      }

      // Close submission succeeded -- gate on the Closing checklist before
      // notifying the parent and dismissing the dialog.
      if (posProfile?.name) {
        setShowClosingChecklist(true);
      } else {
        await onClosingSubmitted?.();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to submit POS closing:', error);
      setSubmitError(extractServerErrorMessage(error, t('pos_closing.submit_failed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosingChecklistComplete = async () => {
    setShowClosingChecklist(false);
    await onClosingSubmitted?.();
    onOpenChange(false);
  };

  // Pre-close gate: the close submission hasn't fired yet, so finishing the
  // checklist resumes it instead of dismissing the dialog.
  const handlePreCloseChecklistComplete = () => {
    setShowClosingChecklist(false);
    setPreCloseGate(false);
    void handleSubmit();
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  if (showClosingChecklist && posProfile?.name) {
    return (
      <ChecklistGateDialog
        posProfile={posProfile.name}
        checklistType="Closing"
        onComplete={preCloseGate ? handlePreCloseChecklistComplete : handleClosingChecklistComplete}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="xlarge"
        size="4xl"
        onClose={() => handleOpenChange(false)}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('pos_closing.title')}</DialogTitle>
          <DialogDescription>{t('pos_closing.description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner message={t('pos_closing.loading')} />
            </div>
          ) : loadError ? (
            <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-text-tertiary">{t('pos_closing.grand_total')}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatCurrency(totals.grandTotal)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-text-tertiary">{t('pos_closing.net_total')}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatCurrency(totals.netTotal)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-text-tertiary">{t('pos_closing.total_qty')}</p>
                  <p className="text-lg font-semibold text-foreground">{totals.totalQty}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-text-tertiary">{t('pos_closing.total_invoices')}</p>
                  <p className="text-lg font-semibold text-foreground">{invoiceCount}</p>
                </div>
              </div>

              {hasRows ? (
                <ClosingPaymentTable rows={rows} onChange={handleRowChange} />
              ) : (
                <p className="py-8 text-center text-sm text-text-tertiary">
                  {t('pos_closing.no_invoices')}
                </p>
              )}
            </>
          )}
        </div>

        {submitError && (
          <p className="px-6 pb-2 text-sm font-medium text-destructive break-words">{submitError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !!loadError || !openingEntry}
          >
            {isSubmitting ? t('pos_closing.submitting') : t('pos_closing.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default POSClosingDialog;
