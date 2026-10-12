import React from 'react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Spinner } from '@ury/ui';
import { t } from '../../i18n';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  /** Extra content between the description and the buttons (a reason field, a summary). */
  children?: React.ReactNode;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** A yes/no question before an action that cannot be taken back. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy,
  children,
  confirmDisabled,
  onConfirm,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
    <DialogContent className="max-w-md bg-white p-6" onClose={busy ? undefined : onClose}>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-gray-900">{title}</DialogTitle>
      </DialogHeader>
      {description && <div className="mt-2 text-sm text-gray-600">{description}</div>}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
          {t('dash.purchases.cancel_action')}
        </Button>
        <Button
          size="sm"
          variant={tone === 'danger' ? 'danger' : 'default'}
          className={tone === 'danger' ? '' : 'bg-primary text-white'}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
        >
          {busy && <Spinner className="w-4 h-4" />}
          {confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
