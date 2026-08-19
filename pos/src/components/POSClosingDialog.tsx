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
import { call, db, formatCurrency } from '@ury/core';
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
  // Modes the cashier has explicitly entered a closing amount for (Fix 2:
  // a blank input must not silently count as "reviewed and zero").
  const [touchedModes, setTouchedModes] = useState<Set<string>>(new Set());
  // Tracks a create-but-not-yet-submitted Sub POS Closing / POS Closing
  // Entry doc name so a retry after a failed submit re-submits the same
  // doc instead of creating a duplicate draft (Fix 3). Cleared only on
  // final success or explicit cancel/dismiss of the dialog.
  const [pendingCloseDoc, setPendingCloseDoc] = useState<{
    name: string;
    kind: 'sub' | 'main';
  } | null>(null);
  // Lightweight "Are you sure?" step before the irreversible submit call
  // actually fires (Fix 6).
  const [showConfirm, setShowConfirm] = useState(false);

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
      // cashier => this session closes via Sub POS Closing.
      //
      // Fix 4: do NOT trust the cached posProfile.owner from the store for
      // this decision. `ury.ury_pos.api.getPosProfile` (already whitelisted,
      // already used elsewhere -- see lib/pos-profile-api.ts) is the
      // authoritative source: it derives `owner` from the POS Profile's
      // `applicable_for_users` child table row with `custom_main_cashier`
      // set, which is the same signal the Opening flow's
      // `_get_main_cashier_status` helper uses. Calling it fresh here (it
      // takes no args and resolves the profile from the user's own branch,
      // same as the store's cached copy) avoids relying on a POS Profile
      // snapshot that may have been cached in sessionStorage since session
      // start and could be stale if main-cashier assignment changed since.
      let subCashier = false;
      if (posProfile.multiple_cashier === 1) {
        try {
          const profileStatus = await call.get<{
            message: { owner: string; multiple_cashier: number };
          }>('ury.ury_pos.api.getPosProfile');
          subCashier = profileStatus.message.multiple_cashier === 1
            && profileStatus.message.owner !== user.name;
        } catch (statusError) {
          console.error('Failed to resolve main-cashier status, falling back to cached profile:', statusError);
          subCashier = posProfile.owner !== user.name;
        }
      }
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
      setTouchedModes(new Set());
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
    setTouchedModes((prev) => {
      if (prev.has(modeOfPayment)) return prev;
      const next = new Set(prev);
      next.add(modeOfPayment);
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) {
      // Explicit cancel/dismiss (Fix 3): a create-but-not-submitted draft
      // is intentionally left as-is server-side, but we stop tracking it
      // here since the user is walking away from this attempt.
      setPendingCloseDoc(null);
      setShowConfirm(false);
    }
    onOpenChange(next);
  };

  // Fix 2: submission-blocking validation. Every row must be explicitly
  // touched (not just numerically non-zero, since a blank input silently
  // becomes 0), and the total closing amount across all rows must be
  // non-zero so an all-zero close can't slip through unnoticed.
  const validation = useMemo(() => {
    if (rows.length === 0) {
      return { isValid: false, blockingMessage: null as string | null, warningMessage: null as string | null };
    }

    const untouchedCount = rows.filter((row) => !touchedModes.has(row.mode_of_payment)).length;
    const totalClosing = rows.reduce((sum, row) => sum + row.closing_amount, 0);

    const zeroRowsWithActivity = rows.filter(
      (row) =>
        touchedModes.has(row.mode_of_payment) &&
        row.closing_amount === 0 &&
        (row.opening_amount !== 0 || row.expected_amount !== 0)
    );

    let blockingMessage: string | null = null;
    if (untouchedCount > 0) {
      blockingMessage = t('pos_closing.validation_missing_rows');
    } else if (totalClosing === 0) {
      blockingMessage = t('pos_closing.validation_all_zero');
    }

    const warningMessage =
      !blockingMessage && zeroRowsWithActivity.length > 0
        ? t('pos_closing.validation_zero_row_warning')
        : null;

    return { isValid: !blockingMessage, blockingMessage, warningMessage };
  }, [rows, touchedModes]);

  const handleRequestSubmit = () => {
    if (!validation.isValid) return;
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (!openingEntry || !posProfile || !user) return;

    setShowConfirm(false);
    setIsSubmitting(true);
    setSubmitError(null);

    const paymentReconciliation = rows.map((row) => ({
      mode_of_payment: row.mode_of_payment,
      opening_amount: row.opening_amount,
      expected_amount: row.expected_amount,
      closing_amount: row.closing_amount,
      // Positive = overage, negative = shortage. Must match the display
      // convention in ClosingPaymentTable (Fix 1).
      difference: row.closing_amount - row.expected_amount,
    }));

    // Fix 3: if a previous attempt already created the draft doc but the
    // submit call then failed, reuse that doc instead of creating another
    // draft on retry.
    const kind: 'sub' | 'main' = pendingCloseDoc?.kind ?? (isSubCashier ? 'sub' : 'main');

    try {
      let docName = pendingCloseDoc?.name;

      if (!docName) {
        if (kind === 'sub') {
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
          docName = doc.name;
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
          docName = doc.name;
        }
        // Persist immediately -- if the submit call below throws, a retry
        // must skip straight to submitting this doc rather than creating
        // a second draft.
        setPendingCloseDoc({ name: docName, kind });
      }

      if (kind === 'sub') {
        await submitSubPosClosing(docName);
      } else {
        await submitPosClosingEntry(docName);
      }

      // Final success -- stop tracking the draft.
      setPendingCloseDoc(null);

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

  // Fix 5: the underlying POS Closing doc is already submitted by the time
  // the checklist gate renders -- completing the checklist itself is just
  // post-close housekeeping, so give the cashier a way out instead of
  // trapping them if they can't finish it right now.
  const handleSkipClosingChecklist = async () => {
    setShowClosingChecklist(false);
    await onClosingSubmitted?.();
    onOpenChange(false);
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  if (showClosingChecklist && posProfile?.name) {
    return (
      <>
        <ChecklistGateDialog
          posProfile={posProfile.name}
          checklistType="Closing"
          onComplete={handleClosingChecklistComplete}
        />
        {/*
          Fix 5: the POS Closing doc is already submitted at this point --
          ChecklistGateDialog is otherwise a non-dismissible full-screen
          overlay (z-50) with no way out except finishing every mandatory
          item. Render an escape hatch above it so the cashier isn't
          stranded if they can't complete the checklist right now.
        */}
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-xl">
            <p className="text-sm text-gray-700">{t('pos_closing.checklist_skip_hint')}</p>
            <Button variant="outline" size="sm" onClick={handleSkipClosingChecklist}>
              {t('pos_closing.checklist_skip')}
            </Button>
          </div>
        </div>
      </>
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
                <ClosingPaymentTable
                  rows={rows}
                  touchedModes={touchedModes}
                  onChange={handleRowChange}
                />
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">
                  {t('pos_closing.no_invoices')}
                </p>
              )}

              {hasRows && validation.blockingMessage && (
                <p className="mt-3 text-sm font-medium text-amber-700">
                  {validation.blockingMessage}
                </p>
              )}
              {hasRows && !validation.blockingMessage && validation.warningMessage && (
                <p className="mt-3 text-sm font-medium text-amber-700">
                  {validation.warningMessage}
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
            onClick={handleRequestSubmit}
            disabled={isSubmitting || isLoading || !!loadError || !openingEntry || !hasRows || !validation.isValid}
          >
            {isSubmitting ? t('pos_closing.submitting') : t('pos_closing.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {showConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('pos_closing.confirm_title')}
            </h3>
            <p className="mt-2 text-sm text-gray-600">{t('pos_closing.confirm_message')}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                {t('pos_closing.confirm_back')}
              </Button>
              <Button onClick={handleConfirmSubmit} disabled={isSubmitting}>
                {isSubmitting ? t('pos_closing.submitting') : t('pos_closing.confirm_submit')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default POSClosingDialog;
