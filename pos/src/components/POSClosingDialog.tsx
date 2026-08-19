import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { db, formatCurrency } from '@ury/core';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import ClosingPaymentTable from './ClosingPaymentTable';
import ChecklistGateDialog from './ChecklistGateDialog';
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

/**
 * Extracts a human-readable message from a Frappe API error, unwrapping
 * `_server_messages` when present (e.g. frappe.throw("Submit/Delete Draft
 * Invoices") raised by SubPOSClosing.validate()). Falls back to the error's
 * own message, then to a generic string.
 */
function extractServerErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && '_server_messages' in error) {
    const raw = (error as { _server_messages?: unknown })._server_messages;
    if (typeof raw === 'string') {
      try {
        const messages = JSON.parse(raw);
        const first = JSON.parse(messages[0]);
        if (first?.message) return first.message as string;
      } catch {
        // fall through to other extraction strategies
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface AggregatedTotals {
  grandTotal: number;
  netTotal: number;
  totalQty: number;
}

/**
 * Aggregates raw POS Invoice dicts into closing totals and per-mode expected
 * amounts, faithfully porting the logic in
 * ury/ury/doctype/sub_pos_closing/sub_pos_closing.js (refresh_payments /
 * set_form_data): sums grand_total/net_total/total_qty, and for each
 * payment subtracts the invoice's change_amount when the payment account
 * matches account_for_change_amount before accumulating by mode_of_payment.
 */
function aggregateInvoices(invoices: POSClosingInvoice[]): {
  totals: AggregatedTotals;
  expectedByMode: Record<string, number>;
} {
  const totals: AggregatedTotals = { grandTotal: 0, netTotal: 0, totalQty: 0 };
  const expectedByMode: Record<string, number> = {};

  invoices.forEach((invoice) => {
    totals.grandTotal += Number(invoice.grand_total) || 0;
    totals.netTotal += Number(invoice.net_total) || 0;
    totals.totalQty += Number(invoice.total_qty) || 0;

    (invoice.payments || []).forEach((payment) => {
      let amount = Number(payment.amount) || 0;
      if (payment.account === invoice.account_for_change_amount) {
        amount -= Number(invoice.change_amount) || 0;
      }
      expectedByMode[payment.mode_of_payment] =
        (expectedByMode[payment.mode_of_payment] || 0) + amount;
    });
  });

  return { totals, expectedByMode };
}

function buildRows(
  openingBalances: OpeningBalanceDetail[],
  expectedByMode: Record<string, number>
): ClosingPaymentSummary[] {
  const rows = new Map<string, ClosingPaymentSummary>();

  openingBalances.forEach((detail) => {
    rows.set(detail.mode_of_payment, {
      mode_of_payment: detail.mode_of_payment,
      opening_amount: Number(detail.opening_amount) || 0,
      expected_amount: 0,
      closing_amount: 0,
      difference: 0,
    });
  });

  Object.entries(expectedByMode).forEach(([mode, expected]) => {
    const existing = rows.get(mode);
    if (existing) {
      existing.expected_amount = expected;
    } else {
      rows.set(mode, {
        mode_of_payment: mode,
        opening_amount: 0,
        expected_amount: expected,
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

      const [invoices, openingDoc] = await Promise.all([
        subCashier
          ? getSubCashierPosInvoices(ownEntry.period_start_date, end, posProfile.name, user.name)
          : getMainCashierPosInvoices(ownEntry.period_start_date, end, posProfile.name, user.name),
        db.getDoc<OpeningEntryDoc>('POS Opening Entry', ownEntry.name),
      ]);

      setInvoiceCount(invoices.length);
      const { totals: aggregatedTotals, expectedByMode } = aggregateInvoices(invoices);
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
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!openingEntry || !posProfile || !user) return;

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

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  if (showClosingChecklist && posProfile?.name) {
    return (
      <ChecklistGateDialog
        posProfile={posProfile.name}
        checklistType="Closing"
        onComplete={handleClosingChecklistComplete}
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
            <p className="py-8 text-center text-sm text-red-600">{loadError}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">{t('pos_closing.grand_total')}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(totals.grandTotal)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">{t('pos_closing.net_total')}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(totals.netTotal)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">{t('pos_closing.total_qty')}</p>
                  <p className="text-lg font-semibold text-gray-900">{totals.totalQty}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">{t('pos_closing.total_invoices')}</p>
                  <p className="text-lg font-semibold text-gray-900">{invoiceCount}</p>
                </div>
              </div>

              {hasRows ? (
                <ClosingPaymentTable rows={rows} onChange={handleRowChange} />
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">
                  {t('pos_closing.no_invoices')}
                </p>
              )}
            </>
          )}
        </div>

        {submitError && (
          <p className="px-6 pb-2 text-sm font-medium text-red-600">{submitError}</p>
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
