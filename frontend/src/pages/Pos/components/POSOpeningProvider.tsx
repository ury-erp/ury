import { useEffect, useState } from 'react';
import { checkPOSOpening, validatePOSClose } from '../../../lib/pos/pos-opening-api';
import { getChecklist } from '../../../lib/pos/checklist-api';
import { usePOSStore } from '../store/pos-store';
import POSOpeningDialog from './POSOpeningDialog';
import POSOpeningEntryDialog from './POSOpeningEntryDialog';
import POSClosingDialog from './POSClosingDialog';
import ChecklistGateDialog from './ChecklistGateDialog';
import { t } from '../i18n';

interface POSOpeningProviderProps {
  children: React.ReactNode;
}

type ValidationType = 'opening' | 'closing' | null;

const POSOpeningProvider = ({ children }: POSOpeningProviderProps) => {
  const [validationType, setValidationType] = useState<ValidationType>(null);
  // Set once checkPOSOpening() confirms the POS is open but the Opening
  // checklist log for today isn't status="Complete" yet. Takes priority over
  // the daily-close check below -- the cashier must clear the checklist
  // before we even look at whether a previous session needs closing.
  const [needsOpeningChecklist, setNeedsOpeningChecklist] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Track whether POSClosingDialog failed/was cancelled and we should fall
  // back to the blocker so the user has Switch to Desk escape hatch.
  const [showClosingBlocker, setShowClosingBlocker] = useState(false);
  const { posProfile } = usePOSStore();

  const checkPOSStatus = async () => {
    try {
      setIsLoading(true);
      setNeedsOpeningChecklist(false);

      // First check if POS is opened
      const openingResponse = await checkPOSOpening();
      if (openingResponse.message === 1) {
        // POS is not opened
        setValidationType('opening');
        return;
      }

      // POS is opened -- gate on the Opening checklist before the daily
      // close check. If today's Opening checklist log isn't Complete yet,
      // block here; checkPOSStatus() re-runs once the cashier submits it.
      if (posProfile?.name) {
        try {
          // frontend/src/lib/pos/checklist-api.ts's getChecklist() already maps
          // the backend's snake_case response (log_name/log_status) onto the
          // camelCase ChecklistResponse shape (logName/logStatus) — the
          // defensive dual-casing read that used to live here (working around
          // a mismatch that was actually in this call site, not the API layer)
          // has been removed per PLAN.md §5/§7 Phase 1.
          const checklistResult = await getChecklist(posProfile.name, 'Opening');
          const logStatus = checklistResult.logStatus;
          if (logStatus !== 'Complete') {
            setNeedsOpeningChecklist(true);
            return;
          }
        } catch (error) {
          console.error('Failed to check opening checklist status:', error);
          // On error, block on the checklist for safety.
          setNeedsOpeningChecklist(true);
          return;
        }
      }

      // If POS is opened, check if custom_daily_pos_close is enabled
      if (posProfile?.custom_daily_pos_close === 1) {
        try {
          const closeResponse = await validatePOSClose(posProfile.name);
          if (closeResponse.message === 'Failed') {
            // Previous POS is not closed
            setValidationType('closing');
            return;
          }
        } catch (error) {
          console.error('Failed to validate POS close status:', error);
          // On error, assume POS is not closed for safety
          setValidationType('closing');
          return;
        }
      }

      // All validations passed
      setValidationType(null);
    } catch (error) {
      console.error('Failed to check POS opening status:', error);
      // On error, assume POS is not opened for safety
      setValidationType('opening');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = () => {
    // Reset the blocker flag when reloading so we start fresh
    setShowClosingBlocker(false);
    window.location.reload();
  };

  useEffect(() => {
    // Only check if we have the POS profile loaded
    if (posProfile) {
      checkPOSStatus();
      // Reset the blocker flag when status check runs (e.g., after opening checklist completes)
      setShowClosingBlocker(false);
    }
  }, [posProfile]);

  // Show loading state while checking
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('common.checking_pos_status')}</p>
        </div>
      </div>
    );
  }

  // Show opening entry creation dialog when POS needs to be opened
  if (validationType === 'opening') {
    return (
      <POSOpeningEntryDialog
        open={true}
        onOpenChange={() => {}}
        onOpeningSubmitted={async () => {
          await checkPOSStatus();
        }}
      />
    );
  }

  // For closing gate: fall back to blocker if POSClosingDialog failed/was cancelled
  if (validationType === 'closing' && showClosingBlocker) {
    return <POSOpeningDialog onReload={handleReload} type="closing" />;
  }

  // Show the real closing dialog. If it fails to load (e.g., no open entry
  // found) or user cancels, fall back to the blocker so they have Switch to
  // Desk option. This is necessary because POSClosingDialog.cancel is the
  // only way to signal "user cancelled" when there's a load error.
  if (validationType === 'closing') {
    return (
      <POSClosingDialog
        open={true}
        onOpenChange={(next) => {
          if (!next) {
            // Dialog is closing (error or user cancel) - fall back to blocker
            setShowClosingBlocker(true);
          }
        }}
        onClosingSubmitted={async () => {
          setValidationType(null);
          await checkPOSStatus();
        }}
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

  // Render children if all validations passed
  return <>{children}</>;
};

export default POSOpeningProvider;
