import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../i18n';

interface POSOpeningDialogProps {
  onReload: () => void;
  type: 'opening' | 'closing';
}

const POSOpeningDialog = ({ onReload, type }: POSOpeningDialogProps) => {
  const isOpeningIssue = type === 'opening';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Icon */}
          <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${
            isOpeningIssue ? 'bg-destructive-tint' : 'bg-warning-tint'
          }`}>
            {isOpeningIssue ? (
              <RefreshCw className="h-8 w-8 text-destructive" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-warning" />
            )}
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-foreground mb-4">
            {isOpeningIssue ? t('pos.not_opened_title') : t('pos.not_closed_title')}
          </h2>

          {/* Message */}
          <p className="text-muted-foreground mb-8 text-lg">
            {isOpeningIssue ? t('pos.not_opened_message') : t('pos.not_closed_message')}
          </p>

          {/* Buttons */}
          <div className="space-y-3">
            <Button
              onClick={onReload}
              className="w-full bg-primary hover:bg-primary text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              {t('pos.reload_page')}
            </Button>
          </div>

          {/* Recovery guidance */}
          <p className="mt-4 text-sm text-text-tertiary">
            {t('pos.contact_manager')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default POSOpeningDialog; 