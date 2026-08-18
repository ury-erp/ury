import { useCallback, useEffect, useState } from 'react';
import { useKotErrorChannels } from '../lib/realtime';
import { showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { getProductionUnitsForBranch } from '../lib/production-api';

/**
 * KotAlertListener: A headless component that subscribes to all KOT error channels
 * for the current branch and displays toast notifications when errors occur.
 *
 * On mount, this component:
 * 1. Fetches the list of production units for the current branch
 * 2. Subscribes to the kot_error_<branch>_<production> channel for each production unit
 * 3. Shows a toast error when the backend broadcasts a KOT validation error
 *
 * Multiple production units are supported: a single POS terminal can serve multiple
 * production stations, so all channels are monitored simultaneously.
 */
const KotAlertListener: React.FC = () => {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch || '';

  const [productionUnits, setProductionUnits] = useState<string[]>([]);

  // Fetch production units on mount and when branch changes
  useEffect(() => {
    if (!branch) {
      setProductionUnits([]);
      return;
    }

    let isMounted = true;

    const loadProductionUnits = async () => {
      try {
        const units = await getProductionUnitsForBranch();
        if (isMounted) {
          setProductionUnits(units);
          if (units.length === 0) {
            console.warn(
              'KotAlertListener: no production units found for branch. ' +
              'KOT error monitoring will not be active.'
            );
          }
        }
      } catch (error) {
        console.error('KotAlertListener: failed to load production units:', error);
        if (isMounted) {
          setProductionUnits([]);
        }
      }
    };

    loadProductionUnits();

    return () => {
      isMounted = false;
    };
  }, [branch]);

  // Memoize error handler to avoid unnecessary re-subscriptions
  const handleKotError = useCallback((payload: Record<string, unknown>) => {
    // Extract error message from payload
    const message =
      (payload?.message as string) ||
      (payload?.error as string) ||
      'An unknown KOT error occurred';

    showToast.error(message);
  }, []);

  // Subscribe to all production unit channels
  useKotErrorChannels(branch, productionUnits, handleKotError);

  // This component has no visible UI
  return null;
};

export default KotAlertListener;
