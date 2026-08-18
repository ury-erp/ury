import { useEffect, useMemo, useState } from 'react';
import { Store, RefreshCw, AlertTriangle, Lock } from 'lucide-react';
import { Button, Badge, Select, SelectItem, Spinner } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { useRootStore } from '../store/root-store';
import {
  createPOSOpening,
  getPOSOpeningContext,
  parseFrappeError,
  POSOpeningContext,
  POSOpeningPayment,
} from '../lib/pos-opening-api';
import { t } from '../i18n';
import POSOpeningPaymentTable from './POSOpeningPaymentTable';

type OpeningBlockingState =
  | 'permissionDenied'
  | 'dailyClosePending'
  | 'mainCashierNotOpen'
  | 'crossCompanyOpen'
  | 'genericError';

interface POSOpeningScreenProps {
  onSuccess?: () => void;
  onError?: (state: OpeningBlockingState, message?: string) => void;
}

const BLOCKING_ERROR_NONE = 'none';

type BlockingErrorKey =
  | typeof BLOCKING_ERROR_NONE
  | 'no_profiles'
  | 'no_payment_modes'
  | 'no_permission'
  | 'daily_close_pending'
  | 'main_cashier_not_open'
  | 'main_cashier_not_configured';

const POSOpeningScreen = ({ onSuccess, onError }: POSOpeningScreenProps) => {
  const { user } = useRootStore();

  const [context, setContext] = useState<POSOpeningContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<POSOpeningPayment[]>([]);

  const sessionStart = useMemo(() => {
    const timestamp = context?.session_start || new Date().toISOString();
    return new Date(timestamp).toLocaleString();
  }, [context?.session_start]);

  const loadContext = async (posProfile?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPOSOpeningContext(posProfile);
      setContext(data);
    } catch (err) {
      const message = parseFrappeError(err);
      setError(message || t('pos_opening.error_loading'));

      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status === 403 || /permission/i.test(message || '')) {
        onError?.('permissionDenied', message || undefined);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    if (!context) return;

    setBalances(
      context.payment_modes.map((mode) => ({
        mode_of_payment: mode.mode_of_payment,
        opening_amount: mode.opening_amount ?? 0,
      }))
    );
  }, [context]);

  const handleProfileChange = async (value: string) => {
    if (value === context?.selected_profile) return;
    await loadContext(value);
  };

  const totalOpeningBalance = useMemo(
    () => balances.reduce((sum, payment) => sum + (payment.opening_amount || 0), 0),
    [balances]
  );

  const blockingError: BlockingErrorKey = useMemo(() => {
    if (!context || isLoading) return BLOCKING_ERROR_NONE;

    if (!context.permissions.create || !context.permissions.submit) {
      return 'no_permission';
    }

    if (context.allowed_profiles.length === 0) {
      return 'no_profiles';
    }

    if (context.payment_modes.length === 0) {
      return 'no_payment_modes';
    }

    if (context.daily_close_pending) {
      return 'daily_close_pending';
    }

    if (context.multi_cashier.enabled) {
      if (!context.multi_cashier.main_cashier_configured) {
        return 'main_cashier_not_configured';
      }
      if (!context.multi_cashier.main_cashier_open) {
        return 'main_cashier_not_open';
      }
    }

    return BLOCKING_ERROR_NONE;
  }, [context, isLoading]);

  const canSubmit =
    !isLoading &&
    !isSubmitting &&
    blockingError === BLOCKING_ERROR_NONE &&
    context?.selected_profile != null;

  const mapCreateError = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes('pos opening entry exists')) {
      return t('pos_opening.session_already_open');
    }
    if (lower.includes('cannot assign cashier') || lower.includes('already assigned')) {
      return t('pos_opening.user_already_assigned');
    }
    if (lower.includes('main cashier pos must be open')) {
      return t('pos_opening.main_cashier_not_open');
    }
    if (lower.includes('no payment modes') || lower.includes('no mode of payment')) {
      return t('pos_opening.no_payment_modes');
    }
    if (lower.includes('default account')) {
      return t('pos_opening.payment_mode_misconfigured');
    }
    return message;
  };

  const handleSubmit = async () => {
    if (!canSubmit || !context?.selected_profile) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createPOSOpening({
        pos_profile: context.selected_profile,
        company: context.company,
        balance_details: balances,
      });

      onSuccess?.();
    } catch (err) {
      const serverMessage = parseFrappeError(err);
      const displayMessage = serverMessage ? mapCreateError(serverMessage) : t('pos_opening.error_opening');
      setError(displayMessage);

      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status === 403 || /permission/i.test(serverMessage || '')) {
        onError?.('permissionDenied', serverMessage || undefined);
      } else if (/main cashier/i.test(serverMessage || '')) {
        onError?.('mainCashierNotOpen', serverMessage || undefined);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBlockingMessage = () => {
    switch (blockingError) {
      case 'no_permission':
        return (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <Lock className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-red-700 text-sm">{t('pos_opening.no_permission')}</p>
          </div>
        );
      case 'no_profiles':
        return (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-red-700 text-sm">{t('pos_opening.no_profiles')}</p>
          </div>
        );
      case 'no_payment_modes':
        return (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-red-700 text-sm">{t('pos_opening.no_payment_modes')}</p>
          </div>
        );
      case 'daily_close_pending':
        return (
          <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-orange-700 text-sm">{t('pos_opening.previous_day_not_closed')}</p>
          </div>
        );
      case 'main_cashier_not_configured':
        return (
          <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-orange-700 text-sm">{t('pos_opening.main_cashier_not_configured')}</p>
          </div>
        );
      case 'main_cashier_not_open':
        return (
          <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-orange-700 text-sm">{t('pos_opening.main_cashier_not_open')}</p>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading && !context) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <Spinner message={t('pos_opening.loading')} />
      </div>
    );
  }

  const showProfileSelect = (context?.allowed_profiles.length ?? 0) > 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Store className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('pos_opening.title')}
              </h1>
              <p className="text-sm text-gray-500">
                {t('pos_opening.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">
          {/* Session Details */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              {t('pos_opening.session_details')}
            </h2>

            <div className="flex flex-wrap gap-2">
              {context?.company && (
                <Badge variant="secondary" size="sm">
                  {t('pos_opening.company')}: {context.company}
                </Badge>
              )}
              {context?.branch && (
                <Badge variant="secondary" size="sm">
                  {t('pos_opening.branch')}: {context.branch}
                </Badge>
              )}
              {context?.restaurant && (
                <Badge variant="secondary" size="sm">
                  {t('pos_opening.restaurant')}: {context.restaurant}
                </Badge>
              )}
              {(context?.user || user?.full_name || user?.name) && (
                <Badge variant="secondary" size="sm">
                  {t('pos_opening.cashier')}: {context?.user_full_name || user?.full_name || user?.name}
                </Badge>
              )}
              <Badge variant="secondary" size="sm">
                {t('pos_opening.session_start')}: {sessionStart}
              </Badge>
            </div>

            {showProfileSelect ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  {t('pos_opening.pos_profile')}
                </label>
                <Select
                  value={context?.selected_profile || ''}
                  onValueChange={handleProfileChange}
                  disabled={isLoading || isSubmitting}
                  placeholder={t('pos_opening.select_profile')}
                >
                  {context?.allowed_profiles.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.label || profile.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            ) : (
              context?.selected_profile && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">{t('pos_opening.pos_profile')}:</span>
                  <Badge variant="info" size="sm">
                    {context.selected_profile}
                  </Badge>
                </div>
              )
            )}
          </section>

          {/* Opening Balance */}
          {context && context.payment_modes.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {t('pos_opening.opening_balance')}
                </h2>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(totalOpeningBalance)}
                </span>
              </div>

              <POSOpeningPaymentTable
                payments={balances}
                onChange={setBalances}
                disabled={isSubmitting || blockingError !== BLOCKING_ERROR_NONE}
              />
            </section>
          )}

          {/* Status / Alerts */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {renderBlockingMessage()}
        </div>

        {/* Actions */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full sm:w-auto sm:flex-1"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('pos_opening.opening')}
                </span>
              ) : (
                t('pos_opening.open_session')
              )}
            </Button>

            <Button
              onClick={() => loadContext(context?.selected_profile || undefined)}
              disabled={isLoading || isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('pos_opening.retry')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSOpeningScreen;
