import { useEffect, useState } from 'react';
import { checkPOSOpening, validatePOSClose } from '../lib/pos-opening-api';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import POSOpeningDialog from './POSOpeningDialog';
import { t } from '../i18n';

interface POSOpeningProviderProps {
  children: React.ReactNode;
}

type ValidationType = 'opening' | 'closing' | null;

const POSOpeningProvider = ({ children }: POSOpeningProviderProps) => {
  const [validationType, setValidationType] = useState<ValidationType>(null);
  const [isLoading, setIsLoading] = useState(false);
  const posProfileFromPOS = usePOSStore((state) => state.posProfile);
  const posProfileFromRoot = useRootStore((state) => state.posProfile);
  const posProfile = posProfileFromPOS || posProfileFromRoot;

  const checkPOSStatus = async () => {
    try {
      setIsLoading(true);
      
      // First check if POS is opened
      const openingResponse = await checkPOSOpening();
      if (openingResponse?.message === 1) {
        // POS is not opened
        setValidationType('opening');
        return;
      }

      // If POS is opened, check if custom_daily_pos_close is enabled
      if (posProfile?.custom_daily_pos_close === 1 && posProfile.name) {
        try {
          const closeResponse = await validatePOSClose(posProfile.name);
          if (closeResponse?.message === 'Failed') {
            // Previous POS is not closed
            setValidationType('closing');
            return;
          }
        } catch (error) {
          console.error('Failed to validate POS close status:', error);
          if (navigator.onLine) {
            setValidationType('closing');
            return;
          }
        }
      }

      // All validations passed
      setValidationType(null);
    } catch (error) {
      console.warn('POS opening check status notice:', error);
      if (!navigator.onLine) {
        // Assume previously validated POS is still open when offline
        setValidationType(null);
      } else {
        // Do not permanently block UI if network check fails
        setValidationType(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  useEffect(() => {
    checkPOSStatus();
  }, [posProfile?.name]);

  // Show loading state while checking
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.checking_pos_status')}</p>
        </div>
      </div>
    );
  }

  // Show dialog if there's a validation issue
  if (validationType) {
    return <POSOpeningDialog onReload={handleReload} type={validationType} />;
  }

  // Render children if all validations passed
  return <>{children}</>;
};

export default POSOpeningProvider;
 