import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Textarea } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { t } from '../i18n';

/**
 * Manager approval on the same screen. Some actions (a cashier cancelling
 * an order, removing items already sent to the kitchen) need a manager's
 * OK: the server answers with an "ApprovalRequired" error, this shows a
 * PIN pad, and the action is repeated with the manager's approval PIN.
 * See ury/ury/approvals.py.
 */

export interface Approval {
  pin: string;
  reason?: string;
}

interface Options {
  title: string;
  /** Ask the cashier for a reason (sent along with the approval). */
  askReason?: boolean;
}

interface Pending extends Options {
  message: string;
  resolve: (approval: Approval | null) => void;
}

interface ApprovalContextValue {
  /**
   * Runs `action`; if a manager must approve, asks for their PIN and runs it
   * again with the approval. Resolves to undefined when the user gives up.
   */
  withApproval: <T>(action: (approval?: Approval) => Promise<T>, options: Options) => Promise<T | undefined>;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function isApprovalRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { exc_type?: string; exception?: string };
  return e.exc_type === 'ApprovalRequired' || Boolean(e.exception?.includes('ApprovalRequired'));
}

const MAX_PIN = 6;

export function ManagerApprovalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const reasonRef = useRef('');

  const ask = useCallback(
    (options: Options, message: string) =>
      new Promise<Approval | null>((resolve) => {
        setPin('');
        setPending({ ...options, message, resolve });
      }),
    []
  );

  const withApproval = useCallback<ApprovalContextValue['withApproval']>(
    async (action, options) => {
      try {
        return await action();
      } catch (error) {
        if (!isApprovalRequired(error)) throw error;
        // The first answer only says approval is needed, which the pad already
        // says; show server messages from then on (wrong PIN, locked).
        let message = '';
        reasonRef.current = '';
        setReason('');
        // Ask until the action succeeds, the PIN pad is closed, or another error comes back.
        for (;;) {
          const approval = await ask(options, message);
          if (!approval) {
            setPending(null);
            return undefined;
          }
          try {
            const result = await action(approval);
            setPending(null);
            return result;
          } catch (retryError) {
            if (!isApprovalRequired(retryError)) {
              setPending(null);
              throw retryError;
            }
            message = parseFrappeError(retryError, t('approval.needed'));
          }
        }
      }
    },
    [ask]
  );

  const finish = (approval: Approval | null) => {
    pending?.resolve(approval);
  };

  const press = (key: string) => {
    if (key === 'back') setPin((p) => p.slice(0, -1));
    else if (pin.length < MAX_PIN) setPin((p) => p + key);
  };

  const canApprove = pin.length >= 4 && (!pending?.askReason || reason.trim().length > 0);

  return (
    <ApprovalContext.Provider value={{ withApproval }}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && finish(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>{t('approval.enter_pin')}</DialogDescription>
          </DialogHeader>
          <div className="px-6 space-y-4">
            {pending?.message && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {pending.message}
              </p>
            )}
            {pending?.askReason && (
              <Textarea
                placeholder={t('approval.reason')}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  reasonRef.current = e.target.value;
                }}
              />
            )}
            <div className="flex justify-center gap-3" aria-hidden="true">
              {Array.from({ length: MAX_PIN }).map((_, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  className="h-14 rounded-xl border-2 border-gray-200 bg-gray-50 text-xl font-semibold active:bg-gray-200"
                  aria-label={key === 'back' ? t('approval.delete_digit') : key}
                >
                  {key === 'back' ? '⌫' : key}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => finish({ pin, reason: reasonRef.current.trim() || undefined })}
              disabled={!canApprove}
            >
              {t('approval.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ApprovalContext.Provider>
  );
}

export function useManagerApproval(): ApprovalContextValue {
  const value = useContext(ApprovalContext);
  if (!value) throw new Error('useManagerApproval must be used inside ManagerApprovalProvider');
  return value;
}
