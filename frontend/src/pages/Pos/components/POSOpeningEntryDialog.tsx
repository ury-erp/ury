import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DataTable,
  type DataTableColumn,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { Input } from '@ury/ui';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import {
  getModeOfPayment,
  createPosOpeningEntry,
  submitPosOpeningEntry,
  type ModeOfPaymentOption,
} from '../../../lib/pos/pos-opening-api';

interface POSOpeningEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the opening entry has been successfully submitted.
   */
  onOpeningSubmitted?: () => void | Promise<void>;
}

interface OpeningPaymentRow {
  mode_of_payment: string;
  opening_amount: number;
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

/**
 * Extracts a human-readable message from a Frappe API error.
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

const POSOpeningEntryDialog = ({ open, onOpenChange, onOpeningSubmitted }: POSOpeningEntryDialogProps) => {
  const { posProfile } = usePOSStore();
  const { user } = useRootStore();

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<OpeningPaymentRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadPaymentModes = useCallback(async () => {
    if (!posProfile || !user) return;

    setIsLoading(true);
    setLoadError(null);
    setSubmitError(null);

    try {
      const modes = await getModeOfPayment();
      setRows(
        modes.map((mode: ModeOfPaymentOption) => ({
          mode_of_payment: mode.mode_of_payment,
          opening_amount: 0,
        }))
      );
    } catch (error) {
      console.error('Failed to load payment modes:', error);
      setLoadError(extractServerErrorMessage(error, t('pos_opening.load_failed')));
    } finally {
      setIsLoading(false);
    }
  }, [posProfile, user]);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    loadPaymentModes();
  }, [open, loadPaymentModes]);

  const handleRowChange = (modeOfPayment: string, openingAmount: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.mode_of_payment === modeOfPayment ? { ...row, opening_amount: openingAmount } : row
      )
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!posProfile || !user) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const now = new Date();
      const doc = await createPosOpeningEntry({
        period_start_date: formatDateTime(now),
        posting_date: formatDate(now),
        company: posProfile.company,
        pos_profile: posProfile.name,
        user: user.name,
        balance_details: rows.filter((row) => row.opening_amount > 0),
      });

      await submitPosOpeningEntry(doc.name);
      await onOpeningSubmitted?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to submit POS opening:', error);
      setSubmitError(extractServerErrorMessage(error, t('pos_opening.submit_failed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="large"
        size="2xl"
        onClose={() => handleOpenChange(false)}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('pos_opening.title')}</DialogTitle>
          <DialogDescription>{t('pos_opening.description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner message={t('pos_opening.loading')} />
            </div>
          ) : loadError ? (
            <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
          ) : rows.length > 0 ? (
            <>
              {(() => {
                const paymentColumns: DataTableColumn<OpeningPaymentRow>[] = [
                  { key: 'mode_of_payment', header: 'Payment Mode' },
                  {
                    key: 'opening_amount',
                    header: 'Opening Amount',
                    render: (row) => (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.opening_amount > 0 ? String(row.opening_amount) : ''}
                        onChange={(e) =>
                          handleRowChange(row.mode_of_payment, parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="w-full text-center"
                        size="sm"
                      />
                    ),
                  },
                ];
                return <DataTable columns={paymentColumns} rows={rows} />;
              })()}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-text-tertiary">
              {t('pos_opening.no_payment_modes')}
            </p>
          )}
        </div>

        {submitError && (
          <p className="px-6 pb-2 text-sm font-medium text-destructive">{submitError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !!loadError}
          >
            {isSubmitting ? t('pos_opening.submitting') : t('pos_opening.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default POSOpeningEntryDialog;
