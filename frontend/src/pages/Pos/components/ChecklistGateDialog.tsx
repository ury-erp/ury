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
  messageToPlainText,
} from '@ury/ui';
import { t } from '../i18n';
import {
  getChecklist,
  submitChecklist,
  type ChecklistBlocker,
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
  status: 'Passed' | 'Failed' | null;
  remarks: string;
  goal?: string | null;
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
        if (first?.message) return messageToPlainText(first.message as string);
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
    // Prefill the result the user saved last time (failed items resurface
    // with their previous selection so they can review or correct it).
    status: item.status === 'Passed' || item.status === 'Failed' ? item.status : null,
    remarks: item.remarks ?? '',
    goal: item.goal ?? null,
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
  const [blockedBy, setBlockedBy] = useState<ChecklistBlocker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // STATE 2 of the gate UX: the user is eligible (no predecessor block) but
  // has not started their checklist yet. The form stays hidden until they
  // press Start Checklist so the screen always offers a clear action.
  const [started, setStarted] = useState(false);

  const titleKey = checklistType === 'Opening' ? 'checklist.title_opening' : 'checklist.title_closing';

  const loadChecklist = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setBlockedBy(null);
    setStarted(false);

    try {
      const checklistResult: any = await getChecklist(posProfile, checklistType);
      if (checklistResult.blockedBy) {
        // A predecessor role has not finished this phase's checklist; the
        // gate stays closed with a specific message instead of the form.
        setBlockedBy(checklistResult.blockedBy);
        setRows([]);
        return;
      }
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
    if (!isLoading && !loadError && !blockedBy && rows.length === 0 && !isSubmitting) {
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
  }, [isLoading, loadError, blockedBy, rows.length, isSubmitting, posProfile, checklistType, logName, onComplete]);

  const handleStatusChange = (index: number, status: 'Passed' | 'Failed') => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, status } : row)));
  };

  const handleRemarksChange = (index: number, remarks: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, remarks } : row)));
  };

  // Mirrors the backend's completion rule: every mandatory item must have an
  // explicit result, and a FAIL must carry a remark explaining it.
  const allMandatoryAnswered = useMemo(
    () => rows.every((row) => !row.is_mandatory || row.status),
    [rows]
  );
  const failuresExplained = useMemo(
    () => rows.every((row) => row.status !== 'Failed' || row.remarks.trim().length > 0),
    [rows]
  );
  const canSubmit = allMandatoryAnswered && failuresExplained;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const items: SubmitChecklistItem[] = rows.map((row) => ({
      item_label: row.item_label,
      status: row.status,
      remarks: row.remarks,
      goal: row.goal,
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
          <div className="py-8 text-center">
            <p className="text-sm text-destructive mb-4">{loadError}</p>
            <Button onClick={() => void loadChecklist()} variant="outline">
              {t('checklist.retry')}
            </Button>
          </div>
        ) : blockedBy ? (
          <div className="py-10 text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              {t('checklist.blocked_heading', { checklist: t(titleKey) })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('checklist.blocked_message', {
                role: blockedBy.role_label,
                checklist: t(titleKey),
              })}
            </p>
            {/*
              STATE 1: the user is not eligible yet, so there is deliberately
              no Start Checklist here -- but the predecessor may submit while
              this screen is open, so offer a recheck instead of stranding the
              user on a dead-end message.
            */}
            <Button onClick={() => void loadChecklist()} variant="outline" className="mt-6">
              {t('checklist.recheck')}
            </Button>
          </div>
        ) : !started && rows.length > 0 ? (
          <div className="py-10 text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              {t('checklist.blocked_heading', { checklist: t(titleKey) })}
            </p>
            <p className="text-sm text-muted-foreground mb-6">{t('checklist.description')}</p>
            {/*
              STATE 2: the user is the eligible role -- the checklist has not
              been started yet, so the only action on this screen is Start.
            */}
            <Button onClick={() => setStarted(true)} className="font-medium py-3 px-6 rounded-lg">
              {t('checklist.start')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-1">
              {rows.map((row, index) => (
                <div key={`${row.item_label}-${index}`} className="border border-border rounded-lg p-3">
                  <span className="text-sm font-medium text-foreground">
                    {index + 1}. {row.item_label}
                    {!!row.is_mandatory && <span className="text-destructive ml-1">*</span>}
                  </span>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="radio"
                        name={`checklist-result-${index}`}
                        checked={row.status === 'Passed'}
                        onChange={() => handleStatusChange(index, 'Passed')}
                        className="h-4 w-4 accent-primary"
                      />
                      {t('checklist.pass')}
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="radio"
                        name={`checklist-result-${index}`}
                        checked={row.status === 'Failed'}
                        onChange={() => handleStatusChange(index, 'Failed')}
                        className="h-4 w-4 accent-destructive"
                      />
                      {t('checklist.fail')}
                    </label>
                  </div>
                  {row.status && (
                    <Input
                      type="text"
                      value={row.remarks}
                      onChange={(e) => handleRemarksChange(index, e.target.value)}
                      placeholder={
                        row.status === 'Failed'
                          ? t('checklist.fail_remarks_placeholder')
                          : t('checklist.remarks_placeholder')
                      }
                      size="sm"
                      className="mt-2 w-full"
                    />
                  )}
                  {row.status === 'Failed' && !row.remarks.trim() && (
                    <p className="text-xs text-destructive mt-1">
                      {t('checklist.fail_remarks_required')}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {submitError && (
              <p className="mb-4 text-center text-sm text-destructive">{submitError}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className={cn(
                'w-full font-medium py-3 px-6 rounded-lg transition-colors duration-200',
                (!canSubmit || isSubmitting) && 'opacity-50 cursor-not-allowed'
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
