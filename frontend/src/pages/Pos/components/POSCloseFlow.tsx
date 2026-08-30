import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { LogOut, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import POSClosingDialog from './POSClosingDialog';

/**
 * Voluntary end-of-day POS close flow. Surfaced from Settings so a
 * cashier/manager can intentionally close their OWN current open POS
 * session on demand -- unlike POSOpeningProvider's auto-triggered
 * POSClosingDialog, which only fires when a STALE/previous session is
 * detected. Reuses POSClosingDialog as-is: it discovers the open POS
 * Opening Entry belonging to the logged-in user via
 * getOpenPosOpeningEntries() + a match on user.name, so no extra wiring is
 * needed to point it at "the current session" -- it always closes whatever
 * open entry belongs to the calling user.
 */
const POSCloseFlow = () => {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);
  const [closed, setClosed] = useState(false);

  const handleClosingDialogOpenChange = (open: boolean) => {
    setClosingOpen(open);
  };

  const handleClosingSubmitted = async () => {
    setClosingOpen(false);
    setClosed(true);
  };

  if (closed) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {t('settings.closed_title')}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">{t('settings.closed_description')}</p>
          <Button onClick={() => navigate('/pos/dashboard')}>
            {t('settings.back_to_dashboard')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border border-border">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-foreground mb-1">
            {t('settings.close_pos_title')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.close_pos_description')}</p>
          <Button variant="danger" onClick={() => setConfirmOpen(true)} className="gap-2">
            <LogOut className="h-4 w-4" />
            {t('settings.close_pos_button')}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation gate before opening the real closing dialog -- this
          is a significant, hard-to-reverse action for the business day. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.confirm_title')}</DialogTitle>
            <DialogDescription>{t('settings.confirm_description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('settings.confirm_cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                setClosingOpen(true);
              }}
            >
              {t('settings.confirm_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reuses POSClosingDialog verbatim -- it self-discovers the caller's
          own open POS Opening Entry, so this voluntary trigger needs no
          extra props to target the current session. */}
      {closingOpen && (
        <POSClosingDialog
          open={closingOpen}
          onOpenChange={handleClosingDialogOpenChange}
          onClosingSubmitted={handleClosingSubmitted}
        />
      )}
    </>
  );
};

export default POSCloseFlow;
