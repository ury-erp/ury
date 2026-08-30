import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  cn,
} from '@ury/ui';
import { t } from '../i18n';
import {
  getChecklist,
  submitChecklist,
  type ChecklistItem,
  type SubmitChecklistItem,
} from '../../../lib/pos/checklist-api';

interface ChecklistGateDialogProps {
  posProfile: string;
  checklistType: 'Opening' | 'Closing';
  onComplete: () => void;
}

interface ChecklistRowState {
  item_label: string;
  is_mandatory: boolean;
  is_checked: boolean;
  remarks: string;
}

/**
 * Extracts a human-readable message from a Frappe API error, unwrapping
 * `_server_messages` when present. Falls back to the error's own message,
 * then to a generic string. Mirrors the helper in POSClosingDialog.tsx.
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

const toRowState = (items: ChecklistItem[]): ChecklistRowState[] =>
  items.map((item) => ({
    item_label: item.item_label,
    is_mandatory: item.is_mandatory,
    is_checked: false,
    remarks: '',
  }));

/**
 * Non-dismissible full-screen overlay that blocks POS access until the
 * user completes an Opening or Closing checklist. Same hard-block visual
 * treatment as POSOpeningDialog, but interactive: fetches the checklist on
 * mount, renders each item with a mandatory marker and an optional remarks
 * field, and submits once every mandatory item is checked.
 *
 * Uses the shared Dialog/DialogContent primitives but intentionally omits
 * `onOpenChange` and the close button (`onClose`): the primitives only ever
 * initiate a close by invoking those callbacks (overlay click calls
 * `onOpenChange?.(false)`, the close "x" calls `onClose`), so leaving both
 * unset means there is no code path that can dismiss this gate — it can
 * only close via `onComplete()` from a real, successful submit.
 */
const ChecklistGateDialog = ({ posProfile, checklistType, onComplete }: ChecklistGateDialogProps) => {
  const [rows, setRows] = useState<ChecklistRowState[]>([]);
  const [logName, setLogName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleKey = checklistType === 'Opening' ? 'checklist.title_opening' : 'checklist.title_closing';

  const loadChecklist = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // getChecklist's declared camelCase fields (logName/logStatus) don't
      // actually match what the backend returns (log_name/log_status), so
      // fetchedLogName was always undefined here. Read both casings
      // defensively until the shared api layer is fixed.
      const checklistResult: any = await getChecklist(posProfile, checklistType);
      const fetchedLogName = checklistResult.logName ?? checklistResult.log_name ?? null;
      setRows(toRowState(checklistResult.items));
      setLogName(fetchedLogName);
    } catch (error) {
      console.error('Failed to load checklist:', error);
      setLoadError(extractServerErrorMessage(error, t('checklist.load_failed')));
    } finally {
      setIsLoading(false);
    }
  }, [posProfile, checklistType]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  // Auto-submit when the checklist has zero configured items. Since there's
  // nothing to check, we immediately submit with an empty items array, which
  // the backend correctly marks as Complete (all_mandatory_checked is
  // vacuously true for empty lists). This prevents the confusing UX of showing
  // a gate with a Submit button but no items to interact with.
  useEffect(() => {
    // Only auto-submit once when: finished loading, no load error, no items, and not already submitting
    if (!isLoading && !loadError && rows.length === 0 && !isSubmitting) {
      const autoSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
          const response = await submitChecklist(posProfile, checklistType, [], logName ?? undefined);
          if (response.status === 'Complete') {
            onComplete();
          } else {
            setSubmitError(t('checklist.incomplete_error'));
          }
        } catch (error) {
          console.error('Failed to auto-submit empty checklist:', error);
          setSubmitError(extractServerErrorMessage(error, t('checklist.submit_failed')));
        } finally {
          setIsSubmitting(false);
        }
      };

      autoSubmit();
    }
  }, [isLoading, loadError, rows.length, isSubmitting, posProfile, checklistType, logName, onComplete]);

  const handleCheckedChange = (index: number, isChecked: boolean) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, is_checked: isChecked } : row)));
  };

  const handleRemarksChange = (index: number, remarks: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, remarks } : row)));
  };

  // Mirrors the backend's completion rule: every mandatory item must be
  // checked before the checklist can be submitted as Complete.
  const allMandatoryChecked = useMemo(
    () => rows.every((row) => !row.is_mandatory || row.is_checked),
    [rows]
  );

  const handleSubmit = async () => {
    if (!allMandatoryChecked) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const items: SubmitChecklistItem[] = rows.map((row) => ({
      item_label: row.item_label,
      is_checked: row.is_checked,
      remarks: row.remarks,
    }));

    try {
      const response = await submitChecklist(posProfile, checklistType, items, logName ?? undefined);

      if (response.status === 'Complete') {
        onComplete();
      } else {
        // Should not normally happen given the client-side button-disable
        // above, but handle it defensively rather than doing nothing.
        setSubmitError(t('checklist.incomplete_error'));
      }
    } catch (error) {
      console.error('Failed to submit checklist:', error);
      setSubmitError(extractServerErrorMessage(error, t('checklist.submit_failed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // No onOpenChange: overlay clicks call `onOpenChange?.(false)`, which is
    // a no-op here since the prop is unset, keeping this gate non-dismissable.
    <Dialog open>
      <DialogContent size="lg" showCloseButton={false} className="p-8 max-h-[90vh] flex flex-col">
        <DialogHeader className="p-0 mb-2">
          <DialogTitle className="text-2xl text-center">{t(titleKey)}</DialogTitle>
          <DialogDescription className="text-center">{t('checklist.description')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner message={t('checklist.loading')} />
          </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-1">
              {rows.map((row, index) => (
                <div key={`${row.item_label}-${index}`} className="border border-border rounded-lg p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.is_checked}
                      onChange={(e) => handleCheckedChange(index, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {row.item_label}
                      {row.is_mandatory && <span className="text-destructive ml-1">*</span>}
                    </span>
                  </label>
                  <Input
                    type="text"
                    value={row.remarks}
                    onChange={(e) => handleRemarksChange(index, e.target.value)}
                    placeholder={t('checklist.remarks_placeholder')}
                    size="sm"
                    className="mt-2 ml-7 w-[calc(100%-1.75rem)]"
                  />
                </div>
              ))}
            </div>

            {submitError && (
              <p className="mb-4 text-center text-sm text-destructive">{submitError}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!allMandatoryChecked || isSubmitting}
              className={cn(
                'w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200',
                (!allMandatoryChecked || isSubmitting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSubmitting ? t('checklist.submitting') : t('checklist.submit')}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChecklistGateDialog;
