import { useEffect, useState } from 'react';
import { checkPOSOpening, validatePOSClose } from '../lib/pos-opening-api';
import { usePOSStore } from '../store/pos-store';
import POSOpeningDialog from './POSOpeningDialog';
import { t } from '../i18n';
import { getErrorMessage } from '../lib/error-utils';

interface POSOpeningProviderProps {
  children: React.ReactNode;
}

type ValidationType = 'opening' | 'closing' | 'error' | null;

const POSOpeningProvider = ({ children }: POSOpeningProviderProps) => {
  const [validationType, setValidationType] = useState<ValidationType>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { posProfile } = usePOSStore();

  const checkPOSStatus = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // First check if POS is opened
      const openingResponse = await checkPOSOpening();
      if (openingResponse.message === 1) {
        // POS is not opened
        setValidationType('opening');
        return;
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
          // On error, show error state with retry instead of assuming failure
          setErrorMessage(getErrorMessage(error));
          setValidationType('error');
          return;
        }
      }

      // All validations passed
      setValidationType(null);
    } catch (error) {
      // Show error state with retry instead of assuming POS is not opened
      setErrorMessage(getErrorMessage(error));
      setValidationType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleRetry = () => {
    checkPOSStatus();
  };

  useEffect(() => {
    // Only check if we have the POS profile loaded
    if (posProfile) {
      checkPOSStatus();
    }
  }, [posProfile]);

  // Show loading state while checking
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

  // Show error state with retry button
  if (validationType === 'error' && errorMessage) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center p-8">
          <p className="text-red-600 mb-4">{errorMessage}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  // Show dialog if there's a validation issue
  if (validationType === 'opening' || validationType === 'closing') {
    return <POSOpeningDialog onReload={handleReload} type={validationType} />;
  }

  // Render children if all validations passed
  return <>{children}</>;
};

export default POSOpeningProvider; 