import { ReactNode } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  CalendarX,
  UserX,
  MapPin,
  Monitor,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../i18n';
import type { OpeningBlockingState } from './POSOpeningProvider';
import type { POSOpeningEntryRef } from '../lib/pos-opening-api';

interface POSOpeningDialogProps {
  state: OpeningBlockingState;
  message?: string;
  existingEntry?: POSOpeningEntryRef | null;
  canAccessDesk: boolean;
  onRetry: () => void;
  onContinue: () => void;
}

interface StateConfig {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
  };
}

const POSOpeningDialog = ({
  state,
  message,
  existingEntry,
  canAccessDesk,
  onRetry,
  onContinue,
}: POSOpeningDialogProps) => {
  const handleSwitchToDesk = () => {
    window.open(`${window.location.origin}/app`, '_blank');
  };

  const stateConfig: Record<OpeningBlockingState, StateConfig> = {
    permissionDenied: {
      icon: <ShieldAlert className="h-8 w-8 text-red-600" />,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      title: t('errors.posOpening.permission_denied'),
      description: t('pos.opening.contact_manager'),
    },
    dailyClosePending: {
      icon: <CalendarX className="h-8 w-8 text-orange-600" />,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      title: t('errors.posOpening.daily_close_pending'),
      description: t('pos.opening.contact_manager'),
    },
    mainCashierNotOpen: {
      icon: <UserX className="h-8 w-8 text-amber-600" />,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      title: t('errors.posOpening.main_cashier_not_open'),
      description: message || t('pos.opening.contact_manager'),
      primaryAction: {
        label: t('pos.opening.retry'),
        icon: <RefreshCw className="w-5 h-5 mr-2" />,
        onClick: onRetry,
      },
    },
    crossCompanyOpen: {
      icon: <MapPin className="h-8 w-8 text-blue-600" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: t('pos.opening.session_elsewhere_title'),
      description: t('pos.opening.session_elsewhere_message', {
        location: existingEntry
          ? `${existingEntry.company} / ${existingEntry.branch || existingEntry.pos_profile}`
          : '',
      }),
      primaryAction: {
        label: t('pos.opening.continue_to_pos'),
        icon: <ArrowRight className="w-5 h-5 mr-2" />,
        onClick: onContinue,
      },
    },
    genericError: {
      icon: <AlertTriangle className="h-8 w-8 text-red-600" />,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      title: t('errors.posOpening.generic', {
        message: message || t('errors.posOpening.load_failed'),
      }),
      description: t('pos.opening.contact_manager'),
      primaryAction: {
        label: t('pos.opening.retry'),
        icon: <RefreshCw className="w-5 h-5 mr-2" />,
        onClick: onRetry,
      },
    },
  };

  const config = stateConfig[state];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          <div
            className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${config.iconBg}`}
          >
            {config.icon}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">{config.title}</h2>

          <p className="text-gray-600 mb-8 text-lg">{config.description}</p>

          <div className="space-y-3">
            {config.primaryAction && (
              <Button
                onClick={config.primaryAction.onClick}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
              >
                {config.primaryAction.icon}
                {config.primaryAction.label}
              </Button>
            )}

            {canAccessDesk && (
              <Button
                onClick={handleSwitchToDesk}
                variant="outline"
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-6 rounded-lg transition-colors duration-200"
              >
                <Monitor className="w-5 h-5 mr-2" />
                {t('pos.switch_to_desk')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSOpeningDialog;
