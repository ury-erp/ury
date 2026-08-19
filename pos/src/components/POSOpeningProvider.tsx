import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkPOSOpening,
  parseFrappeError,
  validatePOSClose,
  POSOpeningEntryRef,
} from '../lib/pos-opening-api';
import { getChecklist } from '../lib/checklist-api';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { User } from '../store/slices/auth-slice';
import POSOpeningDialog from './POSOpeningDialog';
import POSOpeningScreen from './POSOpeningScreen';
import ChecklistGateDialog from './ChecklistGateDialog';
import POSClosingDialog from './POSClosingDialog';
import { t } from '../i18n';

interface POSOpeningProviderProps {
  children: React.ReactNode;
}

export type OpeningBlockingState =
  | 'permissionDenied'
  | 'dailyClosePending'
  | 'mainCashierNotOpen'
  | 'crossCompanyOpen'
  | 'genericError';

const DESK_ROLES = ['System Manager', 'Desk User'];

function hasDeskAccess(user: User | null): boolean {
  if (!user) return false;
  if (user.name === 'Administrator') return true;
  return user.roles.some((role) => DESK_ROLES.includes(role));
}

function normalizeOpenEntries(
  message: number | POSOpeningEntryRef[]
): POSOpeningEntryRef[] | null {
  if (message === 1) return null;
  if (!Array.isArray(message)) return null;
  return message.filter(
    (entry): entry is POSOpeningEntryRef =>
      !!entry && typeof entry === 'object' && 'name' in entry
  );
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  if (typeof e.httpStatus === 'number') return e.httpStatus;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  return undefined;
}

const POSOpeningProvider = ({ children }: POSOpeningProviderProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [blockingState, setBlockingState] = useState<OpeningBlockingState | null>(null);
  const [blockingMessage, setBlockingMessage] = useState<string>('');
  const [existingEntry, setExistingEntry] = useState<POSOpeningEntryRef | null>(null);
  // Set once checkPOSOpening() confirms the POS is open but today's Opening
  // checklist log isn't status="Complete" yet. Takes priority over the
  // daily-close check below -- the cashier must clear the checklist before
  // we even look at whether a previous session needs closing.
  const [needsOpeningChecklist, setNeedsOpeningChecklist] = useState(false);
  // True once the cashier taps "Close Now" from the dailyClosePending
  // blocking dialog -- renders the real POSClosingDialog instead of just
  // telling them to contact a manager.
  const [showClosingDialog, setShowClosingDialog] = useState(false);

  const { posProfile } = usePOSStore();
  const { user } = useRootStore();

  const canAccessDesk = useMemo(() => hasDeskAccess(user), [user]);

  const clearBlockingState = useCallback(() => {
    setBlockingState(null);
    setBlockingMessage('');
    setShowClosingDialog(false);
  }, []);

  const handleScreenError = useCallback(
    (state: OpeningBlockingState, message?: string) => {
      setBlockingState(state);
      setBlockingMessage(message || '');
    },
    []
  );

  const checkPOSStatus = useCallback(async () => {
    if (!posProfile) return;

    setIsLoading(true);
    clearBlockingState();
    setExistingEntry(null);
    setNeedsOpeningChecklist(false);

    try {
      const response = await checkPOSOpening(user?.name);

      // No open entry for this user -> show the native opening screen.
      if (response.message === 1) {
        if (posProfile.custom_daily_pos_close === 1) {
          const closeResponse = await validatePOSClose(posProfile.name);
          if (closeResponse.message === 'Failed') {
            setBlockingState('dailyClosePending');
            setIsLoading(false);
            return;
          }
        }
        setIsLoading(false);
        return;
      }

      const entries = normalizeOpenEntries(response.message);
      if (!entries || entries.length === 0) {
        setIsLoading(false);
        return;
      }

      const matchingEntry =
        entries.find(
          (entry) =>
            entry.pos_profile === posProfile.name &&
            entry.company === posProfile.company &&
            entry.branch === posProfile.branch
        ) || entries[0];

      setExistingEntry(matchingEntry);

      const isSameContext =
        matchingEntry.company === posProfile.company &&
        matchingEntry.pos_profile === posProfile.name &&
        matchingEntry.branch === posProfile.branch;

      if (!isSameContext) {
        setBlockingState('crossCompanyOpen');
        setIsLoading(false);
        return;
      }

      // Gate on the Opening checklist before the daily-close check below --
      // the cashier must clear it before we look at whether a previous
      // session needs closing.
      if (posProfile.name) {
        try {
          const { logStatus } = await getChecklist(posProfile.name, 'Opening');
          if (logStatus !== 'Complete') {
            setNeedsOpeningChecklist(true);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Failed to check opening checklist status:', error);
          // On error, block on the checklist for safety.
          setNeedsOpeningChecklist(true);
          setIsLoading(false);
          return;
        }
      }

      if (posProfile.custom_daily_pos_close === 1) {
        const closeResponse = await validatePOSClose(posProfile.name);
        if (closeResponse.message === 'Failed') {
          setBlockingState('dailyClosePending');
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to check POS opening status:', error);

      const serverMessage = parseFrappeError(error);
      const status = getHttpStatus(error);
      const fallbackMessage =
        error instanceof Error ? error.message : t('errors.posOpening.load_failed');
      const message = serverMessage || fallbackMessage;

      if (status === 403 || /permission/i.test(message)) {
        setBlockingState('permissionDenied');
      } else if (/main cashier/i.test(message)) {
        setBlockingState('mainCashierNotOpen');
        setBlockingMessage(message);
      } else {
        setBlockingState('genericError');
        setBlockingMessage(message);
      }

      setIsLoading(false);
    }
  }, [posProfile, user?.name, clearBlockingState]);

  const handleOpeningSuccess = useCallback(() => {
    clearBlockingState();
    checkPOSStatus();
  }, [clearBlockingState, checkPOSStatus]);

  const handleClosingSuccess = useCallback(() => {
    clearBlockingState();
    checkPOSStatus();
  }, [clearBlockingState, checkPOSStatus]);

  useEffect(() => {
    if (posProfile) {
      checkPOSStatus();
    }
  }, [posProfile, checkPOSStatus]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.checking_pos_status')}</p>
        </div>
      </div>
    );
  }

  if (showClosingDialog && posProfile) {
    return (
      <POSClosingDialog
        open={showClosingDialog}
        onOpenChange={(open) => {
          if (!open) setShowClosingDialog(false);
        }}
        onClosingSubmitted={handleClosingSuccess}
      />
    );
  }

  if (blockingState) {
    return (
      <POSOpeningDialog
        state={blockingState}
        message={blockingMessage}
        existingEntry={existingEntry}
        canAccessDesk={canAccessDesk}
        onRetry={checkPOSStatus}
        onContinue={() => setBlockingState(null)}
        onCloseNow={
          blockingState === 'dailyClosePending'
            ? () => setShowClosingDialog(true)
            : undefined
        }
      />
    );
  }

  // Block on the Opening checklist until it's submitted as Complete.
  if (needsOpeningChecklist && posProfile?.name) {
    return (
      <ChecklistGateDialog
        posProfile={posProfile.name}
        checklistType="Opening"
        onComplete={() => {
          setNeedsOpeningChecklist(false);
          checkPOSStatus();
        }}
      />
    );
  }

  if (!existingEntry) {
    return (
      <POSOpeningScreen
        onSuccess={handleOpeningSuccess}
        onError={handleScreenError}
      />
    );
  }

  return <>{children}</>;
};

export default POSOpeningProvider;
